// controllers/uploadController.js

const path = require("path");
const User = require("../db/models/User");
const DriverProfile = require("../db/models/DriverProfile");
const Vehicle = require("../db/models/Vehicle");
const upload = require("../middleware/upload");
const { sameId, isAdmin, canAccessDriver, forbidden } = require("../utils/authz");

function invalidUploadedImage(req, res) {
    upload.cleanupFile(req.file);
    return res.status(400).json({ error: "Invalid image file" });
}

function securePath(kind, filename) {
    const safeName = path.basename(filename || "");
    if (!safeName || safeName !== filename) return null;

    const folders = {
        ids: "ids",
        licenses: "licenses",
        "vehicle-docs": "vehicle-docs"
    };
    if (!folders[kind]) return null;

    return {
        safeName,
        diskPath: path.join(__dirname, "..", "uploads", folders[kind], safeName),
        storedPath: `/uploads/${folders[kind]}/${safeName}`
    };
}

async function canAccessSecureUpload(req, kind, storedPath) {
    if (isAdmin(req)) return true;

    if (kind === "ids") {
        const user = await User.findOne({ idPhotoPath: storedPath }).select("_id");
        return Boolean(user && sameId(user._id, req.user.userId));
    }

    if (kind === "licenses") {
        const driver = await DriverProfile.findOne({ licenseImagePath: storedPath }).select("_id");
        return Boolean(driver && await canAccessDriver(req, driver._id));
    }

    if (kind === "vehicle-docs") {
        const vehicle = await Vehicle.findOne({
            $or: [
                { testImagePath: storedPath },
                { insuranceImagePath: storedPath }
            ]
        }).select("driverId");
        return Boolean(vehicle && await canAccessDriver(req, vehicle.driverId));
    }

    return false;
}

// GET /api/uploads/secure/:kind/:filename
async function getSecureUpload(req, res) {
    try {
        const resolved = securePath(req.params.kind, req.params.filename);
        if (!resolved) return res.status(400).json({ error: "Invalid file path" });
        if (!await canAccessSecureUpload(req, req.params.kind, resolved.storedPath)) return forbidden(res);
        res.sendFile(resolved.diskPath, (error) => {
            if (!error) return;
            if (res.headersSent) return;
            res.status(error.statusCode === 404 ? 404 : 500).json({ error: "File could not be served" });
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// POST /api/uploads/profile
async function uploadProfile(req, res) {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        if (!upload.isValidImageFile(req.file)) return invalidUploadedImage(req, res);

        const url = `/uploads/profiles/${req.file.filename}`;
        const userId = isAdmin(req) && req.body.userId ? req.body.userId : req.user.userId;
        const user = await User.findByIdAndUpdate(userId, { profileImage: url }, { new: true });
        if (!user) {
            upload.cleanupFile(req.file);
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ url, message: "Profile image uploaded" });
    } catch (e) {
        upload.cleanupFile(req.file);
        res.status(500).json({ error: e.message });
    }
}

// POST /api/uploads/id-photo
async function uploadIdPhoto(req, res) {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        if (!upload.isValidImageFile(req.file)) return invalidUploadedImage(req, res);

        const url = `/uploads/ids/${req.file.filename}`;
        const userId = isAdmin(req) && req.body.userId ? req.body.userId : req.user.userId;
        const user = await User.findByIdAndUpdate(userId, {
            idPhotoPath: url,
            idVerificationStatus: "pending"
        }, { new: true });
        if (!user) {
            upload.cleanupFile(req.file);
            return res.status(404).json({ error: "User not found" });
        }
        res.json({ url, message: "ID photo uploaded and sent for review" });
    } catch (e) {
        upload.cleanupFile(req.file);
        res.status(500).json({ error: e.message });
    }
}

// POST /api/uploads/license
async function uploadLicense(req, res) {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        if (!upload.isValidImageFile(req.file)) return invalidUploadedImage(req, res);
        if (!req.body.driverProfileId) {
            upload.cleanupFile(req.file);
            return res.status(400).json({ error: "driverProfileId is required" });
        }
        if (!await canAccessDriver(req, req.body.driverProfileId)) {
            upload.cleanupFile(req.file);
            return forbidden(res);
        }

        const url = `/uploads/licenses/${req.file.filename}`;
        const driver = await DriverProfile.findByIdAndUpdate(req.body.driverProfileId, {
            licenseImagePath: url,
            verificationStatus: "pending",
            isVerified: false,
            status: "offline"
        });
        if (!driver) {
            upload.cleanupFile(req.file);
            return res.status(404).json({ error: "Driver not found" });
        }
        res.json({ url, message: "License photo uploaded and sent for review" });
    } catch (e) {
        upload.cleanupFile(req.file);
        res.status(500).json({ error: e.message });
    }
}

async function uploadVehicleDocument(req, res, field) {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        if (!upload.isValidImageFile(req.file)) return invalidUploadedImage(req, res);
        if (!req.body.vehicleId) {
            upload.cleanupFile(req.file);
            return res.status(400).json({ error: "vehicleId is required" });
        }

        const vehicle = await Vehicle.findById(req.body.vehicleId);
        if (!vehicle) {
            upload.cleanupFile(req.file);
            return res.status(404).json({ error: "Vehicle not found" });
        }
        if (!await canAccessDriver(req, vehicle.driverId)) {
            upload.cleanupFile(req.file);
            return forbidden(res);
        }

        const url = `/uploads/vehicle-docs/${req.file.filename}`;
        const update = {
            documentsVerificationStatus: "pending",
            testApproval: false,
            insuranceApproval: false
        };
        if (field === "test") update.testImagePath = url;
        if (field === "insurance") update.insuranceImagePath = url;

        await Vehicle.findByIdAndUpdate(vehicle._id, update);
        res.json({ url, message: "Vehicle document uploaded and sent for review" });
    } catch (e) {
        upload.cleanupFile(req.file);
        res.status(500).json({ error: e.message });
    }
}

async function uploadVehicleTest(req, res) {
    return uploadVehicleDocument(req, res, "test");
}

async function uploadVehicleInsurance(req, res) {
    return uploadVehicleDocument(req, res, "insurance");
}

// GET /api/uploads/pending  (admin)
async function getPendingVerifications(req, res) {
    try {
        const users = await User.find({ idVerificationStatus: "pending" }).select("-passwordHash -resetPasswordToken");
        const drivers = await DriverProfile.find({ verificationStatus: "pending" }).populate("userId", "fullName email");
        const vehicles = await Vehicle.find({ documentsVerificationStatus: "pending" })
            .populate({
                path: "driverId",
                populate: { path: "userId", select: "fullName email" }
            });
        res.json({ pendingIds: users, pendingLicenses: drivers, pendingVehicles: vehicles });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// PUT /api/uploads/verify-id/:userId
async function verifyId(req, res) {
    try {
        const { status } = req.body;
        if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });
        const existing = await User.findById(req.params.userId);
        if (!existing) return res.status(404).json({ error: "User not found" });
        if (status === "approved" && !existing.idPhotoPath) {
            return res.status(400).json({ error: "Cannot approve ID before a photo is uploaded" });
        }
        const user = await User.findByIdAndUpdate(req.params.userId, { idVerificationStatus: status });
        if (!user) return res.status(404).json({ error: "User not found" });
        res.json({ message: "ID verification updated" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// PUT /api/uploads/verify-driver/:driverProfileId
async function verifyDriverLicense(req, res) {
    try {
        const { status } = req.body;
        if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });
        const existing = await DriverProfile.findById(req.params.driverProfileId);
        if (!existing) return res.status(404).json({ error: "Driver not found" });
        if (status === "approved" && !existing.licenseImagePath) {
            return res.status(400).json({ error: "Cannot approve driver before a license photo is uploaded" });
        }
        const update = { verificationStatus: status };
        if (status === "approved") update.isVerified = true;
        if (status === "rejected") { update.isVerified = false; update.status = "offline"; }
        const driver = await DriverProfile.findByIdAndUpdate(req.params.driverProfileId, update);
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.json({ message: "Driver verification updated" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// PUT /api/uploads/verify-vehicle/:vehicleId
async function verifyVehicleDocuments(req, res) {
    try {
        const { status } = req.body;
        if (!["approved", "rejected"].includes(status)) return res.status(400).json({ error: "Invalid status" });
        const existing = await Vehicle.findById(req.params.vehicleId);
        if (!existing) return res.status(404).json({ error: "Vehicle not found" });
        if (status === "approved" && (!existing.testImagePath || !existing.insuranceImagePath)) {
            return res.status(400).json({ error: "Cannot approve vehicle before test and insurance documents are uploaded" });
        }
        const update = { documentsVerificationStatus: status };
        if (status === "approved") {
            update.testApproval = true;
            update.insuranceApproval = true;
        }
        if (status === "rejected") {
            update.testApproval = false;
            update.insuranceApproval = false;
        }
        const vehicle = await Vehicle.findByIdAndUpdate(req.params.vehicleId, update);
        if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
        res.json({ message: "Vehicle verification updated" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

module.exports = {
    uploadProfile,
    uploadIdPhoto,
    uploadLicense,
    uploadVehicleTest,
    uploadVehicleInsurance,
    getSecureUpload,
    getPendingVerifications,
    verifyId,
    verifyDriverLicense,
    verifyVehicleDocuments
};
