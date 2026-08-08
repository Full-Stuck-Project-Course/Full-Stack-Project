// db/models/Upload.js

const mongoose = require("mongoose");

// Uploaded images live in MongoDB because the hosting tier has no persistent disk.
const uploadSchema = new mongoose.Schema({
    kind: {
        type: String,
        enum: ["profiles", "ids", "licenses", "vehicle-docs"],
        required: true
    },

    filename: {
        type: String,
        required: true,
        unique: true
    },

    mimeType: {
        type: String,
        required: true
    },

    size: {
        type: Number,
        required: true
    },

    data: {
        type: Buffer,
        required: true
    },

    uploadedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: null
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Upload", uploadSchema);
