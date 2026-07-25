// db/models/Notification.js

const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },

    type: {
        type: String,
        enum: [
            "ride_accepted",
            "driver_arriving",
            "ride_started",
            "ride_completed",
            "ride_cancelled",
            "payment_received",
            "rating_received",
            "promo",
            "system"
        ],
        required: true
    },

    title: {
        type: String,
        required: true,
        trim: true
    },

    body: {
        type: String,
        required: true,
        trim: true
    },

    rideId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ride",
        default: null
    },

    isRead: {
        type: Boolean,
        default: false
    },

    readAt: {
        type: Date,
        default: null
    }

}, {
    timestamps: true
});

notificationSchema.index({ userId: 1, isRead: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
