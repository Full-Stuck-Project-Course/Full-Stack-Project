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
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("User", userSchema);
