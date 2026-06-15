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
        required: true
    },

    color: {
        type: String,
        required: true
    },

    licensePlate: {
        type: String,
        required: true,
        unique: true
    },

    vehicleType: {
        type: String,
        enum: ["regular", "comfort", "luxury", "van"],
        default: "regular"
    },

    seats: {
        type: Number,
        default: 4
    },

    testApproval: {
        type: Boolean,
        default: false
    },

    insuranceApproval: {
        type: Boolean,
        default: false
    },

    allowPets: {
        type: Boolean,
        default: true
    },

    conditions: {
        type: String,
        default: ""
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
