// controllers/rideController.js

const mongoose = require("mongoose");
const Ride = require("../db/models/Ride");
const CarpoolRequest = require("../db/models/CarpoolRequest");
const DriverProfile = require("../db/models/DriverProfile");
const Notification = require("../db/models/Notification");
const PassengerProfile = require("../db/models/PassengerProfile");
const Vehicle = require("../db/models/Vehicle");
const User = require("../db/models/User");
const Payment = require("../db/models/payment");
const { activeBookingConflict, findActiveBookingForPassenger } = require("../utils/activeBooking");
const { findUnresolvedPaymentForPassenger, unresolvedPaymentConflict } = require("../utils/unresolvedPayments");
const { haversineKm, hasValidCoordinates } = require("../utils/pricing");
const { calculateFareForRoute } = require("../utils/routePricing");
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
const CARPOOL_RIDE_SEAT_STATUSES = ["matched", "confirmed", "completed"];

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

// Which side of the ride is confirming completion. Admin outranks both so a
// disputed ride can still be settled.
async function completionActorFor(req, ride) {
    if (isAdmin(req)) return { side: "admin" };

    const [driver, passenger] = await Promise.all([
        getDriverProfileForUser(req.user.userId),
        getPassengerProfileForUser(req.user.userId)
    ]);

    if (driver && sameId(driver._id, ride.driverId)) return { side: "driver" };
    if (passenger && ride.rideType === "carpool") {
        const seat = await CarpoolRequest.findOne({
            rideId: ride._id,
            passengerId: passenger._id,
            status: { $in: CARPOOL_RIDE_SEAT_STATUSES }
        });
        if (seat) return { side: "carpool_passenger", passengerId: passenger._id, seat };
    }
    if (passenger && sameId(passenger._id, ride.passengerId)) {
        return { side: "passenger", passengerId: passenger._id };
    }
    return { side: null };
}

async function carpoolCompletionSeatsForRide(rideId) {
    return CarpoolRequest.find({
        rideId,
        status: { $in: CARPOOL_RIDE_SEAT_STATUSES }
    });
}

async function markCarpoolPassengerCompleted(seat, now) {
    if (!seat) return seat;
    if (seat.passengerCompletedAt && seat.status === "completed") return seat;

    const updatedSeat = await CarpoolRequest.findByIdAndUpdate(
        seat._id,
        { $set: { passengerCompletedAt: seat.passengerCompletedAt || now, status: "completed" } },
        { new: true, runValidators: true }
    );

    return updatedSeat || { ...seat, passengerCompletedAt: seat.passengerCompletedAt || now, status: "completed" };
}

function allCarpoolPassengersConfirmed(seats) {
    return seats.length > 0 && seats.every(seat => Boolean(seat.passengerCompletedAt));
}

// Nudges whoever still has to confirm. The confirmation is already saved, so a
// failure here must not fail the request.
async function notifyCompletionConfirmation(req, ride, confirmedBy) {
    try {
        const waitingOn = ride.driverCompletedAt ? "passenger" : "driver";
        const [passenger, driver] = await Promise.all([
            PassengerProfile.findById(ride.passengerId).select("userId"),
            ride.driverId ? DriverProfile.findById(ride.driverId).select("userId") : null
        ]);

        const targetUserId = waitingOn === "passenger" ? passenger?.userId : driver?.userId;
        if (!targetUserId) return;

        const notification = await Notification.create({
            userId: targetUserId,
            type: "ride_completed",
            title: "אישור סיום נסיעה",
            body: confirmedBy === "driver"
                ? "הנהג סימן שהנסיעה הסתיימה. אשר גם אתה כדי לסגור אותה."
                : "הנוסע סימן שהנסיעה הסתיימה. אשר גם אתה כדי לסגור אותה.",
            rideId: ride._id
        });

        const io = req.app?.get?.("io");
        if (io) {
            io.to(`ride:${ride._id}`).emit("completion-confirmation", {
                rideId: ride._id,
                confirmedBy,
                awaiting: waitingOn
            });
            io.to(`user:${targetUserId}`).emit("completion-confirmation", {
                rideId: ride._id,
                confirmedBy,
                awaiting: waitingOn,
                notification
            });
        }
    } catch (error) {
        console.warn("Could not send completion confirmation notice:", error.message);
    }
}

// Completing a ride opens the payment rather than settling it, so the passenger
// still sees the card screen. Approval happens when that form is submitted, with
// no payment provider and no human reviewer involved. An existing paid or
// refunded payment is left exactly as it is.
function carpoolSeatAmount(seat, ride) {
    const finalPrice = Number(seat?.finalPrice);
    if (Number.isFinite(finalPrice) && finalPrice >= 0) return finalPrice;

    const pricePerSeat = Number(seat?.pricePerSeat);
    const seatsNeeded = Number(seat?.seatsNeeded || 1);
    if (Number.isFinite(pricePerSeat) && pricePerSeat >= 0) {
        return Number((pricePerSeat * seatsNeeded).toFixed(2));
    }

    return Number(ride?.finalPrice || 0);
}

async function carpoolSeatsForRide(rideId, statuses = CARPOOL_RIDE_SEAT_STATUSES) {
    const query = CarpoolRequest.find({
        rideId,
        status: { $in: statuses }
    });

    if (query && typeof query.populate === "function") {
        return query
            .populate({
                path: "passengerId",
                populate: { path: "userId", select: "fullName profileImage preferredLanguage" }
            })
            .sort({ createdAt: 1 });
    }

    return query || [];
}

function passengerPaymentRowForCarpoolSeat(seat, ride) {
    const passengerId = seat?.passengerId?._id || seat?.passengerId;
    if (!passengerId) return null;
    return {
        passengerId,
        amount: carpoolSeatAmount(seat, ride)
    };
}

async function passengerPaymentRowsForRide(ride) {
    if (ride?.rideType !== "carpool") {
        return [{
            passengerId: ride.passengerId,
            amount: Number(ride.finalPrice || 0)
        }];
    }

    const seats = await carpoolSeatsForRide(ride._id);
    const rows = (seats || [])
        .map(seat => passengerPaymentRowForCarpoolSeat(seat, ride))
        .filter(Boolean);

    const primaryPassengerId = ride.passengerId?._id || ride.passengerId;
    const hasPrimarySeat = rows.some(row => sameId(row.passengerId, primaryPassengerId));
    if (primaryPassengerId && !hasPrimarySeat) {
        rows.unshift({
            passengerId: primaryPassengerId,
            amount: Number(ride.finalPrice || 0)
        });
    }

    return rows;
}

async function openPaymentForRide(ride, passengerPaymentRows = null) {
    const rows = passengerPaymentRows || await passengerPaymentRowsForRide(ride);
    return Promise.all(rows.map(row => Payment.findOneAndUpdate(
        { rideId: ride._id, passengerId: row.passengerId },
        {
            $setOnInsert: {
                rideId: ride._id,
                passengerId: row.passengerId,
                driverId: ride.driverId,
                amount: row.amount,
                currency: "ILS",
                paymentMethod: "credit_card",
                paymentStatus: "pending",
                paidAt: null
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    )));
}

// Carpool seats outlive the request queue, so a ride that ends has to release
// the riders who joined it — otherwise their booking stays open forever and
// they can never book again.
async function settleCarpoolSeats(ride, status) {
    if (ride?.rideType !== "carpool") return;
    try {
        await CarpoolRequest.updateMany(
            { rideId: ride._id, status: { $in: ["matched", "confirmed"] } },
            { status }
        );
    } catch (error) {
        console.warn("Could not settle carpool seats:", error.message);
    }
}

function readyForDispatchFilter(date = new Date()) {
    return {
        $or: [
            { scheduledTime: null },
            { scheduledTime: { $lte: new Date(date.getTime() + DISPATCH_WINDOW_MS) } }
        ]
    };
}

function uniqueIds(values) {
    return [...new Set((values || [])
        .map(value => value?._id || value)
        .filter(Boolean)
        .map(String))];
}

async function findCarpoolRideIdsForPassenger(passengerId) {
    const seats = await CarpoolRequest.find({
        passengerId,
        rideId: { $ne: null },
        status: { $in: CARPOOL_RIDE_SEAT_STATUSES }
    }).select("rideId");

    return uniqueIds(seats.map(seat => seat.rideId));
}

async function passengerRideFilters(passenger) {
    if (!passenger) return [];

    const filters = [{ passengerId: passenger._id }];
    const carpoolRideIds = await findCarpoolRideIdsForPassenger(passenger._id);
    if (carpoolRideIds.length > 0) {
        filters.push({ _id: { $in: carpoolRideIds } });
    }

    return filters;
}

async function canAccessRide(req, ride) {
    if (isAdmin(req)) return true;

    const [passenger, driver] = await Promise.all([
        getPassengerProfileForUser(req.user.userId),
        getDriverProfileForUser(req.user.userId)
    ]);

    if (passenger && sameId(passenger._id, ride.passengerId)) return true;
    if (driver && sameId(driver._id, ride.driverId)) return true;

    // A carpool ride carries one passengerId but can seat several passengers.
    // The riders who joined through a carpool request must see it too.
    if (passenger && ride.rideType === "carpool") {
        const seat = await CarpoolRequest.findOne({
            rideId: ride._id,
            passengerId: passenger._id,
            status: { $in: ["matched", "confirmed", "completed"] }
        });
        if (seat) return true;
    }

    return false;
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

function plainDocument(document) {
    if (!document) return document;
    return typeof document.toObject === "function" ? document.toObject() : { ...document };
}

async function rideResponseDocument(ride) {
    if (!ride || ride.rideType !== "carpool") return ride;

    const seats = await carpoolSeatsForRide(ride._id);
    const seatCount = (seats || []).reduce((sum, seat) => sum + Number(seat.seatsNeeded || 0), 0);
    const response = plainDocument(ride);

    response.carpoolPassengers = (seats || []).map(seat => ({
        requestId: seat._id,
        passengerId: seat.passengerId,
        seatsNeeded: Number(seat.seatsNeeded || 1),
        status: seat.status,
        passengerCompletedAt: seat.passengerCompletedAt || null,
        finalPrice: seat.finalPrice,
        pricePerSeat: seat.pricePerSeat
    }));
    response.passengerCount = Math.max(Number(response.passengerCount || 1), seatCount || 0);

    return response;
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

        // One booking at a time. Admins keep the override so support can still
        // place a ride for someone who is mid-trip.
        if (!isAdmin(req)) {
            const pendingPayment = await findUnresolvedPaymentForPassenger(passengerId);
            if (pendingPayment) return unresolvedPaymentConflict(res, pendingPayment);

            const activeBooking = await findActiveBookingForPassenger(passengerId);
            if (activeBooking) return activeBookingConflict(res, activeBooking);
        }

        const passengerCount = Number(req.body.passengerCount || 1);
        const rideType = req.body.rideType || "ride";
        if (rideType === "carpool" && passengerCount > 4) {
            return res.status(400).json({ error: "Carpool rides support up to 4 seats" });
        }

        const { fare } = await calculateFareForRoute({
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
                filter.$or = await passengerRideFilters(passenger);
            } else if (status === "searching") {
                if (!driver || !driver.isVerified) return res.status(200).json(paginatedRides([], pagination, 0));
                if (!driver.acceptsCarpoolRides && rideType === "carpool") return res.status(200).json(paginatedRides([], pagination, 0));
                if (!driver.acceptsCarpoolRides && !rideType) filter.rideType = { $ne: "carpool" };
                Object.assign(filter, readyForDispatchFilter());
            } else {
                const ownFilters = await passengerRideFilters(passenger);
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

        const responseRides = rides.some(ride => ride?.rideType === "carpool")
            ? await Promise.all(rides.map(rideResponseDocument))
            : rides;

        res.status(200).json(paginatedRides(responseRides, pagination, total));
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

        res.status(200).json(await rideResponseDocument(ride));
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
        if (ride.status !== "in_progress") return res.status(400).json({ error: "Ride is not in progress" });

        const actor = await completionActorFor(req, ride);
        if (!actor.side) return forbidden(res, "Only an approved ride passenger or the assigned driver can confirm completion");

        const now = new Date();
        if (actor.side === "driver" && !ride.driverCompletedAt) ride.driverCompletedAt = now;
        if (actor.side === "passenger" && !ride.passengerCompletedAt) ride.passengerCompletedAt = now;
        let completedCarpoolSeat = null;
        if (actor.side === "carpool_passenger") {
            completedCarpoolSeat = await markCarpoolPassengerCompleted(actor.seat, now);
        }
        // An admin settles a disputed ride on behalf of both sides.
        if (actor.side === "admin") {
            ride.driverCompletedAt = ride.driverCompletedAt || now;
            if (ride.rideType === "carpool") {
                await CarpoolRequest.updateMany(
                    { rideId: ride._id, status: { $in: CARPOOL_RIDE_SEAT_STATUSES }, passengerCompletedAt: null },
                    { $set: { passengerCompletedAt: now } }
                );
            } else {
                ride.passengerCompletedAt = ride.passengerCompletedAt || now;
            }
        }

        let passengerSideCompleted = Boolean(ride.passengerCompletedAt);
        if (ride.rideType === "carpool") {
            const completionSeats = await carpoolCompletionSeatsForRide(ride._id);
            passengerSideCompleted = completionSeats.length > 0
                ? allCarpoolPassengersConfirmed(completionSeats)
                : Boolean(ride.passengerCompletedAt);
            if (completionSeats.length > 0 && passengerSideCompleted && !ride.passengerCompletedAt) {
                ride.passengerCompletedAt = now;
            }
        }

        // Wait for the other side rather than finishing on one person's word.
        if (!ride.driverCompletedAt || !passengerSideCompleted) {
            await ride.save();
            if (actor.side === "carpool_passenger") {
                const row = passengerPaymentRowForCarpoolSeat(completedCarpoolSeat || actor.seat, ride);
                if (row) await openPaymentForRide(ride, [row]);
            }
            await notifyCompletionConfirmation(req, ride, actor.side === "carpool_passenger" ? "passenger" : actor.side);
            return res.status(200).json({
                message: "Completion confirmed; waiting for the other side",
                awaiting: ride.driverCompletedAt ? "passenger" : "driver",
                paymentReady: actor.side === "carpool_passenger",
                ride
            });
        }

        ride.status = "completed";
        ride.completedAt = now;
        if (isAdmin(req)) {
            if (finalPrice !== undefined && Number(finalPrice) >= 0) ride.finalPrice = Number(finalPrice);
            if (distanceKm !== undefined && Number(distanceKm) >= 0) ride.distanceKm = Number(distanceKm);
            if (durationMinutes !== undefined && Number(durationMinutes) >= 0) ride.estimatedDurationMinutes = Number(durationMinutes);
        }
        await ride.save();

        const passengerPaymentRows = await passengerPaymentRowsForRide(ride);
        const driverEarnings = passengerPaymentRows.reduce(
            (sum, row) => sum + Number(row.amount || 0),
            0
        );

        if (ride.driverId) {
            await DriverProfile.findByIdAndUpdate(ride.driverId, {
                $inc: { totalRides: 1, totalEarnings: driverEarnings },
                status: "available",
                lastActiveAt: now
            });
        }

        await Promise.all(passengerPaymentRows.map(row => PassengerProfile.findByIdAndUpdate(row.passengerId, {
            $inc: { totalRides: 1, totalSpent: Number(row.amount || 0) }
        })));

        await openPaymentForRide(ride, passengerPaymentRows);
        await settleCarpoolSeats(ride, "completed");

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

        await settleCarpoolSeats(cancelledRide, "cancelled");

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

            await settleCarpoolSeats(ride, "cancelled");
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
        if (["completed", "cancelled"].includes(update.status)) {
            await settleCarpoolSeats(ride, update.status);
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
