// controllers/rideStopController.js

const RideStop = require("../db/models/RideStop");
const Ride = require("../db/models/Ride");
const {
    forbidden,
    getDriverProfileForUser,
    getPassengerProfileForUser,
    isAdmin,
    sameId
} = require("../utils/authz");

function hasValidCoordinates(lat, lng) {
    const parsedLat = Number(lat);
    const parsedLng = Number(lng);
    return Number.isFinite(parsedLat) &&
        Number.isFinite(parsedLng) &&
        parsedLat >= -90 &&
        parsedLat <= 90 &&
        parsedLng >= -180 &&
        parsedLng <= 180 &&
        !(parsedLat === 0 && parsedLng === 0);
}

async function canAccessRide(req, ride) {
    if (isAdmin(req)) return true;
    const passenger = await getPassengerProfileForUser(req.user.userId);
    const driver = await getDriverProfileForUser(req.user.userId);
    return Boolean(
        (passenger && sameId(passenger._id, ride.passengerId)) ||
        (driver && sameId(driver._id, ride.driverId))
    );
}

async function canMarkStopArrived(req, ride) {
    if (isAdmin(req)) return true;
    const driver = await getDriverProfileForUser(req.user.userId);
    return Boolean(driver && sameId(driver._id, ride.driverId));
}

async function findStopAndRide(stopId) {
    const stop = await RideStop.findById(stopId);
    if (!stop) return {};
    const ride = await Ride.findById(stop.rideId);
    return { stop, ride };
}

// POST /ride-stops
async function createRideStop(req, res) {
    try {
        const { rideId, order, address, lat, lng, estimatedArrivalTime, stopType, additionalPrice, notes } = req.body;
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);
        if (!hasValidCoordinates(lat, lng)) {
            return res.status(400).json({ error: "Valid stop coordinates are required" });
        }

        const stop = await RideStop.create({
            rideId,
            order,
            address,
            lat,
            lng,
            estimatedArrivalTime,
            stopType,
            additionalPrice,
            notes
        });
        res.status(201).json({ message: "Ride stop created", stop });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /ride-stops/ride/:rideId
async function getStopsByRide(req, res) {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);

        const stops = await RideStop.find({ rideId: req.params.rideId }).sort({ order: 1 });
        res.status(200).json(stops);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /ride-stops/:id
async function updateRideStop(req, res) {
    try {
        const { stop: existing, ride } = await findStopAndRide(req.params.id);
        if (!existing) return res.status(404).json({ error: "Ride stop not found" });
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);

        const { order, address, lat, lng, estimatedArrivalTime, stopType, additionalPrice, notes } = req.body;
        const update = { order, address, lat, lng, estimatedArrivalTime, stopType, additionalPrice, notes };
        Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
        if ((lat !== undefined || lng !== undefined) && !hasValidCoordinates(lat ?? existing.lat, lng ?? existing.lng)) {
            return res.status(400).json({ error: "Valid stop coordinates are required" });
        }

        const stop = await RideStop.findByIdAndUpdate(req.params.id, update, {
            new: true, runValidators: true
        });
        res.status(200).json({ message: "Ride stop updated", stop });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /ride-stops/:id/arrive
async function markStopArrived(req, res) {
    try {
        const { stop: existing, ride } = await findStopAndRide(req.params.id);
        if (!existing) return res.status(404).json({ error: "Ride stop not found" });
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canMarkStopArrived(req, ride)) return forbidden(res);

        const stop = await RideStop.findByIdAndUpdate(
            req.params.id,
            { actualArrivalTime: new Date() },
            { new: true }
        );
        if (!stop) return res.status(404).json({ error: "Ride stop not found" });
        res.status(200).json({ message: "Arrival recorded", stop });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// DELETE /ride-stops/:id
async function deleteRideStop(req, res) {
    try {
        const { stop: existing, ride } = await findStopAndRide(req.params.id);
        if (!existing) return res.status(404).json({ error: "Ride stop not found" });
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!await canAccessRide(req, ride)) return forbidden(res);

        const stop = await RideStop.findByIdAndDelete(req.params.id);
        if (!stop) return res.status(404).json({ error: "Ride stop not found" });
        res.status(200).json({ message: "Ride stop deleted" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createRideStop, getStopsByRide, updateRideStop, markStopArrived, deleteRideStop
};
