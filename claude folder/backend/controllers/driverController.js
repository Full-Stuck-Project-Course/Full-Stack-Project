// controllers/driverController.js

const DriverProfile = require("../db/models/DriverProfile");
const User = require("../db/models/User");

// POST /drivers
async function registerDriver(req, res) {
    try {
        const { userId, licenseNumber, spokenLanguages, hobbies, preferredMusic, gender } = req.body;

        const existing = await DriverProfile.findOne({ userId });
        if (existing) return res.status(409).json({ error: "Driver profile already exists for this user" });

        const driver = await DriverProfile.create({
            userId, licenseNumber, spokenLanguages, hobbies, preferredMusic, gender
        });

        // Update user role
        await User.findByIdAndUpdate(userId, { role: "driver" });

        res.status(201).json({ message: "Driver registered successfully", driver });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /drivers
async function getAllDrivers(req, res) {
    try {
        const { status, isVerified } = req.query;
        const filter = {};
        if (status)     filter.status = status;
        if (isVerified !== undefined) filter.isVerified = isVerified === "true";

        const drivers = await DriverProfile.find(filter).populate("userId", "-passwordHash");
        res.status(200).json(drivers);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /drivers/available
async function getAvailableDrivers(req, res) {
    try {
        const drivers = await DriverProfile.find({ status: "available", isVerified: true })
            .populate("userId", "-passwordHash");
        res.status(200).json(drivers);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /drivers/:id
async function getDriverById(req, res) {
    try {
        const driver = await DriverProfile.findById(req.params.id).populate("userId", "-passwordHash");
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json(driver);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /drivers/:id
async function updateDriver(req, res) {
    try {
        const driver = await DriverProfile.findByIdAndUpdate(req.params.id, req.body, {
            new: true, runValidators: true
        });
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json({ message: "Driver updated successfully", driver });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /drivers/:id/status
async function updateDriverStatus(req, res) {
    try {
        const { status } = req.body;
        const driver = await DriverProfile.findByIdAndUpdate(
            req.params.id, { status }, { new: true, runValidators: true }
        );
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json({ message: "Status updated", driver });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /drivers/:id/location
async function updateLocation(req, res) {
    try {
        const { lat, lng } = req.body;
        const driver = await DriverProfile.findByIdAndUpdate(
            req.params.id,
            { currentLocation: { lat, lng } },
            { new: true }
        );
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json({ message: "Location updated", currentLocation: driver.currentLocation });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /drivers/:id/verify
async function verifyDriver(req, res) {
    try {
        const driver = await DriverProfile.findByIdAndUpdate(
            req.params.id, { isVerified: true }, { new: true }
        );
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json({ message: "Driver verified", driver });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    registerDriver, getAllDrivers, getAvailableDrivers,
    getDriverById, updateDriver, updateDriverStatus, updateLocation, verifyDriver
};
