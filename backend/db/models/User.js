// db/models/User.js

const mongoose = require("mongoose");
const crypto = require("crypto");

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
        type: String
    },

    phone: {
        type: String,
        unique: true,
        sparse: true
    },

    profileImage: {
        type: String,
        default: null
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

    // Password reset
    resetPasswordToken: {
        type: String,
        default: null
    },

    resetPasswordCodeHash: {
        type: String,
        default: null
    },

    resetPasswordExpires: {
        type: Date,
        default: null
    },

    resetPasswordCodeAttempts: {
        type: Number,
        default: 0
    },

    // Identity verification
    idPhotoPath: {
        type: String,
        default: null
    },

    idVerificationStatus: {
        type: String,
        enum: ["not_submitted", "pending", "approved", "rejected"],
        default: "not_submitted"
    },

    // Referral system
    referralCode: {
        type: String,
        unique: true,
        sparse: true
    },

    referredBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    },

    // Loyalty
    loyaltyPoints: {
        type: Number,
        default: 0
    }

}, {
    timestamps: true
});

userSchema.pre("save", function (next) {
    if (!this.referralCode) {
        this.referralCode = crypto.randomBytes(4).toString("hex").toUpperCase();
    }
    next();
});

module.exports = mongoose.model("User", userSchema);
