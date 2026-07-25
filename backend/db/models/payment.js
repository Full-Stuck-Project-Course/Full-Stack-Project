// db/models/Payment.js

const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({

    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
        required: true
    },

    passengerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PassengerProfile",
        required: true
    },

    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DriverProfile",
        required: true
    },

    amount: {
        type: Number,
        required: true,
        min: 0
    },

    currency: {
        type: String,
        default: "ILS"
    },

    paymentMethod: {
        type: String,
        enum: [
            "credit_card",
            "paypal",
            "apple_pay",
            "google_pay",
            "cash"
        ],
        required: true
    },

    paymentStatus: {
        type: String,
        enum: [
            "pending",
            "paid",
            "failed",
            "refunded"
        ],
        default: "pending"
    },

    transactionId: {
        type: String,
        default: null
    },

    paidAt: {
        type: Date,
        default: null
    },

    refundAmount: {
        type: Number,
        default: 0
    },

    refundReason: {
        type: String,
        default: ""
    }

}, {
    timestamps: true
});

module.exports = mongoose.model(
    "Payment",
    paymentSchema
);