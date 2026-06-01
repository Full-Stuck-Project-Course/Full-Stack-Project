// controllers/carpoolController.js

const CarpoolRequest = require("../db/models/CarpoolRequest");

// POST /carpool
async function createCarpoolRequest(req, res) {
    try {
        const request = await CarpoolRequest.create(req.body);
        res.status(201).json({ message: "Carpool request created", request });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /carpool
async function getAllCarpoolRequests(req, res) {
    try {
        const { status, passengerId } = req.query;
        const filter = {};
        if (status)      filter.status = status;
        if (passengerId) filter.passengerId = passengerId;

        const requests = await CarpoolRequest.find(filter)
            .populate("passengerId")
            .populate("rideId")
            .sort({ requestedTime: 1 });

        res.status(200).json(requests);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /carpool/:id
async function getCarpoolRequestById(req, res) {
    try {
        const request = await CarpoolRequest.findById(req.params.id)
            .populate("passengerId")
            .populate("rideId");
        if (!request) return res.status(404).json({ error: "Carpool request not found" });
        res.status(200).json(request);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /carpool/:id/match
async function matchCarpoolRequest(req, res) {
    try {
        const { rideId } = req.body;
        const request = await CarpoolRequest.findByIdAndUpdate(
            req.params.id,
            { status: "matched", rideId },
            { new: true }
        );
        if (!request) return res.status(404).json({ error: "Carpool request not found" });
        res.status(200).json({ message: "Carpool request matched to ride", request });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /carpool/:id/cancel
async function cancelCarpoolRequest(req, res) {
    try {
        const request = await CarpoolRequest.findByIdAndUpdate(
            req.params.id,
            { status: "cancelled" },
            { new: true }
        );
        if (!request) return res.status(404).json({ error: "Carpool request not found" });
        res.status(200).json({ message: "Carpool request cancelled", request });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /carpool/pending - find pending requests (for matching engine)
async function getPendingRequests(req, res) {
    try {
        const now = new Date();
        const requests = await CarpoolRequest.find({
            status: "pending",
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
        }).populate("passengerId").sort({ requestedTime: 1 });

        res.status(200).json(requests);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createCarpoolRequest, getAllCarpoolRequests, getCarpoolRequestById,
    matchCarpoolRequest, cancelCarpoolRequest, getPendingRequests
};
