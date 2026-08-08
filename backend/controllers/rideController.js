// controllers/rideController.js

const mongoose = require("mongoose");
const Ride = require("../db/models/Ride");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Vehicle = require("../db/models/Vehicle");
const User = require("../db/models/User");
const Payment = require("../db/models/payment");
const { calculateFare, haversineKm, hasValidCoordinates } = require("../utils/pricing");
const {
    normalizeAllowances,
    normalizeDriverGender,
    normalizeMinRating,
    normalizeVehicleType
} = require("../utils/driverDiscovery");
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
const LOYALTY_POINT_VALUE_ILS = 0.1;
const ADMIN_RIDE_STATUSES = new Set([
    "searching",
    "accepted",
    "driver_arriving",
    "in_progress",
    "completed",
    "cancelled"
]);

const MIN_DRIVER_DISTANCE_KM = 1;
const MAX_DRIVER_DISTANCE_KM = 25;

const ALLOWANCE_LABELS = {
    pets: "pets",
    smoking: "smoking",
    food: "food and drink"
};

const DRIVER_RESTRICTION_KEYS = {
    pets: "noPets",
    smoking: "noSmoking",
    food: "noFood"
};

function clampDriverDistanceKm(value) {
    const distance = Number(value);
    if (!Number.isFinite(distance)) return null;
    return Math.min(MAX_DRIVER_DISTANCE_KM, Math.max(MIN_DRIVER_DISTANCE_KM, distance));
}

// Checks a driver and their vehicle against the preferences the passenger chose
// when booking. Returns null when the driver is a match.
function driverPreferenceMismatch(ride, driver, vehicle) {
    if (ride.preferredDriverGender && driver.gender !== ride.preferredDriverGender) {
        return {
            statusCode: 403,
            error: "This passenger requested a driver of a different gender"
        };
    }

    if (ride.vehicleType && vehicle.vehicleType !== ride.vehicleType) {
        return {
            statusCode: 400,
            error: `This ride was booked and priced for a ${ride.vehicleType} vehicle`
        };
    }

    if (ride.maxDriverDistanceKm &&
        hasValidCoordinates(driver.currentLocation?.lat, driver.currentLocation?.lng) &&
        hasValidCoordinates(ride.pickupLocation?.lat, ride.pickupLocation?.lng)) {
        const distanceKm = haversineKm(ride.pickupLocation, driver.currentLocation);
        if (distanceKm > ride.maxDriverDistanceKm) {
            return {
                statusCode: 400,
                error: `Driver is ${distanceKm.toFixed(1)} km away, beyond the ${ride.maxDriverDistanceKm} km the passenger allowed`
            };
        }
    }

    if (ride.minDriverRating && Number(driver.ratingAverage) < ride.minDriverRating) {
        return {
            statusCode: 403,
            error: `This passenger asked for a driver rated ${ride.minDriverRating} or above`
        };
    }

    for (const [key, label] of Object.entries(ALLOWANCE_LABELS)) {
        if (!ride.requiredAllowances?.[key]) continue;
        if (driver.vehicleConditions?.[DRIVER_RESTRICTION_KEYS[key]] === true) {
            return { statusCode: 403, error: `This passenger needs a driver who allows ${label}` };
        }
    }

    return null;
}

// Completing a ride opens the payment rather than settling it, so the passenger
// still sees the card screen. Approval happens when that form is submitted, with
// no payment provider and no human reviewer involved. An existing paid or
// refunded payment is left exactly as it is.
async function openPaymentForRide(ride) {
    return Payment.findOneAndUpdate(
        { rideId: ride._id },
        {
            $setOnInsert: {
                rideId: ride._id,
                passengerId: ride.passengerId,
                driverId: ride.driverId,
                amount: ride.finalPrice || 0,
                currency: "ILS",
                paymentMethod: "credit_card",
                paymentStatus: "pending",
                paidAt: null
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    );
}

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

function positiveNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) && number > 0 ? number : 0;
}

function getMaxRedeemableLoyaltyPoints(requestedPoints, ridePrice) {
    const requested = Math.floor(positiveNumber(requestedPoints));
    const priceCap = Math.ceil(positiveNumber(ridePrice) / LOYALTY_POINT_VALUE_ILS);
    return Math.min(requested, priceCap);
}

function maybeWithSession(queryOrValue, session) {
    if (session && queryOrValue && typeof queryOrValue.session === "function") {
        return queryOrValue.session(session);
    }
    return queryOrValue;
}

async function getPassengerUserId(passengerId, session) {
    const passenger = await maybeWithSession(PassengerProfile.findById(passengerId), session);
    return passenger?.userId || null;
}

async function refundRedeemedLoyaltyPoints(ride, session) {
    const pointsToRefund = positiveNumber(ride.loyaltyPointsRedeemed);
    if (pointsToRefund === 0 || ride.loyaltyPointsRefunded) {
        return { ride, remainingPoints: undefined };
    }

    const userId = ride.loyaltyRedemptionUserId || await getPassengerUserId(ride.passengerId, session);
    if (!userId) {
        const error = new Error("Cannot refund loyalty points without passenger user");
        error.statusCode = 400;
        throw error;
    }

    const refundedAt = new Date();
    const markedRide = await Ride.findOneAndUpdate(
        {
            _id: ride._id,
            loyaltyPointsRedeemed: { $gt: 0 },
            loyaltyPointsRefunded: { $ne: true }
        },
        {
            $set: {
                loyaltyPointsRefunded: true,
                loyaltyPointsRefundedAt: refundedAt,
                loyaltyRedemptionUserId: userId
            }
        },
        { new: true, runValidators: true, session }
    );
    if (!markedRide) return { ride, remainingPoints: undefined };

    const updatedUser = await User.findByIdAndUpdate(
        userId,
        { $inc: { loyaltyPoints: positiveNumber(markedRide.loyaltyPointsRedeemed) } },
        { new: true, session }
    );
    if (!updatedUser) {
        const error = new Error("Cannot refund loyalty points without user");
        error.statusCode = 400;
        throw error;
    }

    return { ride: markedRide, remainingPoints: updatedUser.loyaltyPoints };
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

        // Driver-matching preferences. These are enforced in acceptRide, so a
        // passenger's choice actually restricts who can take the ride.
        const vehicleType = normalizeVehicleType(req.body.vehicleType);
        const preferredDriverGender = normalizeDriverGender(req.body.preferredDriverGender);
        const maxDriverDistanceKm = clampDriverDistanceKm(req.body.maxDriverDistanceKm);
        const minDriverRating = normalizeMinRating(req.body.minDriverRating);
        const requestedAllowances = normalizeAllowances(req.body.requiredAllowances);
        const requiredAllowances = {
            pets: Boolean(requestedAllowances.pets),
            smoking: Boolean(requestedAllowances.smoking),
            food: Boolean(requestedAllowances.food)
        };

        const pointsToRedeem = Math.floor(positiveNumber(req.body.pointsToRedeem));
        const originalFinalPrice = fare.finalPrice;
        let finalPrice = originalFinalPrice;
        let remainingPoints = undefined;
        let ride = null;
        const maxUsablePoints = getMaxRedeemableLoyaltyPoints(pointsToRedeem, originalFinalPrice);

        const ridePayload = {
            passengerId,
            pickupLocation: req.body.pickupLocation,
            destinationLocation: req.body.destinationLocation,
            rideType,
            scheduledTime: req.body.scheduledTime || null,
            passengerCount,
            vehicleType,
            preferredDriverGender,
            maxDriverDistanceKm,
            minDriverRating,
            requiredAllowances,
            distanceKm: fare.distanceKm,
            estimatedDurationMinutes: fare.estimatedDurationMinutes,
            basePrice: fare.basePrice,
            surgeMultiplier: fare.surgeMultiplier,
            finalPrice,
            loyaltyPointsRedeemed: maxUsablePoints,
            loyaltyRedemptionUserId: maxUsablePoints > 0 ? passengerProfile.userId : null,
            loyaltyPointsRefunded: false,
            loyaltyPointsRefundedAt: null,
            driverId: null,
            vehicleId: null,
            status: "searching"
        };

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
                    const discountedFinalPrice = Math.max(0, Math.round((originalFinalPrice - maxUsablePoints * LOYALTY_POINT_VALUE_ILS) * 10) / 10);
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

        const mismatch = driverPreferenceMismatch(ridePreview, driver, vehicle);
        if (mismatch) return res.status(mismatch.statusCode).json({ error: mismatch.error });

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
                    status: "driver_arriving"
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

        res.status(200).json({ message: "Ride accepted; driver is arriving", ride });
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
        const { finalPrice, distanceKm, durationMinutes } = req.body;

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

        await openPaymentForRide(ride);

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

        let cancelledRide = ride;
        let remainingPoints = undefined;
        const cancellationUpdate = {
            status: "cancelled",
            cancelledAt: new Date(),
            cancelledBy,
            cancellationReason: cancellationReason || ""
        };
        const shouldRefundLoyalty = positiveNumber(ride.loyaltyPointsRedeemed) > 0 && !ride.loyaltyPointsRefunded;

        if (shouldRefundLoyalty) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    cancelledRide = await Ride.findOneAndUpdate(
                        { _id: req.params.id, status: { $nin: ["completed", "cancelled"] } },
                        { $set: cancellationUpdate },
                        { new: true, runValidators: true, session }
                    );
                    if (!cancelledRide) {
                        const error = new Error("Ride is no longer cancellable");
                        error.statusCode = 409;
                        throw error;
                    }

                    const refund = await refundRedeemedLoyaltyPoints(cancelledRide, session);
                    cancelledRide = refund.ride;
                    remainingPoints = refund.remainingPoints;

                    if (cancelledRide.driverId) {
                        await DriverProfile.findByIdAndUpdate(cancelledRide.driverId, { status: "available" }, { session });
                    }
                });
            } finally {
                await session.endSession();
            }
        } else {
            ride.status = cancellationUpdate.status;
            ride.cancelledAt = cancellationUpdate.cancelledAt;
            ride.cancelledBy = cancellationUpdate.cancelledBy;
            ride.cancellationReason = cancellationUpdate.cancellationReason;
            await ride.save();

            if (ride.driverId) {
                await DriverProfile.findByIdAndUpdate(ride.driverId, { status: "available" });
            }
        }

        res.status(200).json({ message: "Ride cancelled", ride: cancelledRide, remainingPoints });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
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

        let ride;
        let remainingPoints = undefined;
        const shouldRefundLoyalty = update.status === "cancelled" &&
            positiveNumber(existing.loyaltyPointsRedeemed) > 0 &&
            !existing.loyaltyPointsRefunded;

        if (shouldRefundLoyalty) {
            const session = await mongoose.startSession();
            try {
                await session.withTransaction(async () => {
                    ride = await Ride.findByIdAndUpdate(req.params.id, update, {
                        new: true,
                        runValidators: true,
                        session
                    });
                    if (!ride) {
                        const error = new Error("Ride not found");
                        error.statusCode = 404;
                        throw error;
                    }

                    const refund = await refundRedeemedLoyaltyPoints(ride, session);
                    ride = refund.ride;
                    remainingPoints = refund.remainingPoints;

                    if (update.driverId && ["accepted", "driver_arriving", "in_progress"].includes(ride.status)) {
                        await DriverProfile.findByIdAndUpdate(update.driverId, { status: "busy" }, { session });
                    }
                    if (existing.driverId && ["completed", "cancelled", "searching"].includes(ride.status)) {
                        await DriverProfile.findByIdAndUpdate(existing.driverId, { status: "available" }, { session });
                    }
                });
            } finally {
                await session.endSession();
            }

            return res.status(200).json({ message: "Ride updated by admin", ride, remainingPoints });
        }

        ride = await Ride.findByIdAndUpdate(req.params.id, update, {
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

        res.status(200).json({ message: "Ride updated by admin", ride, remainingPoints });
    } catch (error) {
        res.status(error.statusCode || 400).json({ error: error.message });
    }
}

module.exports = {
    createRide, getAllRides, getRideById,
    acceptRide, startRide, completeRide, cancelRide, driverArriving, adminUpdateRide
};
