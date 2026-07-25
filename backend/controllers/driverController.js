// controllers/driverController.js

const DriverProfile = require("../db/models/DriverProfile");
const User = require("../db/models/User");
const { isAdmin, canAccessDriver, forbidden } = require("../utils/authz");
const { hasValidCoordinates } = require("../utils/pricing");

const DRIVER_UPDATE_FIELDS = [
    "licenseNumber",
    "spokenLanguages",
    "hobbies",
    "preferredMusic",
    "gender",
    "licenseExpiry",
    "acceptsCarpoolRides",
    "vehicleConditions"
];

// POST /drivers
async function registerDriver(req, res) {
    try {
        const userId = isAdmin(req) && req.body.userId ? req.body.userId : req.user.userId;
        const {
            licenseNumber,
            spokenLanguages,
            hobbies,
            preferredMusic,
            gender,
            licenseExpiry,
            acceptsCarpoolRides,
            vehicleConditions
        } = req.body;

        const existing = await DriverProfile.findOne({ userId });
        if (existing) return res.status(409).json({ error: "Driver profile already exists for this user" });

        const driver = await DriverProfile.create({
            userId,
            licenseNumber,
            spokenLanguages,
            hobbies,
            preferredMusic,
            gender,
            licenseExpiry,
            acceptsCarpoolRides,
            vehicleConditions
        });

        const existingUser = await User.findById(userId);
        const newRole = (existingUser?.role === "passenger" || existingUser?.role === "both") ? "both" : "driver";
        await User.findByIdAndUpdate(userId, { role: newRole });

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
        if (!isAdmin(req)) filter.userId = req.user.userId;

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
            .select("userId ratingAverage totalRides currentLocation status")
            .populate("userId", "fullName");
        const sanitized = drivers.map(driver => ({
            _id: driver._id,
            userId: driver.userId,
            ratingAverage: driver.ratingAverage,
            totalRides: driver.totalRides,
            status: driver.status,
            currentLocation: hasValidCoordinates(driver.currentLocation?.lat, driver.currentLocation?.lng)
                ? {
                    lat: Math.round(Number(driver.currentLocation.lat) * 1000) / 1000,
                    lng: Math.round(Number(driver.currentLocation.lng) * 1000) / 1000,
                    updatedAt: driver.currentLocation.updatedAt
                }
                : null
        }));
        res.status(200).json(sanitized);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /drivers/:id
async function getDriverById(req, res) {
    try {
        if (!await canAccessDriver(req, req.params.id)) {
            return forbidden(res);
        }
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
        if (!await canAccessDriver(req, req.params.id)) {
            return forbidden(res);
        }
        const update = {};
        for (const key of DRIVER_UPDATE_FIELDS) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }
        if (req.body.licenseNumber !== undefined) {
            update.isVerified = false;
            update.verificationStatus = "pending";
            update.status = "offline";
        }
        const driver = await DriverProfile.findByIdAndUpdate(req.params.id, update, {
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
        if (!await canAccessDriver(req, req.params.id)) {
            return forbidden(res);
        }
        if (status === "available") {
            const driverCheck = await DriverProfile.findById(req.params.id);
            if (driverCheck && !driverCheck.isVerified) {
                return res.status(403).json({ error: "Driver must be verified before becoming available" });
            }
        }
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
        if (!await canAccessDriver(req, req.params.id)) {
            return forbidden(res);
        }
        if (!hasValidCoordinates(lat, lng)) {
            return res.status(400).json({ error: "Invalid driver location" });
        }
        const driver = await DriverProfile.findByIdAndUpdate(
            req.params.id,
            { currentLocation: { lat: Number(lat), lng: Number(lng), updatedAt: new Date() } },
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
            req.params.id, { isVerified: true, verificationStatus: "approved" }, { new: true }
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
