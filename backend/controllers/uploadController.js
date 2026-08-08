// controllers/uploadController.js

const path = require("path");
const User = require("../db/models/User");
const DriverProfile = require("../db/models/DriverProfile");
const Upload = require("../db/models/Upload");
const Vehicle = require("../db/models/Vehicle");
const upload = require("../middleware/upload");
const { notifyDocumentApproved } = require("../utils/approvalNotifications");
const { sameId, isAdmin, canAccessDriver, forbidden } = require("../utils/authz");
const { deleteStoredUploads } = require("../utils/privacyCleanup");

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
        kind: folders[kind],
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

        const file = await Upload.findOne({ kind: resolved.kind, filename: resolved.safeName });
        if (!file) return res.status(404).json({ error: "File not found" });
        res.setHeader("Content-Type", file.mimeType);
        res.send(file.data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// GET /uploads/profiles/:filename  (public; profile pictures only)
async function getProfileImage(req, res) {
    try {
        const filename = path.basename(req.params.filename || "");
        if (!filename || filename !== req.params.filename) {
            return res.status(400).json({ error: "Invalid file path" });
        }

        const file = await Upload.findOne({ kind: "profiles", filename });
        if (!file) return res.status(404).json({ error: "File not found" });
        res.setHeader("Content-Type", file.mimeType);
        res.send(file.data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// POST /api/uploads/profile
async function uploadProfile(req, res) {
    try {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        if (!upload.isValidImageFile(req.file)) return invalidUploadedImage(req, res);

        const { storedPath } = await upload.saveUpload(req.file, "profiles", req.user.userId);
        const userId = isAdmin(req) && req.body.userId ? req.body.userId : req.user.userId;
        const user = await User.findByIdAndUpdate(userId, { profileImage: storedPath }, { new: true });
        if (!user) {
            upload.cleanupFile(req.file);
            return res.status(404).json({ error: "User not found" });
        }
        await notifyDocumentApproved(req, { userId: user._id, kind: "profiles" });
        res.json({ url: storedPath, message: "Profile image uploaded and approved" });
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

        const { storedPath } = await upload.saveUpload(req.file, "ids", req.user.userId);
        const userId = isAdmin(req) && req.body.userId ? req.body.userId : req.user.userId;
        const user = await User.findByIdAndUpdate(userId, {
            idPhotoPath: storedPath,
            idVerificationStatus: "approved"
        }, { new: true });
        if (!user) {
            upload.cleanupFile(req.file);
            return res.status(404).json({ error: "User not found" });
        }
        await notifyDocumentApproved(req, { userId: user._id, kind: "ids" });
        res.json({ url: storedPath, message: "ID photo uploaded and verified" });
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

        const { storedPath } = await upload.saveUpload(req.file, "licenses", req.user.userId);
        const driver = await DriverProfile.findByIdAndUpdate(req.body.driverProfileId, {
            licenseImagePath: storedPath,
            verificationStatus: "approved",
            isVerified: true
        }, { new: true });
        if (!driver) {
            upload.cleanupFile(req.file);
            return res.status(404).json({ error: "Driver not found" });
        }
        await notifyDocumentApproved(req, { userId: driver.userId, kind: "licenses" });
        res.json({ url: storedPath, message: "License photo uploaded and verified" });
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

        const { storedPath } = await upload.saveUpload(req.file, "vehicle-docs", req.user.userId);
        const hasTestAfterUpload = field === "test" || Boolean(vehicle.testImagePath);
        const hasInsuranceAfterUpload = field === "insurance" || Boolean(vehicle.insuranceImagePath);
        // Each document is approved the moment it arrives. The vehicle as a whole
        // only counts as approved once both documents exist; until then it is
        // "not_submitted" rather than "pending", because nothing is under review.
        const fullyDocumented = hasTestAfterUpload && hasInsuranceAfterUpload;
        const update = {
            documentsVerificationStatus: fullyDocumented ? "approved" : "not_submitted",
            testApproval: hasTestAfterUpload,
            insuranceApproval: hasInsuranceAfterUpload
        };
        if (field === "test") update.testImagePath = storedPath;
        if (field === "insurance") update.insuranceImagePath = storedPath;

        await Vehicle.findByIdAndUpdate(vehicle._id, update);

        const driver = await DriverProfile.findById(vehicle.driverId).select("userId");
        if (driver?.userId) {
            await notifyDocumentApproved(req, { userId: driver.userId, kind: "vehicle-docs" });
        }

        res.json({
            url: storedPath,
            message: fullyDocumented
                ? "Vehicle documents uploaded and verified"
                : "Vehicle document uploaded and approved; upload the remaining document to complete verification"
        });
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
        const users = await User.find({ idVerificationStatus: "pending" })
            .select("-passwordHash -resetPasswordToken -resetPasswordCodeHash -resetPasswordExpires -resetPasswordCodeAttempts");
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
        if (!["approved", "rejected", "not_submitted"].includes(status)) return res.status(400).json({ error: "Invalid status" });
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
        if (!["approved", "rejected", "not_submitted"].includes(status)) return res.status(400).json({ error: "Invalid status" });
        const existing = await DriverProfile.findById(req.params.driverProfileId);
        if (!existing) return res.status(404).json({ error: "Driver not found" });
        if (status === "approved" && !existing.licenseImagePath) {
            return res.status(400).json({ error: "Cannot approve driver before a license photo is uploaded" });
        }
        const update = { verificationStatus: status };
        if (status === "approved") update.isVerified = true;
        if (status === "rejected" || status === "not_submitted") { update.isVerified = false; update.status = "offline"; }
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
        if (!["approved", "rejected", "not_submitted"].includes(status)) return res.status(400).json({ error: "Invalid status" });
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
        if (status === "rejected" || status === "not_submitted") {
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

// DELETE /api/uploads/profile/:userId
async function deleteProfileImage(req, res) {
    try {
        if (!isAdmin(req) && !sameId(req.user.userId, req.params.userId)) return forbidden(res);
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        await deleteStoredUploads([user.profileImage]);
        user.profileImage = null;
        await user.save();
        res.json({ message: "Profile image deleted" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// DELETE /api/uploads/id-photo/:userId
async function deleteIdPhoto(req, res) {
    try {
        const user = await User.findById(req.params.userId);
        if (!user) return res.status(404).json({ error: "User not found" });
        await deleteStoredUploads([user.idPhotoPath]);
        user.idPhotoPath = null;
        user.idVerificationStatus = "not_submitted";
        await user.save();
        res.json({ message: "ID photo deleted" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// DELETE /api/uploads/license/:driverProfileId
async function deleteDriverLicensePhoto(req, res) {
    try {
        const driver = await DriverProfile.findById(req.params.driverProfileId);
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        await deleteStoredUploads([driver.licenseImagePath]);
        driver.licenseImagePath = null;
        driver.verificationStatus = "not_submitted";
        driver.isVerified = false;
        driver.status = "offline";
        await driver.save();
        res.json({ message: "Driver license photo deleted" });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}

// DELETE /api/uploads/vehicle-docs/:vehicleId
async function deleteVehicleDocuments(req, res) {
    try {
        const vehicle = await Vehicle.findById(req.params.vehicleId);
        if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });
        await deleteStoredUploads([vehicle.testImagePath, vehicle.insuranceImagePath]);
        vehicle.testImagePath = null;
        vehicle.insuranceImagePath = null;
        vehicle.testApproval = false;
        vehicle.insuranceApproval = false;
        vehicle.documentsVerificationStatus = "not_submitted";
        await vehicle.save();
        res.json({ message: "Vehicle documents deleted" });
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
    getProfileImage,
    getPendingVerifications,
    verifyId,
    verifyDriverLicense,
    verifyVehicleDocuments,
    deleteProfileImage,
    deleteIdPhoto,
    deleteDriverLicensePhoto,
    deleteVehicleDocuments
};
