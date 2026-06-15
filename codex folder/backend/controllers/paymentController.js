// controllers/paymentController.js

const Payment = require("../db/models/payment");

// POST /payments
async function createPayment(req, res) {
    try {
        const payment = await Payment.create(req.body);
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
        res.status(200).json(payment);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /payments/:id/status
async function updatePaymentStatus(req, res) {
    try {
        const { paymentStatus, transactionId, paidAt } = req.body;

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

        const payment = await Payment.findByIdAndUpdate(
            req.params.id,
            { paymentStatus: "refunded", refundAmount, refundReason },
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
