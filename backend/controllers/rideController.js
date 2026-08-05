// controllers/rideController.js

const mongoose = require("mongoose");
const Ride = require("../db/models/Ride");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Vehicle = require("../db/models/Vehicle");
const User = require("../db/models/User");
const Payment = require("../db/models/payment");
const { calculateFare } = require("../utils/pricing");
const {
    sameId,
    isAdmin,
    getPassengerProfileForUser,
    getDriverProfileForUser,
    forbidden
} = require("../utils/authz");

const DISPATCH_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_RIDES_LIMIT = 50;
const MAX_RIDES_LIMIT = 100;
const ADMIN_RIDE_STATUSES = new Set([
    "searching",
    "accepted",
    "driver_arriving",
    "in_progress",
    "completed",
    "cancelled"
]);

function readyForDispatchFilter(date = new Date()) {
    return {
        $or: [
            { scheduledTime: null },
            { scheduledTime: { $lte: new Date(date.getTime() + DISPATCH_WINDOW_MS) } }
        ]
    };
}

async function canAccessRide(req, ride) {
    if (isAdmin(req)) return true;

    const [passenger, driver] = await Promise.all([
        getPassengerProfileForUser(req.user.userId),
        getDriverProfileForUser(req.user.userId)
    ]);

    return Boolean(
        (passenger && sameId(passenger._id, ride.passengerId)) ||
        (driver && sameId(driver._id, ride.driverId))
    );
}

async function getPopulatedRide(id) {
    return Ride.findById(id)
        .populate({
            path: "passengerId",
            populate: { path: "userId", select: "fullName profileImage preferredLanguage" }
        })
        .populate({
            path: "driverId",
            populate: { path: "userId", select: "fullName profileImage preferredLanguage" }
        })
        .populate("vehicleId");
}

// POST /rides
async function createRide(req, res) {
    try {
        let passengerId = req.body.passengerId;
        let passengerProfile = null;

        if (!isAdmin(req)) {
            passengerProfile = await getPassengerProfileForUser(req.user.userId);
            if (!passengerProfile) return res.status(400).json({ error: "Passenger profile not found" });
            passengerId = passengerProfile._id;
        } else if (passengerId) {
            passengerProfile = await PassengerProfile.findById(passengerId);
            if (!passengerProfile) return res.status(404).json({ error: "Passenger profile not found" });
        } else {
            passengerProfile = await PassengerProfile.findOneAndUpdate(
                { userId: req.user.userId },
                { $setOnInsert: { userId: req.user.userId } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );
            passengerId = passengerProfile._id;
        }

        const passengerCount = Number(req.body.passengerCount || 1);
        const rideType = req.body.rideType || "ride";
        if (rideType === "carpool" && passengerCount > 4) {
            return res.status(400).json({ error: "Carpool rides support up to 4 seats" });
        }

        const fare = calculateFare({
            pickupLocation: req.body.pickupLocation,
            destinationLocation: req.body.destinationLocation,
            vehicleType: req.body.vehicleType,
            rideType,
            passengerCount
        });

        const pointsToRedeem = Number(req.body.pointsToRedeem || 0);
        const originalFinalPrice = fare.finalPrice;
        let finalPrice = originalFinalPrice;
        let remainingPoints = undefined;
        let ride = null;

        const ridePayload = {
            passengerId,
            pickupLocation: req.body.pickupLocation,
            destinationLocation: req.body.destinationLocation,
            rideType,
            scheduledTime: req.body.scheduledTime || null,
            passengerCount,
            distanceKm: fare.distanceKm,
            estimatedDurationMinutes: fare.estimatedDurationMinutes,
            basePrice: fare.basePrice,
            surgeMultiplier: fare.surgeMultiplier,
            finalPrice,
            driverId: null,
            vehicleId: null,
            status: "searching"
        };

        const maxUsablePoints = Math.min(pointsToRedeem, Math.ceil(originalFinalPrice * 10));
        if (maxUsablePoints > 0) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    const updatedUser = await User.findOneAndUpdate(
                        { _id: passengerProfile.userId, loyaltyPoints: { $gte: maxUsablePoints } },
                        { $inc: { loyaltyPoints: -maxUsablePoints } },
                        { new: true, session }
                    );
                    if (!updatedUser) {
                        const error = new Error("Not enough points");
                        error.statusCode = 400;
                        throw error;
                    }

                    remainingPoints = updatedUser.loyaltyPoints;
                    const discountedFinalPrice = Math.max(0, Math.round((originalFinalPrice - maxUsablePoints * 0.1) * 10) / 10);
                    finalPrice = discountedFinalPrice;
                    const [createdRide] = await Ride.create([{ ...ridePayload, finalPrice: discountedFinalPrice }], { session });
                    ride = createdRide;
                });
            } finally {
                await session.endSession();
            }
        } else {
            ride = await Ride.create(ridePayload);
        }

        res.status(201).json({ message: "Ride created successfully", ride, remainingPoints });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
    }
}

function parsePagination(query = {}) {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const requestedLimit = Number.parseInt(query.limit, 10);
    const limit = Math.min(MAX_RIDES_LIMIT, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_RIDES_LIMIT));
    return {
        page,
        limit,
        skip: (page - 1) * limit
    };
}

function paginatedRides(items, pagination, total) {
    const totalPages = Math.max(1, Math.ceil(total / pagination.limit));
    return {
        items,
        pagination: {
            page: pagination.page,
            limit: pagination.limit,
            total,
            totalPages,
            hasNextPage: pagination.page < totalPages,
            hasPreviousPage: pagination.page > 1
        }
    };
}

// GET /rides
async function getAllRides(req, res) {
    try {
        const { status, rideType, driverId, passengerId } = req.query;
        const pagination = parsePagination(req.query);
        const filter = {};
        if (status)   filter.status = status;
        if (rideType) filter.rideType = rideType;

        if (isAdmin(req)) {
            if (driverId)    filter.driverId = driverId;
            if (passengerId) filter.passengerId = passengerId;
        } else {
            const [passenger, driver] = await Promise.all([
                getPassengerProfileForUser(req.user.userId),
                getDriverProfileForUser(req.user.userId)
            ]);

            if (driverId) {
                if (!driver || !sameId(driver._id, driverId)) return forbidden(res);
                filter.driverId = driver._id;
            } else if (passengerId) {
                if (!passenger || !sameId(passenger._id, passengerId)) return forbidden(res);
                filter.passengerId = passenger._id;
            } else if (status === "searching") {
                if (!driver || !driver.isVerified) return res.status(200).json(paginatedRides([], pagination, 0));
                if (!driver.acceptsCarpoolRides && rideType === "carpool") return res.status(200).json(paginatedRides([], pagination, 0));
                if (!driver.acceptsCarpoolRides && !rideType) filter.rideType = { $ne: "carpool" };
                Object.assign(filter, readyForDispatchFilter());
            } else {
                const ownFilters = [];
                if (passenger) ownFilters.push({ passengerId: passenger._id });
                if (driver) ownFilters.push({ driverId: driver._id });
                if (ownFilters.length === 0) return res.status(200).json(paginatedRides([], pagination, 0));
                filter.$or = ownFilters;
            }
        }

        const [rides, total] = await Promise.all([
            Ride.find(filter)
                .populate("passengerId")
                .populate("driverId")
                .populate("vehicleId")
                .sort({ createdAt: -1 })
                .skip(pagination.skip)
                .limit(pagination.limit),
            Ride.countDocuments(filter)
        ]);

        res.status(200).json(paginatedRides(rides, pagination, total));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /rides/:id
async function getRideById(req, res) {
    try {
        const ride = await getPopulatedRide(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);

        res.status(200).json(ride);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/accept
async function acceptRide(req, res) {
    try {
        let driverId = req.body.driverId;

        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver) return res.status(400).json({ error: "Driver profile not found" });
            driverId = driver._id;
        }

        const driver = await DriverProfile.findById(driverId);
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        if (!driver.isVerified) return res.status(403).json({ error: "Driver must be verified before accepting rides" });
        if (driver.status !== "available") return res.status(400).json({ error: "Driver must be available to accept rides" });

        const ridePreview = await Ride.findOne({
            _id: req.params.id,
            status: "searching",
            ...readyForDispatchFilter()
        });
        if (!ridePreview) {
            const existing = await Ride.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: "Ride not found" });
            if (existing.status !== "searching") return res.status(409).json({ error: "Ride is no longer available" });
            return res.status(400).json({ error: "Scheduled ride is not open for drivers yet" });
        }
        if (ridePreview.rideType === "carpool" && !driver.acceptsCarpoolRides) {
            return res.status(403).json({ error: "Driver does not accept carpool rides" });
        }

        let vehicleId = req.body.vehicleId || null;
        let vehicle = null;
        if (vehicleId) {
            vehicle = await Vehicle.findOne({ _id: vehicleId, driverId, isActive: true });
            if (!vehicle) return res.status(400).json({ error: "Vehicle does not belong to this driver" });
        } else {
            vehicle = await Vehicle.findOne({ driverId, isActive: true }).sort({ createdAt: -1 });
            vehicleId = vehicle?._id || null;
        }

        if (!vehicle) return res.status(400).json({ error: "Driver must have an active vehicle" });
        if (!vehicle.testApproval || !vehicle.insuranceApproval) {
            return res.status(403).json({ error: "Vehicle documents must be approved before accepting rides" });
        }
        if (vehicle.seats < ridePreview.passengerCount) {
            return res.status(400).json({ error: "Vehicle does not have enough seats for this ride" });
        }

        const claimedDriver = await DriverProfile.findOneAndUpdate(
            { _id: driverId, status: "available", isVerified: true },
            { status: "busy" },
            { new: true }
        );
        if (!claimedDriver) return res.status(409).json({ error: "Driver is no longer available" });

        const ride = await Ride.findOneAndUpdate(
            {
                _id: req.params.id,
                status: "searching",
                ...readyForDispatchFilter()
            },
            {
                $set: {
                    driverId,
                    vehicleId,
                    status: "accepted"
                }
            },
            { new: true, runValidators: true }
        );

        if (!ride) {
            await DriverProfile.findByIdAndUpdate(driverId, { status: "available" });
            const existing = await Ride.findById(req.params.id);
            if (!existing) return res.status(404).json({ error: "Ride not found" });
            if (existing.status !== "searching") return res.status(409).json({ error: "Ride is no longer available" });
            return res.status(400).json({ error: "Scheduled ride is not open for drivers yet" });
        }

        res.status(200).json({ message: "Ride accepted", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/start
async function startRide(req, res) {
    try {
        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver || !sameId(driver._id, ride.driverId)) return forbidden(res, "Only the assigned driver can start the ride");
        }
        if (ride.status !== "driver_arriving" && ride.status !== "accepted") {
            return res.status(400).json({ error: "Cannot start ride in current status" });
        }

        ride.status = "in_progress";
        ride.startedAt = new Date();
        await ride.save();

        res.status(200).json({ message: "Ride started", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/complete
async function completeRide(req, res) {
    try {
        const { finalPrice, distanceKm, durationMinutes, paymentMethod = "cash" } = req.body;

        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver || !sameId(driver._id, ride.driverId)) return forbidden(res, "Only the assigned driver can complete the ride");
        }
        if (ride.status !== "in_progress") return res.status(400).json({ error: "Ride is not in progress" });

        ride.status = "completed";
        ride.completedAt = new Date();
        if (isAdmin(req)) {
            if (finalPrice !== undefined && Number(finalPrice) >= 0) ride.finalPrice = Number(finalPrice);
            if (distanceKm !== undefined && Number(distanceKm) >= 0) ride.distanceKm = Number(distanceKm);
            if (durationMinutes !== undefined && Number(durationMinutes) >= 0) ride.estimatedDurationMinutes = Number(durationMinutes);
        }
        await ride.save();

        if (ride.driverId) {
            await DriverProfile.findByIdAndUpdate(ride.driverId, {
                $inc: { totalRides: 1, totalEarnings: ride.finalPrice || 0 },
                status: "available"
            });
        }

        await PassengerProfile.findByIdAndUpdate(ride.passengerId, {
            $inc: { totalRides: 1, totalSpent: ride.finalPrice || 0 }
        });

        const allowedPaymentMethods = ["credit_card", "paypal", "apple_pay", "google_pay", "cash"];
        const safePaymentMethod = allowedPaymentMethods.includes(paymentMethod) ? paymentMethod : "cash";
        await Payment.findOneAndUpdate(
            { rideId: ride._id },
            {
                $setOnInsert: {
                    rideId: ride._id,
                    passengerId: ride.passengerId,
                    driverId: ride.driverId,
                    amount: ride.finalPrice || 0,
                    currency: "ILS",
                    paymentMethod: safePaymentMethod,
                    paymentStatus: safePaymentMethod === "cash" ? "paid" : "pending",
                    paidAt: safePaymentMethod === "cash" ? new Date() : null
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        res.status(200).json({ message: "Ride completed", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/cancel
async function cancelRide(req, res) {
    try {
        const { cancellationReason } = req.body;

        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (["completed", "cancelled"].includes(ride.status)) {
            return res.status(400).json({ error: "Cannot cancel a finished ride" });
        }

        let cancelledBy = "passenger";
        if (isAdmin(req)) cancelledBy = req.body.cancelledBy || "system";
        else {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (driver && sameId(driver._id, ride.driverId)) cancelledBy = "driver";
        }

        ride.status = "cancelled";
        ride.cancelledAt = new Date();
        ride.cancelledBy = cancelledBy;
        ride.cancellationReason = cancellationReason || "";
        await ride.save();

        if (ride.driverId) {
            await DriverProfile.findByIdAndUpdate(ride.driverId, { status: "available" });
        }

        res.status(200).json({ message: "Ride cancelled", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/driver-arriving
async function driverArriving(req, res) {
    try {
        const ride = await Ride.findById(req.params.id);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver || !sameId(driver._id, ride.driverId)) return forbidden(res, "Only the assigned driver can update arrival");
        }
        if (ride.status !== "accepted") return res.status(400).json({ error: "Ride must be accepted first" });

        ride.status = "driver_arriving";
        await ride.save();

        res.status(200).json({ message: "Driver is arriving", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /rides/:id/admin
async function adminUpdateRide(req, res) {
    try {
        if (!isAdmin(req)) return forbidden(res, "Admin access required");

        const existing = await Ride.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Ride not found" });

        const update = {};
        if (req.body.status !== undefined) {
            if (!ADMIN_RIDE_STATUSES.has(req.body.status)) {
                return res.status(400).json({ error: "Invalid ride status" });
            }
            update.status = req.body.status;
            if (req.body.status === "completed" && !existing.completedAt) update.completedAt = new Date();
            if (req.body.status === "cancelled" && !existing.cancelledAt) {
                update.cancelledAt = new Date();
                update.cancelledBy = req.body.cancelledBy || "system";
            }
        }
        if (req.body.driverId !== undefined) update.driverId = req.body.driverId || null;
        if (req.body.vehicleId !== undefined) update.vehicleId = req.body.vehicleId || null;
        if (req.body.finalPrice !== undefined && Number(req.body.finalPrice) >= 0) update.finalPrice = Number(req.body.finalPrice);
        if (req.body.distanceKm !== undefined && Number(req.body.distanceKm) >= 0) update.distanceKm = Number(req.body.distanceKm);
        if (req.body.durationMinutes !== undefined && Number(req.body.durationMinutes) >= 0) {
            update.estimatedDurationMinutes = Number(req.body.durationMinutes);
        }
        if (req.body.cancellationReason !== undefined) update.cancellationReason = String(req.body.cancellationReason || "");

        const ride = await Ride.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true
        });
        if (!ride) return res.status(404).json({ error: "Ride not found" });

        if (update.driverId && ["accepted", "driver_arriving", "in_progress"].includes(ride.status)) {
            await DriverProfile.findByIdAndUpdate(update.driverId, { status: "busy" });
        }
        if (existing.driverId && ["completed", "cancelled", "searching"].includes(ride.status)) {
            await DriverProfile.findByIdAndUpdate(existing.driverId, { status: "available" });
        }

        res.status(200).json({ message: "Ride updated by admin", ride });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createRide, getAllRides, getRideById,
    acceptRide, startRide, completeRide, cancelRide, driverArriving, adminUpdateRide
};
