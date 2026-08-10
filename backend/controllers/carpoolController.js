// controllers/carpoolController.js

const CarpoolRequest = require("../db/models/CarpoolRequest");
const DriverProfile = require("../db/models/DriverProfile");
const Notification = require("../db/models/Notification");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const Vehicle = require("../db/models/Vehicle");
const { activeBookingConflict, findActiveBookingForPassenger } = require("../utils/activeBooking");
const { findUnresolvedPaymentForPassenger, unresolvedPaymentConflict } = require("../utils/unresolvedPayments");
const { calculateFareForRoute } = require("../utils/routePricing");
const {
    canAccessPassenger,
    forbidden,
    getDriverProfileForUser,
    getPassengerProfileForUser,
    isAdmin,
    sameId
} = require("../utils/authz");

// A carpool ride a driver can still add passengers to.
const OPEN_RIDE_STATUSES = ["searching", "accepted", "driver_arriving", "in_progress"];

// Request states that still hold a seat, and so can be given up.
const OPEN_REQUEST_STATUSES = ["pending", "matched", "confirmed"];

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
        .populate({
            path: "driverId",
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

// Seats already promised to other carpool riders on the same ride.
async function reservedSeatsForRide(rideId, excludeRequestId) {
    const reserved = await CarpoolRequest.find({
        rideId,
        status: { $in: ["matched", "confirmed"] },
        _id: { $ne: excludeRequestId }
    });
    return reserved.reduce((sum, request) => sum + Number(request.seatsNeeded || 0), 0);
}

// Only a verified driver who opted into carpool sees the queue.
function canDriverServeCarpool(driver) {
    return Boolean(driver?.isVerified && driver?.acceptsCarpoolRides);
}

async function canReadCarpoolRequest(req, request) {
    if (isAdmin(req)) return true;

    const passenger = await getPassengerProfileForUser(req.user.userId);
    if (passenger && sameId(passenger._id, request.passengerId)) return true;

    const driver = await getDriverProfileForUser(req.user.userId);
    if (canDriverServeCarpool(driver) && request.status === "pending") return true;
    return Boolean(driver && sameId(driver._id, request.driverId));
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

        // A carpool request is a booking like any other, so it competes with an
        // open ride for the passenger's single active slot.
        if (!isAdmin(req)) {
            const pendingPayment = await findUnresolvedPaymentForPassenger(passengerId);
            if (pendingPayment) return unresolvedPaymentConflict(res, pendingPayment);

            const activeBooking = await findActiveBookingForPassenger(passengerId);
            if (activeBooking) return activeBookingConflict(res, activeBooking);
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
            if (canDriverServeCarpool(driver) && (!status || status === "pending") && !passengerId) {
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
            const alreadyReservedSeats = await reservedSeatsForRide(rideId, existing._id);
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
            { status: "matched", rideId, driverId: ride.driverId || null },
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
        // A confirmed seat is still cancellable: otherwise an approved rider
        // would hold their one active booking until the ride finishes.
        if (!OPEN_REQUEST_STATUSES.includes(existing.status)) {
            return res.status(400).json({ error: "Only open carpool requests can be cancelled" });
        }

        const request = await CarpoolRequest.findOneAndUpdate(
            { _id: req.params.id, status: { $in: OPEN_REQUEST_STATUSES } },
            { status: "cancelled" },
            { new: true }
        );
        if (!request) return res.status(409).json({ error: "Carpool request can no longer be cancelled" });
        res.status(200).json({ message: "Carpool request cancelled", request });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /carpool/pending - the queue drivers pick passengers from
async function getPendingRequests(req, res) {
    try {
        if (!isAdmin(req)) {
            const driver = await getDriverProfileForUser(req.user.userId);
            if (!driver?.isVerified) return forbidden(res);
            // A driver who turned carpool off simply has an empty queue.
            if (!driver.acceptsCarpoolRides) return res.status(200).json([]);
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

function plainLocation(location) {
    return {
        address: location?.address,
        lat: Number(location?.lat),
        lng: Number(location?.lng)
    };
}

// Approving the first passenger opens the carpool ride the driver will run.
// Later passengers join that same ride instead of opening another one.
async function openCarpoolRideForRequest(request, driver, vehicle) {
    const claimedDriver = await DriverProfile.findOneAndUpdate(
        { _id: driver._id, status: "available", isVerified: true },
        { status: "busy" },
        { new: true }
    );
    if (!claimedDriver) {
        const error = new Error("Driver must be available to open a carpool ride");
        error.statusCode = 409;
        throw error;
    }

    try {
        const passengerCount = Number(request.seatsNeeded || 1);
        const { fare } = await calculateFareForRoute({
            pickupLocation: request.pickupLocation,
            destinationLocation: request.destinationLocation,
            vehicleType: vehicle.vehicleType,
            rideType: "carpool",
            passengerCount
        });

        return await Ride.create({
            passengerId: request.passengerId,
            driverId: driver._id,
            vehicleId: vehicle._id,
            pickupLocation: plainLocation(request.pickupLocation),
            destinationLocation: plainLocation(request.destinationLocation),
            rideType: "carpool",
            status: "accepted",
            scheduledTime: request.requestedTime || null,
            passengerCount,
            vehicleType: vehicle.vehicleType || null,
            distanceKm: fare.distanceKm,
            estimatedDurationMinutes: fare.estimatedDurationMinutes,
            basePrice: fare.basePrice,
            surgeMultiplier: fare.surgeMultiplier,
            finalPrice: fare.finalPrice
        });
    } catch (error) {
        await DriverProfile.findByIdAndUpdate(driver._id, { status: "available" }).catch(() => {});
        throw error;
    }
}

// Tells the passenger a driver took their request. The approval is already
// stored, so a failure here must not fail the request.
async function notifyCarpoolApproval(req, request, ride) {
    try {
        const passenger = await PassengerProfile.findById(request.passengerId).select("userId");
        if (!passenger?.userId) return;

        const notification = await Notification.create({
            userId: passenger.userId,
            type: "ride_accepted",
            title: "בקשת הקרפול אושרה",
            body: "נהג אישר את בקשת הקרפול שלך ואפשר לעקוב אחרי הנסיעה.",
            rideId: ride._id
        });

        const io = req.app?.get?.("io");
        if (io) {
            io.to(`user:${passenger.userId}`).emit("carpool-request-approved", {
                requestId: request._id,
                rideId: ride._id,
                notification
            });
        }
    } catch (error) {
        console.warn("Could not send carpool approval notice:", error.message);
    }
}

// PUT /carpool/:id/accept - a driver approves a waiting carpool passenger.
// Without a rideId this opens a new carpool ride; with one the passenger joins
// a carpool the same driver is already running.
async function acceptCarpoolRequest(req, res) {
    let claimedRequest = null;
    let openedRide = null;

    try {
        const driver = isAdmin(req) && req.body.driverId
            ? await DriverProfile.findById(req.body.driverId)
            : await getDriverProfileForUser(req.user.userId);
        if (!driver) return res.status(400).json({ error: "Driver profile not found" });
        if (!driver.isVerified) {
            return res.status(403).json({ error: "Driver must be verified before approving carpool passengers" });
        }
        if (!driver.acceptsCarpoolRides) {
            return res.status(403).json({ error: "Driver does not accept carpool rides" });
        }

        const existing = await CarpoolRequest.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Carpool request not found" });
        if (existing.status !== "pending") {
            return res.status(409).json({ error: "Only pending carpool requests can be approved" });
        }
        if (existing.expiresAt && existing.expiresAt <= new Date()) {
            return res.status(400).json({ error: "Carpool request has expired" });
        }

        const vehicle = await Vehicle.findOne({ driverId: driver._id, isActive: true }).sort({ createdAt: -1 });
        if (!vehicle) return res.status(400).json({ error: "Driver must have an active vehicle" });
        if (!vehicle.testApproval || !vehicle.insuranceApproval) {
            return res.status(403).json({ error: "Vehicle documents must be approved before accepting rides" });
        }

        const seatsNeeded = Number(existing.seatsNeeded || 1);
        let ride = null;

        if (req.body.rideId) {
            ride = await Ride.findById(req.body.rideId);
            if (!ride) return res.status(404).json({ error: "Ride not found" });
            if (ride.rideType !== "carpool") {
                return res.status(400).json({ error: "Passengers can only be added to a carpool ride" });
            }
            if (!sameId(ride.driverId, driver._id)) {
                return forbidden(res, "Only the ride's own driver can approve passengers for it");
            }
            if (!OPEN_RIDE_STATUSES.includes(ride.status)) {
                return res.status(400).json({ error: "Cannot add a passenger to a finished ride" });
            }
            const reservedSeats = await reservedSeatsForRide(ride._id, existing._id);
            if (vehicle.seats < Number(ride.passengerCount || 1) + reservedSeats + seatsNeeded) {
                return res.status(400).json({ error: "Vehicle does not have enough seats for this passenger" });
            }
        } else if (vehicle.seats < seatsNeeded) {
            return res.status(400).json({ error: "Vehicle does not have enough seats for this passenger" });
        }

        // Claim the request before building the ride so two drivers cannot
        // approve the same passenger.
        claimedRequest = await CarpoolRequest.findOneAndUpdate(
            {
                _id: existing._id,
                status: "pending",
                $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
            },
            { status: "matched", driverId: driver._id },
            { new: true }
        );
        if (!claimedRequest) return res.status(409).json({ error: "Carpool request is no longer available" });

        if (!ride) {
            ride = await openCarpoolRideForRequest(existing, driver, vehicle);
            openedRide = ride;
        }

        const request = await CarpoolRequest.findByIdAndUpdate(
            claimedRequest._id,
            { status: "confirmed", rideId: ride._id, driverId: driver._id },
            { new: true, runValidators: true }
        );
        if (!request) {
            const error = new Error("Carpool request is no longer available");
            error.statusCode = 409;
            throw error;
        }

        claimedRequest = null;
        openedRide = null;

        await notifyCarpoolApproval(req, request, ride);

        res.status(200).json({ message: "Carpool passenger approved", request, ride });
    } catch (error) {
        // Best effort: put the passenger back in the queue and undo a ride that
        // was opened for an approval that never completed.
        if (claimedRequest) {
            await CarpoolRequest.findByIdAndUpdate(
                claimedRequest._id,
                { status: "pending", driverId: null, rideId: null }
            ).catch(() => {});
        }
        if (openedRide) {
            await Ride.findByIdAndUpdate(
                openedRide._id,
                { status: "cancelled", cancelledAt: new Date(), cancelledBy: "system" }
            ).catch(() => {});
            await DriverProfile.findByIdAndUpdate(openedRide.driverId, { status: "available" }).catch(() => {});
        }
        res.status(error.statusCode || 400).json({ error: error.message });
    }
}

module.exports = {
    createCarpoolRequest, getAllCarpoolRequests, getCarpoolRequestById,
    matchCarpoolRequest, acceptCarpoolRequest, cancelCarpoolRequest, getPendingRequests
};
