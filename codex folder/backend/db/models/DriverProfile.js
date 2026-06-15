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

    driverLicenseImage: {
        type: String,
        default: ""
    },

    isVerified: {
        type: Boolean,
        default: false
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

    status: {
        type: String,
        enum: ["available", "busy", "offline"],
        default: "offline"
    },

    currentLocation: {
        lat: { type: Number, default: null },
        lng: { type: Number, default: null }
    },

    preferredMusic: {
        type: String,
        default: ""
    },

    hobbies: [{ type: String }],

    spokenLanguages: [{ type: String }],

    gender: {
        type: String,
        enum: ["male", "female", "other"],
        default: "other"
    },

    acceptsCarpoolRides: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("DriverProfile", driverProfileSchema);
