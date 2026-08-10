// utils/activeBooking.js
//
// A passenger may only have one booking in flight at a time. "In flight" covers
// a ride that is still looking for a driver or already under way, and a carpool
// request that is still queued or already approved by a driver. Both booking
// entry points check this before creating anything.

const CarpoolRequest = require("../db/models/CarpoolRequest");
const Ride = require("../db/models/Ride");

const ACTIVE_RIDE_STATUSES = ["searching", "accepted", "driver_arriving", "in_progress"];
const OPEN_CARPOOL_STATUSES = ["pending", "matched", "confirmed"];

const ACTIVE_BOOKING_CODE = "ACTIVE_BOOKING_EXISTS";
const ACTIVE_BOOKING_MESSAGE =
    "You already have an active ride. Finish or cancel it before booking another one.";

// Returns a description of the booking that blocks a new one, or null when the
// passenger is free to book.
async function findActiveBookingForPassenger(passengerId) {
    if (!passengerId) return null;

    const [ride, carpoolRequest] = await Promise.all([
        Ride.findOne({ passengerId, status: { $in: ACTIVE_RIDE_STATUSES } }),
        CarpoolRequest.findOne({ passengerId, status: { $in: OPEN_CARPOOL_STATUSES } })
    ]);

    if (ride) {
        return {
            type: "ride",
            status: ride.status,
            rideId: ride._id,
            requestId: null
        };
    }

    if (carpoolRequest) {
        return {
            type: "carpool",
            status: carpoolRequest.status,
            rideId: carpoolRequest.rideId || null,
            requestId: carpoolRequest._id
        };
    }

    return null;
}

// 409 rather than 400: the request is valid, it just conflicts with what the
// passenger already has open. The code lets the client show its own wording.
function activeBookingConflict(res, activeBooking) {
    return res.status(409).json({
        error: ACTIVE_BOOKING_MESSAGE,
        code: ACTIVE_BOOKING_CODE,
        activeBooking
    });
}

module.exports = {
    ACTIVE_BOOKING_CODE,
    ACTIVE_BOOKING_MESSAGE,
    ACTIVE_RIDE_STATUSES,
    OPEN_CARPOOL_STATUSES,
    activeBookingConflict,
    findActiveBookingForPassenger
};
