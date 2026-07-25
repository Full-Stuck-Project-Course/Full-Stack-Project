// controllers/rideController.js

const Ride = require("../db/models/Ride");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Vehicle = require("../db/models/Vehicle");
const User = require("../db/models/User");
const Payment = require("../db/models/payment");
const CarpoolRequest = require("../db/models/CarpoolRequest");
const { calculateFare } = require("../utils/pricing");
const {
    sameId,
    isAdmin,
    getPassengerProfileForUser,
    getDriverProfileForUser,
    forbidden
} = require("../utils/authz");

const DISPATCH_WINDOW_MS = 15 * 60 * 1000;

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
    let redeemedPoints = 0;
    let redeemedUserId = null;
    let redeemedPassengerProfileId = null;
    let createdRideId = null;
    try {
        let passengerId = req.body.passengerId;
        let passengerProfile = null;

        if (!isAdmin(req)) {
            passengerProfile = await getPassengerProfileForUser(req.user.userId);
            if (!passengerProfile) return res.status(400).json({ error: "Passenger profile not found" });
            passengerId = passengerProfile._id;
        } else if (!passengerId) {
            return res.status(400).json({ error: "passengerId is required for admin ride creation" });
        } else {
            passengerProfile = await PassengerProfile.findById(passengerId);
            if (!passengerProfile) return res.status(404).json({ error: "Passenger profile not found" });
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
        let finalPrice = fare.finalPrice;
        let remainingPoints = undefined;

        if (pointsToRedeem > 0) {
            const maxUsablePoints = Math.min(pointsToRedeem, Math.ceil(finalPrice * 10));
            const updatedUser = await User.findOneAndUpdate(
                { _id: passengerProfile.userId, loyaltyPoints: { $gte: maxUsablePoints } },
                { $inc: { loyaltyPoints: -maxUsablePoints } },
                { new: true }
            );
            if (!updatedUser) return res.status(400).json({ error: "Not enough points" });
            redeemedPoints = maxUsablePoints;
            redeemedUserId = passengerProfile.userId;
            redeemedPassengerProfileId = passengerId;
            remainingPoints = updatedUser.loyaltyPoints;
            finalPrice = Math.max(0, Math.round((finalPrice - redeemedPoints * 0.1) * 10) / 10);
        }

        const ride = await Ride.create({
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
        });
        createdRideId = ride._id;

        if (redeemedPoints > 0) {
            await PassengerProfile.findByIdAndUpdate(passengerId, { loyaltyPoints: remainingPoints });
        }

        if (ride.rideType === "carpool") {
            await CarpoolRequest.create({
                passengerId,
                rideId: ride._id,
                pickupLocation: ride.pickupLocation,
                destinationLocation: ride.destinationLocation,
                requestedTime: ride.scheduledTime || new Date(),
                seatsNeeded: ride.passengerCount,
                status: "confirmed",
                pricePerSeat: fare.pricePerPerson
            });
        }

        res.status(201).json({ message: "Ride created successfully", ride, remainingPoints });
    } catch (error) {
        if (createdRideId) {
            await Ride.findByIdAndDelete(createdRideId).catch(() => {});
        }
        if (redeemedPoints > 0 && redeemedUserId) {
            const refundedUser = await User.findByIdAndUpdate(
                redeemedUserId,
                { $inc: { loyaltyPoints: redeemedPoints } },
                { new: true }
            ).catch(() => null);
            if (refundedUser && redeemedPassengerProfileId) {
                await PassengerProfile.findByIdAndUpdate(
                    redeemedPassengerProfileId,
                    { loyaltyPoints: refundedUser.loyaltyPoints }
                ).catch(() => {});
            }
        }
        res.status(400).json({ error: error.message });
    }
}

// GET /rides
async function getAllRides(req, res) {
    try {
        const { status, rideType, driverId, passengerId } = req.query;
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
                if (!driver || !driver.isVerified) return res.status(200).json([]);
                if (!driver.acceptsCarpoolRides && rideType === "carpool") return res.status(200).json([]);
                if (!driver.acceptsCarpoolRides && !rideType) filter.rideType = { $ne: "carpool" };
                Object.assign(filter, readyForDispatchFilter());
            } else {
                const ownFilters = [];
                if (passenger) ownFilters.push({ passengerId: passenger._id });
                if (driver) ownFilters.push({ driverId: driver._id });
                if (ownFilters.length === 0) return res.status(200).json([]);
                filter.$or = ownFilters;
            }
        }

        const rides = await Ride.find(filter)
            .populate("passengerId")
            .populate("driverId")
            .populate("vehicleId")
            .sort({ createdAt: -1 });

        res.status(200).json(rides);
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

module.exports = {
    createRide, getAllRides, getRideById,
    acceptRide, startRide, completeRide, cancelRide, driverArriving
};
