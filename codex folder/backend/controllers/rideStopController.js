// controllers/rideStopController.js

const RideStop = require("../db/models/RideStop");

// POST /ride-stops
async function createRideStop(req, res) {
    try {
        const stop = await RideStop.create(req.body);
        res.status(201).json({ message: "Ride stop created", stop });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /ride-stops/ride/:rideId
async function getStopsByRide(req, res) {
    try {
        const stops = await RideStop.find({ rideId: req.params.rideId }).sort({ order: 1 });
        res.status(200).json(stops);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /ride-stops/:id
async function updateRideStop(req, res) {
    try {
        const stop = await RideStop.findByIdAndUpdate(req.params.id, req.body, {
            new: true, runValidators: true
        });
        if (!stop) return res.status(404).json({ error: "Ride stop not found" });
        res.status(200).json({ message: "Ride stop updated", stop });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /ride-stops/:id/arrive
async function markStopArrived(req, res) {
    try {
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
