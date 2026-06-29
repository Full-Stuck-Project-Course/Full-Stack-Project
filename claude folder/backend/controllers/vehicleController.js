// controllers/vehicleController.js

const Vehicle = require("../db/models/Vehicle");
const DriverProfile = require("../db/models/DriverProfile");
const { isAdmin, canAccessDriver, forbidden } = require("../utils/authz");

async function canAccessVehicle(req, vehicle) {
    if (!vehicle) return false;
    return canAccessDriver(req, vehicle.driverId);
}

// POST /vehicles
async function createVehicle(req, res) {
    try {
        if (!await canAccessDriver(req, req.body.driverId)) {
            return forbidden(res);
        }
        const vehicle = await Vehicle.create(req.body);
        res.status(201).json({ message: "Vehicle created successfully", vehicle });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /vehicles
async function getAllVehicles(req, res) {
    try {
        const { driverId, vehicleType, isActive } = req.query;
        const filter = {};
        if (driverId)    filter.driverId = driverId;
        if (vehicleType) filter.vehicleType = vehicleType;
        if (isActive !== undefined) filter.isActive = isActive === "true";

        if (!isAdmin(req)) {
            const driver = await DriverProfile.findOne({ userId: req.user.userId });
            if (!driver) return res.status(200).json([]);
            if (driverId && driverId !== driver._id.toString()) return forbidden(res);
            filter.driverId = driver._id;
        }

        const vehicles = await Vehicle.find(filter).populate("driverId");
        res.status(200).json(vehicles);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /vehicles/:id
async function getVehicleById(req, res) {
    try {
        const vehicle = await Vehicle.findById(req.params.id).populate("driverId");
        if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
        if (!await canAccessVehicle(req, vehicle)) {
            return forbidden(res);
        }
        res.status(200).json(vehicle);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /vehicles/driver/:driverId
async function getVehiclesByDriver(req, res) {
    try {
        if (!await canAccessDriver(req, req.params.driverId)) {
            return forbidden(res);
        }
        const vehicles = await Vehicle.find({ driverId: req.params.driverId });
        res.status(200).json(vehicles);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /vehicles/:id
async function updateVehicle(req, res) {
    try {
        const existing = await Vehicle.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Vehicle not found" });
        if (!await canAccessVehicle(req, existing)) {
            return forbidden(res);
        }

        const update = { ...req.body };
        delete update.driverId;
        const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, update, {
            new: true, runValidators: true
        });
        if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
        res.status(200).json({ message: "Vehicle updated successfully", vehicle });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// DELETE /vehicles/:id
async function deleteVehicle(req, res) {
    try {
        const existing = await Vehicle.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Vehicle not found" });
        if (!await canAccessVehicle(req, existing)) {
            return forbidden(res);
        }
        const vehicle = await Vehicle.findByIdAndDelete(req.params.id);
        if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
        res.status(200).json({ message: "Vehicle deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createVehicle, getAllVehicles, getVehicleById,
    getVehiclesByDriver, updateVehicle, deleteVehicle
};
