// controllers/ratingController.js

const Rating = require("../db/models/rating");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
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

// POST /ratings
async function createRating(req, res) {
    try {
        const { rideId, rating, comment, complaint, tags, wouldRideAgain } = req.body;

        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (ride.status !== "completed") {
            return res.status(400).json({ error: "Only completed rides can be rated" });
        }

        if (!isAdmin(req)) {
            const passenger = await getPassengerProfileForUser(req.user.userId);
            if (!passenger || !sameId(passenger._id, ride.passengerId)) {
                return forbidden(res, "Only the passenger of this ride can rate it");
            }
        }

        const passengerId = ride.passengerId;
        const driverId = ride.driverId;
        if (!driverId) return res.status(400).json({ error: "Ride has no assigned driver" });

        // Prevent duplicate rating for same ride
        const existing = await Rating.findOne({ rideId });
        if (existing) return res.status(409).json({ error: "Ride has already been rated" });

        const complaintText = String(complaint || "").trim().slice(0, 1000);
        const newRating = await Rating.create({
            rideId,
            passengerId,
            driverId,
            rating,
            comment,
            complaint: complaintText || undefined,
            tags,
            wouldRideAgain
        });

        if (complaintText) {
            const admins = await User.find({ role: "admin", isActive: true }).select("_id");
            if (admins.length > 0) {
                await Notification.insertMany(admins.map(admin => ({
                    userId: admin._id,
                    type: "system",
                    title: "Ride complaint",
                    body: `Ride ${rideId}: ${complaintText}`,
                    rideId
                }))).catch(() => {});
            }
        }

        // Recalculate driver average rating
        const allRatings = await Rating.find({ driverId });
        const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
        await DriverProfile.findByIdAndUpdate(driverId, { ratingAverage: Math.round(avg * 10) / 10 });

        // Award loyalty points to passenger
        const passengerProfile = await PassengerProfile.findById(passengerId).select("userId");
        if (passengerProfile) {
            await User.findByIdAndUpdate(
                passengerProfile.userId,
                { $inc: { loyaltyPoints: 10 } },
                { new: true }
            );
        }

        res.status(201).json({ message: "Rating submitted", rating: newRating });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "Ride has already been rated" });
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
        const ratings = await Rating.find({ driverId: req.params.driverId })
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
        const ratings = await Rating.find({ passengerId: req.params.passengerId })
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
        const rating = await Rating.findOne({ rideId: req.params.rideId })
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
