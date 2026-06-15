// controllers/uploadController.js

const User          = require("../db/models/User");
const DriverProfile = require("../db/models/DriverProfile");
const path          = require("path");

// POST /api/uploads/profile
async function uploadProfile(req, res) {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const url = `/uploads/profiles/${req.file.filename}`;
        if (req.body.userId) {
            await User.findByIdAndUpdate(req.body.userId, { profileImage: url });
        }
        res.json({ url, message: "Profile image uploaded" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// POST /api/uploads/id-photo
async function uploadIdPhoto(req, res) {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const url = `/uploads/ids/${req.file.filename}`;
        if (req.body.userId) {
            await User.findByIdAndUpdate(req.body.userId, {
                idPhotoPath: url,
                idVerificationStatus: "pending"
            });
        }
        res.json({ url, message: "ID photo uploaded and sent for review" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// POST /api/uploads/license
async function uploadLicense(req, res) {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const url = `/uploads/licenses/${req.file.filename}`;
        if (req.body.driverProfileId) {
            await DriverProfile.findByIdAndUpdate(req.body.driverProfileId, {
                licenseImagePath: url,
                verificationStatus: "pending"
            });
        }
        res.json({ url, message: "License photo uploaded and sent for review" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// GET /api/uploads/pending  (admin)
async function getPendingVerifications(req, res) {
    try {
        const users   = await User.find({ idVerificationStatus: "pending" }).select("-passwordHash");
        const drivers = await DriverProfile.find({ verificationStatus: "pending" }).populate("userId", "fullName email");
        res.json({ pendingIds: users, pendingLicenses: drivers });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// PUT /api/uploads/verify-id/:userId
async function verifyId(req, res) {
    try {
        const { status } = req.body; // "approved" | "rejected"
        await User.findByIdAndUpdate(req.params.userId, { idVerificationStatus: status });
        res.json({ message: "ID verification updated" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// PUT /api/uploads/verify-driver/:driverProfileId
async function verifyDriverLicense(req, res) {
    try {
        const { status } = req.body;
        const update = { verificationStatus: status };
        if (status === "approved") update.isVerified = true;
        await DriverProfile.findByIdAndUpdate(req.params.driverProfileId, update);
        res.json({ message: "Driver verification updated" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

module.exports = { uploadProfile, uploadIdPhoto, uploadLicense, getPendingVerifications, verifyId, verifyDriverLicense };
