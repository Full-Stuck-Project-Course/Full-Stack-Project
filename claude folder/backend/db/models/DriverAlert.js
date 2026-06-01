// db/models/DriverAlert.js

const mongoose = require("mongoose");

const driverAlertSchema = new mongoose.Schema({

    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "DriverProfile",
        required: true
    },

    alertType: {
        type: String,
        enum: [
            "high_demand",
            "low_demand",
            "traffic",
            "system",
            "ride_request"
        ],
        required: true
    },

    title: {
        type: String,
        required: true,
        trim: true
    },

    message: {
        type: String,
        required: true,
        trim: true
    },

    area: {

        city: {
            type: String,
            default: ""
        },

        address: {
            type: String,
            default: ""
        },

        lat: {
            type: Number,
            default: null
        },

        lng: {
            type: Number,
            default: null
        }
    },

    demandLevel: {
        type: String,
        enum: ["low", "medium", "high"],
        default: "medium"
    },

    isRead: {
        type: Boolean,
        default: false
    },

    expiresAt: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});

module.exports = mongoose.model(
    "DriverAlert",
    driverAlertSchema
);