// db/models/Ride.js

const mongoose = require("mongoose");

const rideSchema = new mongoose.Schema({

    passengerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PassengerProfile",
        required: true
    },

    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DriverProfile",
        default: null
    },

    vehicleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Vehicle",
        default: null
    },

    pickupLocation: {
        address: { type: String, required: true },
        lat:     { type: Number, required: true },
        lng:     { type: Number, required: true }
    },

    destinationLocation: {
        address: { type: String, required: true },
        lat:     { type: Number, required: true },
        lng:     { type: Number, required: true }
    },

    status: {
        type: String,
        enum: [
            "searching",
            "accepted",
            "driver_arriving",
            "in_progress",
            "completed",
            "cancelled"
        ],
        default: "searching"
    },

    rideType: {
        type: String,
        enum: ["ride", "delivery", "carpool"],
        default: "ride"
    },

    scheduledTime: {
        type: Date,
        default: null
    },

    distanceKm:               { type: Number, default: 0 },
    estimatedDurationMinutes: { type: Number, default: 0 },
    basePrice:                { type: Number, default: 0 },
    surgeMultiplier:          { type: Number, default: 1 },
    finalPrice:               { type: Number, default: 0 },
    passengerCount:           { type: Number, default: 1, min: 1 },
    cancellationFee:          { type: Number, default: 0 },

    cancellationReason: { type: String, default: "" },

    cancelledBy: {
        type: String,
        enum: ["passenger", "driver", "system", null],
        default: null
    },

    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null }

}, {
    timestamps: true
});

rideSchema.index({ passengerId: 1, status: 1 });
rideSchema.index({ driverId: 1, status: 1 });
rideSchema.index({ status: 1, scheduledTime: 1 });

module.exports = mongoose.model("Ride", rideSchema);
