// db/models/PassengerProfile.js

const mongoose = require("mongoose");

const paymentMethodSchema = new mongoose.Schema({
    cardholderName: {
        type: String,
        required: true,
        trim: true
    },

    cardBrand: {
        type: String,
        enum: ["visa", "mastercard", "amex", "other"],
        default: "other"
    },

    cardLast4: {
        type: String,
        required: true,
        match: /^\d{4}$/
    },

    expiry: {
        type: String,
        required: true,
        match: /^\d{4}-\d{2}$/
    },

    updatedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const passengerProfileSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },

    ratingAverage: {
        type: Number,
        default: 5,
        min: 1,
        max: 5
    },

    totalRides: {
        type: Number,
        default: 0
    },

    preferredDriverGender: {
        type: String,
        enum: ["male", "female", "any"],
        default: "any"
    },

    preferredMatching: {
        type: String,
        enum: ["closest", "highest_rated"],
        default: "closest"
    },

    savedLocations: [{
        name:    { type: String },
        address: { type: String },
        lat:     { type: Number },
        lng:     { type: Number }
    }],

    defaultPaymentMethod: {
        type: paymentMethodSchema,
        default: null
    },

    totalSpent: {
        type: Number,
        default: 0
    },

    referralBonusRides: {
        type: Number,
        default: 0
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("PassengerProfile", passengerProfileSchema);
