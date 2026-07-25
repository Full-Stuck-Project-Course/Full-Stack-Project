// db/models/Rating.js

const mongoose = require("mongoose");

const ratingSchema = new mongoose.Schema({

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

    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5
    },

    comment: {
        type: String,
        default: "",
        trim: true,
        maxlength: 500
    },

    complaint: {
        type: String,
        default: "",
        trim: true,
        maxlength: 1000
    },

    tags: [{
        type: String
    }],

    wouldRideAgain: {
        type: Boolean,
        default: true
    }

}, {
    timestamps: true
});

ratingSchema.index({ rideId: 1 }, { unique: true });

module.exports = mongoose.model(
    "Rating",
    ratingSchema
);
