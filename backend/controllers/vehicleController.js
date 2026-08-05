// controllers/vehicleController.js

const Vehicle = require("../db/models/Vehicle");
const DriverProfile = require("../db/models/DriverProfile");
const Ride = require("../db/models/Ride");
const { isAdmin, canAccessDriver, forbidden } = require("../utils/authz");
const { deleteStoredUploads } = require("../utils/privacyCleanup");

const VEHICLE_WRITE_FIELDS = [
    "driverId",
    "company",
    "model",
    "year",
    "color",
    "licensePlate",
    "vehicleType",
    "seats",
    "allowPets",
    "isActive"
];

const VEHICLE_VERIFICATION_FIELDS = ["company", "model", "year", "licensePlate", "vehicleType", "seats"];

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
        const payload = {};
        for (const key of VEHICLE_WRITE_FIELDS) {
            if (req.body[key] !== undefined) payload[key] = req.body[key];
        }
        payload.testApproval = false;
        payload.insuranceApproval = false;
        payload.documentsVerificationStatus = "not_submitted";
        const vehicle = await Vehicle.create(payload);
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

        const update = {};
        for (const key of VEHICLE_WRITE_FIELDS) {
            if (key !== "driverId" && req.body[key] !== undefined) update[key] = req.body[key];
        }
        const verificationChanged = VEHICLE_VERIFICATION_FIELDS.some(key =>
            update[key] !== undefined && String(update[key]) !== String(existing[key])
        );
        if (verificationChanged) {
            update.testApproval = false;
            update.insuranceApproval = false;
            update.documentsVerificationStatus = "not_submitted";
            update.testImagePath = null;
            update.insuranceImagePath = null;
        }
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
        const activeRide = await Ride.findOne({
            vehicleId: existing._id,
            status: { $in: ["accepted", "driver_arriving", "in_progress"] }
        });
        if (activeRide) {
            return res.status(409).json({ error: "Cannot delete a vehicle assigned to an active ride" });
        }
        await deleteStoredUploads([existing.testImagePath, existing.insuranceImagePath]);
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
