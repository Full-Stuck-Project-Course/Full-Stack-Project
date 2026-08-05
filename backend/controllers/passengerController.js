// controllers/passengerController.js

const PassengerProfile = require("../db/models/PassengerProfile");
const { isAdmin, canAccessPassenger, forbidden } = require("../utils/authz");
const { hasValidCoordinates } = require("../utils/pricing");

const PASSENGER_UPDATE_FIELDS = ["preferredDriverGender", "preferredMatching"];

function withUserLoyaltyPoints(passenger) {
    const data = passenger?.toObject ? passenger.toObject() : passenger;
    if (!data) return data;
    const user = data.userId;
    data.loyaltyPoints = user && typeof user === "object" ? user.loyaltyPoints || 0 : 0;
    return data;
}

// POST /passengers
async function registerPassenger(req, res) {
    try {
        const userId = isAdmin(req) && req.body.userId ? req.body.userId : req.user.userId;
        const { preferredDriverGender, preferredMatching } = req.body;

        const existing = await PassengerProfile.findOne({ userId });
        if (existing) return res.status(409).json({ error: "Passenger profile already exists" });

        const passenger = await PassengerProfile.create({
            userId, preferredDriverGender, preferredMatching
        });
        await passenger.populate("userId", "-passwordHash");

        res.status(201).json({ message: "Passenger registered successfully", passenger: withUserLoyaltyPoints(passenger) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /passengers
async function getAllPassengers(req, res) {
    try {
        const filter = {};
        if (!isAdmin(req)) filter.userId = req.user.userId;

        const passengers = await PassengerProfile.find(filter).populate("userId", "-passwordHash");
        res.status(200).json(passengers.map(withUserLoyaltyPoints));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /passengers/:id
async function getPassengerById(req, res) {
    try {
        if (!await canAccessPassenger(req, req.params.id)) {
            return forbidden(res);
        }
        const passenger = await PassengerProfile.findById(req.params.id).populate("userId", "-passwordHash");
        if (!passenger) return res.status(404).json({ error: "Passenger not found" });
        res.status(200).json(withUserLoyaltyPoints(passenger));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /passengers/:id
async function updatePassenger(req, res) {
    try {
        if (!await canAccessPassenger(req, req.params.id)) {
            return forbidden(res);
        }
        const update = {};
        for (const key of PASSENGER_UPDATE_FIELDS) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }
        const passenger = await PassengerProfile.findByIdAndUpdate(req.params.id, update, {
            new: true, runValidators: true
        }).populate("userId", "-passwordHash");
        if (!passenger) return res.status(404).json({ error: "Passenger not found" });
        res.status(200).json({ message: "Passenger updated", passenger: withUserLoyaltyPoints(passenger) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /passengers/:id/saved-locations
async function addSavedLocation(req, res) {
    try {
        if (!await canAccessPassenger(req, req.params.id)) {
            return forbidden(res);
        }
        const { name, address, lat, lng } = req.body;
        if (!address || address.trim().length < 2) {
            return res.status(400).json({ error: "Address is required" });
        }
        if (!hasValidCoordinates(lat, lng)) {
            return res.status(400).json({ error: "Saved location coordinates are invalid" });
        }
        const passenger = await PassengerProfile.findByIdAndUpdate(
            req.params.id,
            { $push: { savedLocations: { name, address, lat: Number(lat), lng: Number(lng) } } },
            { new: true }
        );
        if (!passenger) return res.status(404).json({ error: "Passenger not found" });
        res.status(200).json({ message: "Location saved", savedLocations: passenger.savedLocations });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// DELETE /passengers/:id/saved-locations/:locationId
async function removeSavedLocation(req, res) {
    try {
        if (!await canAccessPassenger(req, req.params.id)) {
            return forbidden(res);
        }
        const passenger = await PassengerProfile.findByIdAndUpdate(
            req.params.id,
            { $pull: { savedLocations: { _id: req.params.locationId } } },
            { new: true }
        );
        if (!passenger) return res.status(404).json({ error: "Passenger not found" });
        res.status(200).json({ message: "Location removed", savedLocations: passenger.savedLocations });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    registerPassenger, getAllPassengers, getPassengerById,
    updatePassenger, addSavedLocation, removeSavedLocation
};
