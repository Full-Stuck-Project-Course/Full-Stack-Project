// controllers/ratingController.js

const Rating = require("../db/models/rating");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");

// POST /ratings
async function createRating(req, res) {
    try {
        const { rideId, passengerId, driverId, rating, comment, complaint, tags, wouldRideAgain } = req.body;

        // Prevent duplicate rating for same ride
        const existing = await Rating.findOne({ rideId });
        if (existing) return res.status(409).json({ error: "Ride has already been rated" });

        const newRating = await Rating.create({
            rideId, passengerId, driverId, rating, comment, complaint, tags, wouldRideAgain
        });

        // Recalculate driver average rating
        const allRatings = await Rating.find({ driverId });
        const avg = allRatings.reduce((sum, r) => sum + r.rating, 0) / allRatings.length;
        await DriverProfile.findByIdAndUpdate(driverId, { ratingAverage: Math.round(avg * 10) / 10 });

        res.status(201).json({ message: "Rating submitted", rating: newRating });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /ratings
async function getAllRatings(req, res) {
    try {
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
