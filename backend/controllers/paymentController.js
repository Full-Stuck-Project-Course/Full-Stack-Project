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

function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
}

function isValidFutureExpiry(expiry) {
    if (!/^\d{4}-\d{2}$/.test(expiry)) return false;
    const [year, month] = expiry.split("-").map(Number);
    if (month < 1 || month > 12) return false;

    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const expiryMonth = new Date(year, month - 1, 1);
    return expiryMonth >= currentMonth;
}

function validateSimulatedCard(body) {
    const cardholderName = String(body.cardholderName || "").trim();
    const cardNumber = digitsOnly(body.cardNumber);
    const cvv = digitsOnly(body.cvv);
    const expiry = String(body.expiry || "").trim();

    if (!cardholderName) return { error: "Cardholder name is required" };
    if (cardNumber.length < 12 || cardNumber.length > 19) {
        return { error: "Card number must contain 12 to 19 digits" };
    }
    if (!isValidFutureExpiry(expiry)) return { error: "Expiry month must be current or future" };
    if (!/^\d{3,4}$/.test(cvv)) return { error: "CVV must contain 3 or 4 digits" };

    return {
        cardLast4: cardNumber.slice(-4),
        cardholderName,
        expiry
    };
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

// POST /payments/ride/:rideId/simulate
async function simulatePayment(req, res) {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (ride.status !== "completed") {
            return res.status(400).json({ error: "Payment can be approved only after the ride is completed" });
        }
        if (!ride.driverId) return res.status(400).json({ error: "Ride has no assigned driver" });

        const passenger = await getPassengerProfileForUser(req.user.userId);
        if (!passenger || !sameId(passenger._id, ride.passengerId)) {
            return forbidden(res, "Only the ride passenger can approve payment");
        }

        const card = validateSimulatedCard(req.body);
        if (card.error) return res.status(400).json({ error: card.error });

        const existing = await Payment.findOne({ rideId: ride._id });
        if (existing?.paymentStatus === "paid") {
            return res.status(200).json({ message: "Payment already approved", payment: existing });
        }
        if (existing?.paymentStatus === "refunded") {
            return res.status(400).json({ error: "Refunded payments cannot be re-approved" });
        }

        const paidAt = new Date();
        const transactionId = `sim_${ride._id}_${paidAt.getTime()}`;
        const payment = await Payment.findOneAndUpdate(
            { rideId: ride._id },
            {
                $set: {
                    passengerId: ride.passengerId,
                    driverId: ride.driverId,
                    amount: ride.finalPrice || 0,
                    currency: "ILS",
                    paymentMethod: "credit_card",
                    paymentStatus: "paid",
                    paymentProvider: "simulated",
                    cardLast4: card.cardLast4,
                    transactionId,
                    paidAt
                },
                $setOnInsert: {
                    rideId: ride._id
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        res.status(200).json({ message: "Simulated payment approved", payment });
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
    getPaymentByRide, updatePaymentStatus, refundPayment,
    simulatePayment
};
