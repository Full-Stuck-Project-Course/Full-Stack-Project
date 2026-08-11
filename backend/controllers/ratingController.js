// controllers/ratingController.js

const Rating = require("../db/models/rating");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const CarpoolRequest = require("../db/models/CarpoolRequest");
const User = require("../db/models/User");
const Notification = require("../db/models/Notification");
const {
    sameId,
    isAdmin,
    getPassengerProfileForUser,
    getDriverProfileForUser,
    canAccessPassenger,
    canAccessDriver,
    forbidden
} = require("../utils/authz");

const {
    PASSENGER_TO_DRIVER,
    DRIVER_TO_PASSENGER
} = Rating.RATING_DIRECTIONS;

function getRatingDirection(direction) {
    return direction || PASSENGER_TO_DRIVER;
}

function ratingDirectionFilter(direction) {
    if (direction === PASSENGER_TO_DRIVER) {
        return {
            $or: [
                { direction: PASSENGER_TO_DRIVER },
                { direction: { $exists: false } }
            ]
        };
    }
    return { direction };
}

function scopedRatingQuery(base, direction) {
    return {
        ...base,
        ...ratingDirectionFilter(direction)
    };
}

function duplicateRatingMessage(direction) {
    return direction === DRIVER_TO_PASSENGER
        ? "Passenger has already been rated for this ride"
        : "Ride has already been rated";
}

async function authorizeRating(req, ride, direction) {
    if (isAdmin(req)) return true;

    if (direction === DRIVER_TO_PASSENGER) {
        const driver = await getDriverProfileForUser(req.user.userId);
        return driver && sameId(driver._id, ride.driverId);
    }

    const passenger = await getPassengerProfileForUser(req.user.userId);
    return passenger && sameId(passenger._id, ride.passengerId);
}

async function findCompletedCarpoolSeat(ride, passengerId) {
    if (ride?.rideType !== "carpool" || !passengerId) return null;
    return CarpoolRequest.findOne({
        rideId: ride._id,
        passengerId,
        status: "completed"
    });
}

async function resolveRatingParticipants(req, ride, direction) {
    const driverId = ride.driverId;
    if (!driverId) {
        const error = new Error("Ride has no assigned driver");
        error.statusCode = 400;
        throw error;
    }

    if (direction === DRIVER_TO_PASSENGER) {
        if (!await authorizeRating(req, ride, direction)) {
            const error = new Error("Only the assigned driver can rate this passenger");
            error.statusCode = 403;
            throw error;
        }

        const passengerId = req.body.passengerId || ride.passengerId;
        if (ride.rideType === "carpool" && !sameId(passengerId, ride.passengerId)) {
            const seat = await findCompletedCarpoolSeat(ride, passengerId);
            if (!seat) {
                const error = new Error("Passenger is not part of this completed carpool ride");
                error.statusCode = 400;
                throw error;
            }
        }

        return { passengerId, driverId };
    }

    if (isAdmin(req) && req.body.passengerId) {
        const passengerId = req.body.passengerId;
        if (ride.rideType === "carpool" && !sameId(passengerId, ride.passengerId)) {
            const seat = await findCompletedCarpoolSeat(ride, passengerId);
            if (!seat) {
                const error = new Error("Passenger is not part of this completed carpool ride");
                error.statusCode = 400;
                throw error;
            }
        }
        return { passengerId, driverId };
    }

    const passenger = await getPassengerProfileForUser(req.user.userId);
    if (passenger && sameId(passenger._id, ride.passengerId)) {
        return { passengerId: passenger._id, driverId };
    }

    if (passenger && ride.rideType === "carpool") {
        const seat = await findCompletedCarpoolSeat(ride, passenger._id);
        if (seat) return { passengerId: passenger._id, driverId };
    }

    const error = new Error("Only the passenger of this ride can rate it");
    error.statusCode = 403;
    throw error;
}

async function notifyAdminsAboutComplaint({ rideId, complaintText, direction }) {
    if (!complaintText) return;

    const admins = await User.find({ role: "admin", isActive: true }).select("_id");
    if (admins.length === 0) return;

    const title = direction === DRIVER_TO_PASSENGER
        ? "Passenger complaint"
        : "Ride complaint";
    const body = direction === DRIVER_TO_PASSENGER
        ? `Ride ${rideId}: driver reported a passenger issue - ${complaintText}`
        : `Ride ${rideId}: ${complaintText}`;

    await Notification.insertMany(admins.map(admin => ({
        userId: admin._id,
        type: "system",
        title,
        body,
        rideId
    }))).catch(() => {});
}

async function recalculateDriverRating(driverId) {
    const allRatings = await Rating.find(scopedRatingQuery({ driverId }, PASSENGER_TO_DRIVER));
    const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
    await DriverProfile.findByIdAndUpdate(driverId, { ratingAverage: Math.round(avg * 10) / 10 });
}

async function recalculatePassengerRating(passengerId) {
    const allRatings = await Rating.find(scopedRatingQuery({ passengerId }, DRIVER_TO_PASSENGER));
    const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
    await PassengerProfile.findByIdAndUpdate(passengerId, { ratingAverage: Math.round(avg * 10) / 10 });
}

async function awardPassengerRatingLoyaltyPoints(passengerId) {
    const passengerProfile = await PassengerProfile.findById(passengerId).select("userId");
    if (!passengerProfile) return;

    await User.findByIdAndUpdate(
        passengerProfile.userId,
        { $inc: { loyaltyPoints: 10 } },
        { new: true }
    );
}

// POST /ratings
async function createRating(req, res) {
    try {
        const { rideId, rating, comment, complaint, tags, wouldRideAgain } = req.body;
        const direction = getRatingDirection(req.body.direction);

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (ride.status !== "completed") {
            return res.status(400).json({ error: "Only completed rides can be rated" });
        }

        let participants;
        try {
            participants = await resolveRatingParticipants(req, ride, direction);
        } catch (authError) {
            if (authError.statusCode === 403) return forbidden(res, authError.message);
            return res.status(authError.statusCode || 400).json({ error: authError.message });
        }

        const { passengerId, driverId } = participants;

        // Prevent duplicate ratings in the same direction for the same rider.
        const existing = await Rating.findOne(scopedRatingQuery({ rideId, passengerId }, direction));
        if (existing) return res.status(409).json({ error: duplicateRatingMessage(direction) });

        const complaintText = String(complaint || "").trim().slice(0, 1000);
        const newRating = await Rating.create({
            rideId,
            passengerId,
            driverId,
            direction,
            rating,
            comment,
            complaint: complaintText || undefined,
            tags,
            wouldRideAgain
        });

        await notifyAdminsAboutComplaint({ rideId, complaintText, direction });

        if (direction === DRIVER_TO_PASSENGER) {
            await recalculatePassengerRating(passengerId);
        } else {
            await recalculateDriverRating(driverId);
            await awardPassengerRatingLoyaltyPoints(passengerId);
        }

        res.status(201).json({ message: "Rating submitted", rating: newRating });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: duplicateRatingMessage(getRatingDirection(req.body.direction)) });
        }
        res.status(400).json({ error: error.message });
    }
}

// GET /ratings
async function getAllRatings(req, res) {
    try {
        if (!isAdmin(req)) return forbidden(res, "Admin access required");
        const ratings = await Rating.find()
            .populate("rideId")
            .populate("passengerId")
            .populate("driverId");
        res.status(200).json(ratings);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /ratings/driver/:driverId
async function getRatingsByDriver(req, res) {
    try {
        if (!isAdmin(req) && !await canAccessDriver(req, req.params.driverId)) {
            return forbidden(res);
        }
        const ratings = await Rating.find(scopedRatingQuery({ driverId: req.params.driverId }, PASSENGER_TO_DRIVER))
            .populate("rideId")
            .populate("passengerId");
        res.status(200).json(ratings);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /ratings/passenger/:passengerId
async function getRatingsByPassenger(req, res) {
    try {
        if (!await canAccessPassenger(req, req.params.passengerId)) {
            return forbidden(res);
        }
        const ratings = await Rating.find(scopedRatingQuery({ passengerId: req.params.passengerId }, DRIVER_TO_PASSENGER))
            .populate("rideId")
            .populate("driverId");
        res.status(200).json(ratings);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /ratings/ride/:rideId
async function getRatingByRide(req, res) {
    try {
        const direction = getRatingDirection(req.query?.direction);
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!isAdmin(req)) {
            const [passenger, driver] = await Promise.all([
                getPassengerProfileForUser(req.user.userId),
                getDriverProfileForUser(req.user.userId)
            ]);
            const allowed = (passenger && sameId(passenger._id, ride.passengerId)) ||
                (driver && sameId(driver._id, ride.driverId));
            if (!allowed) return forbidden(res);
        }
        const rating = await Rating.findOne(scopedRatingQuery({ rideId: req.params.rideId }, direction))
            .populate("passengerId")
            .populate("driverId");
        if (!rating) return res.status(404).json({ error: "No rating found for this ride" });
        res.status(200).json(rating);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createRating, getAllRatings, getRatingsByDriver, getRatingsByPassenger, getRatingByRide
};
