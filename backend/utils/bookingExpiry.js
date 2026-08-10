// utils/bookingExpiry.js
//
// A booking nobody accepted does not stay open forever. The clock starts at the
// time the passenger asked to travel — the scheduled time when they picked one,
// the moment they booked when they wanted to leave now — and a booking still
// waiting 30 minutes past that is cancelled.

const DEFAULT_APPROVAL_GRACE_MS = 30 * 60 * 1000;

function positiveMs(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getApprovalGraceMs(env = process.env) {
    return positiveMs(env.BOOKING_APPROVAL_GRACE_MS, DEFAULT_APPROVAL_GRACE_MS);
}

// Bookings requested before this instant have run out of time.
function approvalCutoff(date = new Date(), env = process.env) {
    return new Date(date.getTime() - getApprovalGraceMs(env));
}

// When a booking gives up waiting. Exported so the reason shown to the
// passenger and the filters below agree on one definition.
function approvalDeadline(booking, env = process.env) {
    const requestedAt = booking?.scheduledTime || booking?.requestedTime || booking?.createdAt;
    if (!requestedAt) return null;
    const requested = new Date(requestedAt);
    if (Number.isNaN(requested.getTime())) return null;
    return new Date(requested.getTime() + getApprovalGraceMs(env));
}

// A scheduled ride is judged against its scheduled time, not against when it
// was booked: a ride booked today for next week has not been waiting too long.
function expiredRideFilter(date = new Date(), env = process.env) {
    const cutoff = approvalCutoff(date, env);
    return {
        status: "searching",
        $or: [
            { scheduledTime: { $ne: null, $lt: cutoff } },
            { scheduledTime: null, createdAt: { $lt: cutoff } }
        ]
    };
}

// Only requests still waiting in the queue expire. Once a driver has approved
// one it belongs to a ride, and the ride's own rules take over.
function expiredCarpoolRequestFilter(date = new Date(), env = process.env) {
    return {
        status: "pending",
        requestedTime: { $lt: approvalCutoff(date, env) }
    };
}

module.exports = {
    DEFAULT_APPROVAL_GRACE_MS,
    approvalCutoff,
    approvalDeadline,
    expiredCarpoolRequestFilter,
    expiredRideFilter,
    getApprovalGraceMs
};
