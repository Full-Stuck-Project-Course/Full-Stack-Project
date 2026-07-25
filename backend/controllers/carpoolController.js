// controllers/carpoolController.js

const CarpoolRequest = require("../db/models/CarpoolRequest");
const Ride = require("../db/models/Ride");
const Vehicle = require("../db/models/Vehicle");
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

function parsePositiveInteger(value, fallback) {
    const parsed = Number(value ?? fallback);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseNonNegativeNumber(value, fallback) {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseFutureDate(value, fieldName) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${fieldName} must be a valid date`);
    }
    return parsed;
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

        const { pickupLocation, destinationLocation, requestedTime, notes } = req.body;
        if (!hasValidLocation(pickupLocation) || !hasValidLocation(destinationLocation)) {
            return res.status(400).json({ error: "Valid pickup and destination coordinates are required" });
        }
        const parsedSeats = parsePositiveInteger(req.body.seatsNeeded, 1);
        if (!parsedSeats || parsedSeats > 4) {
            return res.status(400).json({ error: "Seats needed must be between 1 and 4" });
        }
        const parsedDetour = parseNonNegativeNumber(req.body.maxDetourMinutes, 10);
        if (parsedDetour === null || parsedDetour > 60) {
            return res.status(400).json({ error: "Max detour must be between 0 and 60 minutes" });
        }
        const parsedPrice = parseNonNegativeNumber(req.body.pricePerSeat, 0);
        if (parsedPrice === null) {
            return res.status(400).json({ error: "Price per seat must be a non-negative number" });
        }
        const parsedRequestedTime = parseFutureDate(requestedTime, "Requested time");
        const parsedExpiresAt = req.body.expiresAt ? parseFutureDate(req.body.expiresAt, "Expiration time") : null;

        const request = await CarpoolRequest.create({
            passengerId,
            pickupLocation,
            destinationLocation,
            requestedTime: parsedRequestedTime,
            seatsNeeded: parsedSeats,
            maxDetourMinutes: parsedDetour,
            pricePerSeat: parsedPrice,
            notes,
            expiresAt: parsedExpiresAt,
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
        if (ride.rideType !== "carpool") {
            return res.status(400).json({ error: "Request can only be matched to a carpool ride" });
        }
        if (["completed", "cancelled"].includes(ride.status)) {
            return res.status(400).json({ error: "Cannot match request to a finished ride" });
        }

        const existing = await CarpoolRequest.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Carpool request not found" });
        if (existing.status !== "pending") {
            return res.status(409).json({ error: "Only pending carpool requests can be matched" });
        }
        if (existing.expiresAt && existing.expiresAt <= new Date()) {
            return res.status(400).json({ error: "Carpool request has expired" });
        }

        if (ride.vehicleId) {
            const vehicle = await Vehicle.findById(ride.vehicleId);
            if (!vehicle) return res.status(404).json({ error: "Ride vehicle not found" });
            const matchedRequests = await CarpoolRequest.find({
                rideId,
                status: { $in: ["matched", "confirmed"] },
                _id: { $ne: existing._id }
            });
            const alreadyReservedSeats = matchedRequests.reduce((sum, request) => sum + Number(request.seatsNeeded || 0), 0);
            const totalSeats = Number(ride.passengerCount || 1) + alreadyReservedSeats + Number(existing.seatsNeeded || 1);
            if (vehicle.seats < totalSeats) {
                return res.status(400).json({ error: "Vehicle does not have enough seats for this match" });
            }
        }

        const request = await CarpoolRequest.findOneAndUpdate(
            {
                _id: req.params.id,
                status: "pending",
                $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
            },
            { status: "matched", rideId },
            { new: true }
        );
        if (!request) return res.status(409).json({ error: "Carpool request is no longer available" });
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
        if (!["pending", "matched"].includes(existing.status)) {
            return res.status(400).json({ error: "Only pending or matched carpool requests can be cancelled" });
        }

        const request = await CarpoolRequest.findOneAndUpdate(
            { _id: req.params.id, status: { $in: ["pending", "matched"] } },
            { status: "cancelled" },
            { new: true }
        );
        if (!request) return res.status(409).json({ error: "Carpool request can no longer be cancelled" });
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
