// db/models/PassengerProfile.js

const mongoose = require("mongoose");

const passengerProfileSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        unique: true
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

    preferredDriverGender: {
        type: String,
        enum: ["male", "female", "any"],
        default: "any"
    },

    preferredMatching: {
        type: String,
        enum: ["closest", "highest_rated"],
        default: "closest"
    },

    savedLocations: [{
        name:    { type: String },
        address: { type: String },
        lat:     { type: Number },
        lng:     { type: Number }
    }],

    loyaltyPoints: {
        type: Number,
        default: 0
    },

    totalSpent: {
        type: Number,
        default: 0
    },

    referralBonusRides: {
        type: Number,
        default: 0
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("PassengerProfile", passengerProfileSchema);
