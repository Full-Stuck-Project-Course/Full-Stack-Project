// db/models/Rating.js

const mongoose = require("mongoose");

const RATING_DIRECTIONS = Object.freeze({
    PASSENGER_TO_DRIVER: "passenger_to_driver",
    DRIVER_TO_PASSENGER: "driver_to_passenger"
});

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

    direction: {
        type: String,
        enum: Object.values(RATING_DIRECTIONS),
        default: RATING_DIRECTIONS.PASSENGER_TO_DRIVER,
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

ratingSchema.index({ rideId: 1, direction: 1 }, { unique: true });
ratingSchema.index({ driverId: 1, direction: 1, createdAt: -1 });
ratingSchema.index({ passengerId: 1, direction: 1, createdAt: -1 });

const Rating = mongoose.model(
    "Rating",
    ratingSchema
);

Rating.RATING_DIRECTIONS = RATING_DIRECTIONS;

module.exports = Rating;
