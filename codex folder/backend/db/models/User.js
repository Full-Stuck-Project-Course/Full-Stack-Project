// db/models/User.js

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },

    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, "Invalid email format"]
    },

    passwordHash: {
        type: String,
        required: true
    },

    phone: {
        type: String,
        required: true,
        unique: true
    },

    profileImage: {
        type: String,
        default: null
    },

    idNumber: {
        type: String,
        trim: true,
        default: ""
    },

    idDocumentImage: {
        type: String,
        default: ""
    },

    identityStatus: {
        type: String,
        enum: ["pending_review", "approved", "rejected"],
        default: "pending_review"
    },

    role: {
        type: String,
        enum: ["passenger", "driver", "both", "admin"],
        default: "passenger"
    },

    preferredLanguage: {
        type: String,
        enum: ["he", "en"],
        default: "he"
    },

    isActive: {
        type: Boolean,
        default: true
    },

    isEmailVerified: {
        type: Boolean,
        default: false
    },

    lastLoginAt: {
        type: Date,
        default: null
    },

    passwordResetCode: {
        type: String,
        default: null
    },

    passwordResetExpiresAt: {
        type: Date,
        default: null
    },

    referralCode: {
        type: String,
        default: ""
    },

    referredBy: {
        type: String,
        default: ""
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("User", userSchema);
