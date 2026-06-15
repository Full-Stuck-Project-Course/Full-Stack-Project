// controllers/passengerController.js

const PassengerProfile = require("../db/models/PassengerProfile");
const User = require("../db/models/User");

// POST /passengers
async function registerPassenger(req, res) {
    try {
        const { userId, preferredDriverGender, preferredMatching } = req.body;

        const existing = await PassengerProfile.findOne({ userId });
        if (existing) return res.status(409).json({ error: "Passenger profile already exists" });

        const passenger = await PassengerProfile.create({
            userId, preferredDriverGender, preferredMatching
        });

        res.status(201).json({ message: "Passenger registered successfully", passenger });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /passengers
async function getAllPassengers(req, res) {
    try {
        const passengers = await PassengerProfile.find().populate("userId", "-passwordHash");
        res.status(200).json(passengers);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /passengers/:id
async function getPassengerById(req, res) {
    try {
        const passenger = await PassengerProfile.findById(req.params.id).populate("userId", "-passwordHash");
        if (!passenger) return res.status(404).json({ error: "Passenger not found" });
        res.status(200).json(passenger);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /passengers/:id
async function updatePassenger(req, res) {
    try {
        const passenger = await PassengerProfile.findByIdAndUpdate(req.params.id, req.body, {
            new: true, runValidators: true
        });
        if (!passenger) return res.status(404).json({ error: "Passenger not found" });
        res.status(200).json({ message: "Passenger updated", passenger });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /passengers/:id/saved-locations
async function addSavedLocation(req, res) {
    try {
        const { name, address, lat, lng } = req.body;
        const passenger = await PassengerProfile.findByIdAndUpdate(
            req.params.id,
            { $push: { savedLocations: { name, address, lat, lng } } },
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
