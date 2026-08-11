// controllers/paymentController.js

const Payment = require("../db/models/payment");
const CarpoolRequest = require("../db/models/CarpoolRequest");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const { notifyPaymentApproved } = require("../utils/approvalNotifications");
const {
    normalizeSavedPaymentMethod,
    validateSimulatedCard,
    validateStoredPaymentMethod
} = require("../utils/simulatedPaymentMethod");
const { findUnresolvedPaymentForPassenger } = require("../utils/unresolvedPayments");
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

const CARPOOL_PAYMENT_SEAT_STATUSES = ["matched", "confirmed", "completed"];

function carpoolPaymentAmount(seat, ride) {
    const finalPrice = Number(seat?.finalPrice);
    if (Number.isFinite(finalPrice) && finalPrice >= 0) return finalPrice;

    const pricePerSeat = Number(seat?.pricePerSeat);
    const seatsNeeded = Number(seat?.seatsNeeded || 1);
    if (Number.isFinite(pricePerSeat) && pricePerSeat >= 0) {
        return Number((pricePerSeat * seatsNeeded).toFixed(2));
    }

    return Number(ride?.finalPrice || 0);
}

async function passengerPaymentContext(ride, passenger) {
    if (!passenger) return null;

    if (ride?.rideType === "carpool") {
        const seat = await CarpoolRequest.findOne({
            rideId: ride._id,
            passengerId: passenger._id,
            status: { $in: CARPOOL_PAYMENT_SEAT_STATUSES }
        });
        if (seat) {
            return {
                passengerId: passenger._id,
                amount: carpoolPaymentAmount(seat, ride),
                readyForPayment: Boolean(ride.status === "completed" || seat.passengerCompletedAt || seat.status === "completed")
            };
        }
    }

    if (sameId(passenger._id, ride?.passengerId)) {
        return {
            passengerId: passenger._id,
            amount: Number(ride.finalPrice || 0),
            readyForPayment: Boolean(ride.status === "completed" || ride.passengerCompletedAt)
        };
    }

    return null;
}

function populatedPaymentQuery(filter) {
    return Payment.findOne(filter)
        .populate("passengerId")
        .populate("driverId");
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
        let payment = null;

        if (isAdmin(req)) {
            payment = await populatedPaymentQuery({ rideId: req.params.rideId });
        } else {
            const ride = await Ride.findById(req.params.rideId);
            if (!ride) return res.status(404).json({ error: "Payment not found for this ride" });

            const [passenger, driver] = await Promise.all([
                getPassengerProfileForUser(req.user.userId),
                getDriverProfileForUser(req.user.userId)
            ]);
            const passengerContext = await passengerPaymentContext(ride, passenger);

            if (passengerContext) {
                payment = await populatedPaymentQuery({
                    rideId: req.params.rideId,
                    passengerId: passengerContext.passengerId
                });
            } else if (driver && sameId(driver._id, ride.driverId)) {
                payment = await populatedPaymentQuery({
                    rideId: req.params.rideId,
                    driverId: driver._id
                });
            } else {
                return forbidden(res);
            }
        }

        if (!payment) return res.status(404).json({ error: "Payment not found for this ride" });
        res.status(200).json(payment);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /payments/unresolved
async function getUnresolvedPaymentForCurrentPassenger(req, res) {
    try {
        const passenger = await getPassengerProfileForUser(req.user.userId);
        if (!passenger) return res.status(200).json({ payment: null });

        const payment = await findUnresolvedPaymentForPassenger(passenger._id, { populateRide: true });
        res.status(200).json({ payment: payment || null });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /payments/ride/:rideId/simulate
async function simulatePayment(req, res) {
    try {
        const ride = await Ride.findById(req.params.rideId);
        if (!ride) return res.status(404).json({ error: "Ride not found" });
        if (ride.status !== "completed" && ride.rideType !== "carpool") {
            return res.status(400).json({ error: "Payment can be approved only after the ride is completed" });
        }
        if (!ride.driverId) return res.status(400).json({ error: "Ride has no assigned driver" });

        const passenger = await getPassengerProfileForUser(req.user.userId);
        const paymentContext = await passengerPaymentContext(ride, passenger);
        if (!paymentContext) return forbidden(res, "Only an approved ride passenger can approve payment");
        if (ride.status !== "completed" && !paymentContext.readyForPayment) {
            return res.status(400).json({ error: "Payment can be approved only after this passenger confirms their ride is completed" });
        }

        const useSavedPaymentMethod = req.body.useSavedPaymentMethod === true || req.body.useSavedPaymentMethod === "true";
        const savePaymentMethod = req.body.savePaymentMethod === true || req.body.savePaymentMethod === "true";
        const card = useSavedPaymentMethod
            ? validateStoredPaymentMethod(passenger.defaultPaymentMethod)
            : validateSimulatedCard(req.body);
        if (card.error) return res.status(400).json({ error: card.error });

        const existing = await Payment.findOne({ rideId: ride._id, passengerId: paymentContext.passengerId });
        if (existing?.paymentStatus === "paid") {
            return res.status(200).json({ message: "Payment already approved", payment: existing });
        }
        if (existing?.paymentStatus === "refunded") {
            return res.status(400).json({ error: "Refunded payments cannot be re-approved" });
        }

        const paidAt = new Date();
        const transactionId = `sim_${ride._id}_${paidAt.getTime()}`;
        const payment = await Payment.findOneAndUpdate(
            { rideId: ride._id, passengerId: paymentContext.passengerId },
            {
                $set: {
                    passengerId: paymentContext.passengerId,
                    driverId: ride.driverId,
                    amount: paymentContext.amount,
                    currency: "ILS",
                    paymentMethod: "credit_card",
                    paymentStatus: "paid",
                    paymentProvider: "simulated",
                    cardLast4: card.cardLast4,
                    cardBrand: card.cardBrand,
                    transactionId,
                    paidAt
                },
                $setOnInsert: {
                    rideId: ride._id
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
        );

        let updatedPassenger = null;
        if (!useSavedPaymentMethod && savePaymentMethod) {
            const paymentMethod = normalizeSavedPaymentMethod(req.body);
            if (paymentMethod.error) return res.status(400).json({ error: paymentMethod.error });
            try {
                updatedPassenger = await PassengerProfile.findByIdAndUpdate(
                    passenger._id,
                    { defaultPaymentMethod: { ...paymentMethod, updatedAt: paidAt } },
                    { new: true, runValidators: true }
                );
            } catch (saveError) {
                console.warn("Could not save passenger payment method:", saveError.message);
            }
        }

        await notifyPaymentApproved(req, { ride, payment });

        res.status(200).json({
            message: "Simulated payment approved",
            payment,
            ...(updatedPassenger ? { passenger: updatedPassenger } : {})
        });
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
    getPaymentByRide, getUnresolvedPaymentForCurrentPassenger,
    updatePaymentStatus, refundPayment,
    simulatePayment
};
