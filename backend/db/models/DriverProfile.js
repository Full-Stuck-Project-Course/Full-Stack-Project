// db/models/DriverProfile.js

const mongoose = require("mongoose");
const { toGeoPoint } = require("../../utils/geoLocation");

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

    // Documents are approved automatically on upload, so a driver is never left
    // waiting in "pending" — before a licence exists the status is simply
    // not_submitted.
    verificationStatus: {
        type: String,
        enum: ["not_submitted", "pending", "approved", "rejected"],
        default: "not_submitted"
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

    geoLocation: {
        type: {
            type: String,
            enum: ["Point"],
            default: undefined
        },
        coordinates: {
            type: [Number],
            default: undefined
        }
    },

    preferredMusic: {
        type: String,
        default: ""
    },

    hobbies: [{ type: String }],

    spokenLanguages: {
        type: [String],
        default: ["he"]
    },

    gender: {
        type: String,
        enum: ["male", "female"],
        required: true
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

driverProfileSchema.pre("validate", function syncGeoLocation(next) {
    const point = toGeoPoint(this.currentLocation?.lat, this.currentLocation?.lng);
    if (point) this.geoLocation = point;
    next();
});

driverProfileSchema.index({ status: 1, isVerified: 1, geoLocation: "2dsphere" });

module.exports = mongoose.model("DriverProfile", driverProfileSchema);
