// db/models/RideStop.js

const mongoose = require("mongoose");

const rideStopSchema = new mongoose.Schema({

    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
        required: true
    },

    order: {
        type: Number,
        required: true
    },

    address: {
        type: String,
        required: true,
        trim: true
    },

    lat: {
        type: Number,
        required: true
    },

    lng: {
        type: Number,
        required: true
    },

    estimatedArrivalTime: {
        type: Date,
        default: null
    },

    actualArrivalTime: {
        type: Date,
        default: null
    },

    stopType: {
        type: String,
        enum: [
            "pickup",
            "dropoff",
            "waypoint"
        ],
        default: "waypoint"
    },

    additionalPrice: {
        type: Number,
        default: 0
    },

    notes: {
        type: String,
        default: "",
        maxlength: 300
    }

}, {
    timestamps: true
});

module.exports = mongoose.model(
    "RideStop",
    rideStopSchema
);