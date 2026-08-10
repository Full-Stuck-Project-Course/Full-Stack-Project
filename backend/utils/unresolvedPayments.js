const Payment = require("../db/models/payment");

const UNRESOLVED_PAYMENT_STATUSES = ["pending", "failed"];
const PENDING_PAYMENT_CODE = "PENDING_PAYMENT_REQUIRED";
const PENDING_PAYMENT_MESSAGE =
    "You have a payment waiting from a previous ride. Complete it before booking another ride.";

async function findUnresolvedPaymentForPassenger(passengerId, { populateRide = false } = {}) {
    if (!passengerId) return null;

    let query = Payment.findOne({
        passengerId,
        paymentStatus: { $in: UNRESOLVED_PAYMENT_STATUSES }
    });
    if (populateRide && query?.populate) query = query.populate("rideId");
    if (query?.sort) query = query.sort({ createdAt: 1 });
    return query;
}

function paymentGatePayload(payment) {
    const rideId = payment?.rideId?._id || payment?.rideId || null;
    return {
        type: "payment",
        status: payment?.paymentStatus || "pending",
        paymentId: payment?._id || null,
        rideId,
        amount: payment?.amount ?? 0,
        currency: payment?.currency || "ILS"
    };
}

function unresolvedPaymentConflict(res, payment) {
    return res.status(409).json({
        error: PENDING_PAYMENT_MESSAGE,
        code: PENDING_PAYMENT_CODE,
        pendingPayment: paymentGatePayload(payment)
    });
}

module.exports = {
    PENDING_PAYMENT_CODE,
    PENDING_PAYMENT_MESSAGE,
    UNRESOLVED_PAYMENT_STATUSES,
    findUnresolvedPaymentForPassenger,
    paymentGatePayload,
    unresolvedPaymentConflict
};
