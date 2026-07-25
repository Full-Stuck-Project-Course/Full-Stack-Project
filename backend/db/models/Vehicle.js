// db/models/Vehicle.js

const mongoose = require("mongoose");

const vehicleSchema = new mongoose.Schema({

    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DriverProfile",
        required: true
    },

    company: {
        type: String,
        required: true,
        trim: true
    },

    model: {
        type: String,
        required: true,
        trim: true
    },

    year: {
        type: Number,
        required: true,
        min: 1990,
        max: new Date().getFullYear() + 1
    },

    color: {
        type: String,
        required: true
    },

    licensePlate: {
        type: String,
        required: true,
        unique: true,
        match: /^\d{7,8}$/
    },

    vehicleType: {
        type: String,
        enum: ["regular", "comfort", "luxury", "van"],
        default: "regular"
    },

    seats: {
        type: Number,
        default: 4,
        min: 2,
        max: 8
    },

    testApproval: {
        type: Boolean,
        default: false
    },

    testImagePath: {
        type: String,
        default: null
    },

    insuranceApproval: {
        type: Boolean,
        default: false
    },

    insuranceImagePath: {
        type: String,
        default: null
    },

    documentsVerificationStatus: {
        type: String,
        enum: ["not_submitted", "pending", "approved", "rejected"],
        default: "not_submitted"
    },

    allowPets: {
        type: Boolean,
        default: true
    },

    isActive: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true
});

module.exports = mongoose.model(
    "Vehicle",
    vehicleSchema
);
