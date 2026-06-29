// controllers/carpoolController.js

const CarpoolRequest = require("../db/models/CarpoolRequest");
const Ride = require("../db/models/Ride");
const {
    canAccessPassenger,
    forbidden,
    getDriverProfileForUser,
    getPassengerProfileForUser,
    isAdmin,
    sameId
} = require("../utils/authz");

function hasValidLocation(location) {
    return location &&
        typeof location.address === "string" &&
        location.address.trim() &&
        Number.isFinite(Number(location.lat)) &&
        Number.isFinite(Number(location.lng)) &&
        Number(location.lat) >= -90 &&
        Number(location.lat) <= 90 &&
        Number(location.lng) >= -180 &&
        Number(location.lng) <= 180 &&
        !(Number(location.lat) === 0 && Number(location.lng) === 0);
}

function publicPopulate(query) {
    return query
        .populate({
            path: "passengerId",
            populate: { path: "userId", select: "fullName profileImage preferredLanguage" }
        })
        .populate("rideId");
}

async function canReadCarpoolRequest(req, request) {
    if (isAdmin(req)) return true;

    const passenger = await getPassengerProfileForUser(req.user.userId);
    if (passenger && sameId(passenger._id, request.passengerId)) return true;

    const driver = await getDriverProfileForUser(req.user.userId);
    return Boolean(driver?.isVerified && request.status === "pending");
}

// POST /carpool
async function createCarpoolRequest(req, res) {
    try {
        let passengerId = req.body.passengerId;
        if (!isAdmin(req)) {
            const passenger = await getPassengerProfileForUser(req.user.userId);
            if (!passenger) return res.status(403).json({ error: "Passenger profile required" });
            passengerId = passenger._id;
        } else if (!passengerId || !await canAccessPassenger(req, passengerId)) {
            return forbidden(res);
        }

        const { pickupLocation, destinationLocation, requestedTime, seatsNeeded, maxDetourMinutes, pricePerSeat, notes, expiresAt } = req.body;
        if (!hasValidLocation(pickupLocation) || !hasValidLocation(destinationLocation)) {
            return res.status(400).json({ error: "Valid pickup and destination coordinates are required" });
        }

        const request = await CarpoolRequest.create({
            passengerId,
            pickupLocation,
            destinationLocation,
            requestedTime,
            seatsNeeded,
            maxDetourMinutes,
            pricePerSeat,
            notes,
            expiresAt,
            status: "pending",
            rideId: null
        });
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

        if (!isAdmin(req)) {
            const passenger = await getPassengerProfileForUser(req.user.userId);
            const driver = await getDriverProfileForUser(req.user.userId);
            if (driver?.isVerified && (!status || status === "pending") && !passengerId) {
                filter.status = "pending";
            } else if (passenger) {
                if (passengerId && !sameId(passenger._id, passengerId)) return forbidden(res);
                filter.passengerId = passenger._id;
            } else {
                return forbidden(res);
            }
        }

        const requests = await publicPopulate(CarpoolRequest.find(filter))
            .sort({ requestedTime: 1 });

        res.status(200).json(requests);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /carpool/:id
async function getCarpoolRequestById(req, res) {
    try {
        const request = await publicPopulate(CarpoolRequest.findById(req.params.id));
        if (!request) return res.status(404).json({ error: "Carpool request not found" });
        if (!await canReadCarpoolRequest(req, request)) return forbidden(res);
        res.status(200).json(request);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /carpool/:id/match
async function matchCarpoolRequest(req, res) {
    try {
        if (!isAdmin(req)) return forbidden(res);
        const { rideId } = req.body;
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });

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
        const existing = await CarpoolRequest.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Carpool request not found" });
        if (!isAdmin(req) && !await canAccessPassenger(req, existing.passengerId)) return forbidden(res);

        const request = await CarpoolRequest.findByIdAndUpdate(req.params.id, { status: "cancelled" }, { new: true });
        if (!request) return res.status(404).json({ error: "Carpool request not found" });
        res.status(200).json({ message: "Carpool request cancelled", request });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /carpool/pending - find pending requests (for matching engine)
async function getPendingRequests(req, res) {
    try {
        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver?.isVerified) return forbidden(res);
        }

        const now = new Date();
        const requests = await publicPopulate(CarpoolRequest.find({
            status: "pending",
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
        })).sort({ requestedTime: 1 });

        res.status(200).json(requests);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createCarpoolRequest, getAllCarpoolRequests, getCarpoolRequestById,
    matchCarpoolRequest, cancelCarpoolRequest, getPendingRequests
};
