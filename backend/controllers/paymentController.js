// controllers/paymentController.js

const Payment = require("../db/models/payment");
const Ride = require("../db/models/Ride");
const {
    sameId,
    isAdmin,
    getPassengerProfileForUser,
    getDriverProfileForUser,
    forbidden
} = require("../utils/authz");

async function canAccessPayment(req, payment) {
    if (isAdmin(req)) return true;
    const [passenger, driver] = await Promise.all([
        getPassengerProfileForUser(req.user.userId),
        getDriverProfileForUser(req.user.userId)
    ]);
    return Boolean(
        (passenger && sameId(passenger._id, payment.passengerId)) ||
        (driver && sameId(driver._id, payment.driverId))
    );
}

// POST /payments
async function createPayment(req, res) {
    try {
        if (!isAdmin(req)) return forbidden(res, "Admin access required");

        const { rideId, amount, currency, paymentMethod, paymentStatus, transactionId, paidAt } = req.body;
        const ride = await Ride.findById(rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (!ride.driverId) return res.status(400).json({ error: "Ride has no assigned driver" });

        const payment = await Payment.create({
            rideId,
            passengerId: ride.passengerId,
            driverId: ride.driverId,
            amount,
            currency,
            paymentMethod,
            paymentStatus,
            transactionId,
            paidAt
        });
        res.status(201).json({ message: "Payment created successfully", payment });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /payments
async function getAllPayments(req, res) {
    try {
        const { passengerId, driverId, paymentStatus } = req.query;
        const filter = {};
        if (passengerId)    filter.passengerId = passengerId;
        if (driverId)       filter.driverId = driverId;
        if (paymentStatus)  filter.paymentStatus = paymentStatus;

        if (!isAdmin(req)) {
            const [passenger, driver] = await Promise.all([
                getPassengerProfileForUser(req.user.userId),
                getDriverProfileForUser(req.user.userId)
            ]);
            if (passengerId) {
                if (!passenger || !sameId(passenger._id, passengerId)) return forbidden(res);
                filter.passengerId = passenger._id;
            } else if (driverId) {
                if (!driver || !sameId(driver._id, driverId)) return forbidden(res);
                filter.driverId = driver._id;
            } else {
                const own = [];
                if (passenger) own.push({ passengerId: passenger._id });
                if (driver) own.push({ driverId: driver._id });
                if (own.length === 0) return res.status(200).json([]);
                filter.$or = own;
            }
        }

        const payments = await Payment.find(filter)
            .populate("rideId")
            .populate("passengerId")
            .populate("driverId")
            .sort({ createdAt: -1 });

        res.status(200).json(payments);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /payments/:id
async function getPaymentById(req, res) {
    try {
        const payment = await Payment.findById(req.params.id)
            .populate("rideId")
            .populate("passengerId")
            .populate("driverId");

        if (!payment) return res.status(404).json({ error: "Payment not found" });
        if (!await canAccessPayment(req, payment)) return forbidden(res);
        res.status(200).json(payment);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /payments/ride/:rideId
async function getPaymentByRide(req, res) {
    try {
        const payment = await Payment.findOne({ rideId: req.params.rideId })
            .populate("passengerId")
            .populate("driverId");
        if (!payment) return res.status(404).json({ error: "Payment not found for this ride" });
        if (!await canAccessPayment(req, payment)) return forbidden(res);
        res.status(200).json(payment);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /payments/:id/status
async function updatePaymentStatus(req, res) {
    try {
        const { paymentStatus, transactionId, paidAt } = req.body;

        const existing = await Payment.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Payment not found" });
        if (!isAdmin(req)) return forbidden(res, "Admin access required");

        const payment = await Payment.findByIdAndUpdate(
            req.params.id,
            { paymentStatus, transactionId, paidAt },
            { new: true, runValidators: true }
        );

        if (!payment) return res.status(404).json({ error: "Payment not found" });
        res.status(200).json({ message: "Payment status updated", payment });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /payments/:id/refund
async function refundPayment(req, res) {
    try {
        const { refundAmount, refundReason } = req.body;

        const existing = await Payment.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Payment not found" });
        if (!isAdmin(req)) return forbidden(res, "Admin access required");
        const amount = Number(refundAmount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({ error: "Refund amount must be positive" });
        }
        if (amount > existing.amount) {
            return res.status(400).json({ error: "Refund amount cannot exceed payment amount" });
        }

        const payment = await Payment.findByIdAndUpdate(
            req.params.id,
            { paymentStatus: "refunded", refundAmount: amount, refundReason },
            { new: true }
        );

        if (!payment) return res.status(404).json({ error: "Payment not found" });
        res.status(200).json({ message: "Payment refunded", payment });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    createPayment, getAllPayments, getPaymentById,
    getPaymentByRide, updatePaymentStatus, refundPayment
};
