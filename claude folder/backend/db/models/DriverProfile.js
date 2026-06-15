// db/models/DriverProfile.js

const mongoose = require("mongoose");

const driverProfileSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
    },

    licenseNumber: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },

    licenseImagePath: {
        type: String,
        default: null
    },

    licenseExpiry: {
        type: Date,
        default: null
    },

    isVerified: {
        type: Boolean,
        default: false
    },

    verificationStatus: {
        type: String,
        enum: ["not_submitted", "pending", "approved", "rejected"],
        default: "pending"
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

    totalEarnings: {
        type: Number,
        default: 0
    },

    totalFines: {
        type: Number,
        default: 0
    },

    status: {
        type: String,
        enum: ["available", "busy", "offline"],
        default: "offline"
    },

    currentLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null },
        updatedAt: { type: Date, default: null }
    },

    preferredMusic: {
        type: String,
        default: ""
    },

    hobbies: [{ type: String }],

    spokenLanguages: [{ type: String, default: ["he"] }],

    gender: {
        type: String,
        enum: ["male", "female", "other"],
        default: "other"
    },

    acceptsCarpoolRides: {
        type: Boolean,
        default: true
    },

    // No pets, no smoking preferences
    vehicleConditions: {
        noPets:     { type: Boolean, default: false },
        noSmoking:  { type: Boolean, default: true },
        noFood:     { type: Boolean, default: false }
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("DriverProfile", driverProfileSchema);
