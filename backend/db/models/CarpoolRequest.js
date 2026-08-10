// db/models/CarpoolRequest.js

const mongoose = require("mongoose");

const carpoolRequestSchema = new mongoose.Schema({

    passengerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PassengerProfile",
        required: true
    },

    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
        default: null
    },

    // The driver who approved this passenger. Null while the request is still
    // waiting in the queue.
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DriverProfile",
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

    requestedTime: {
        type: Date,
        required: true
    },

    seatsNeeded: {
        type: Number,
        default: 1,
        min: 1,
        max: 4
    },

    status: {
        type: String,
        enum: ["pending", "matched", "confirmed", "cancelled", "completed"],
        default: "pending"
    },

    maxDetourMinutes: {
        type: Number,
        default: 10
    },

    pricePerSeat: {
        type: Number,
        default: 0
    },

    notes: {
        type: String,
        default: "",
        maxlength: 300
    },

    expiresAt: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});

carpoolRequestSchema.index({ status: 1, requestedTime: 1 });
carpoolRequestSchema.index({ passengerId: 1, status: 1 });
carpoolRequestSchema.index({ driverId: 1, status: 1 });
carpoolRequestSchema.index({ rideId: 1, status: 1 });

module.exports = mongoose.model("CarpoolRequest", carpoolRequestSchema);
