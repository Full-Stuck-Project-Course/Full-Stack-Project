// controllers/driverController.js

const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const User = require("../db/models/User");
const Vehicle = require("../db/models/Vehicle");
const { isAdmin, canAccessDriver, forbidden } = require("../utils/authz");
const { hasValidCoordinates } = require("../utils/pricing");
const { toGeoPoint } = require("../utils/geoLocation");
const { deleteStoredUploads } = require("../utils/privacyCleanup");
const upload = require("../middleware/upload");

const VALID_DRIVER_GENDERS = new Set(["male", "female"]);

const DRIVER_UPDATE_FIELDS = [
    "licenseNumber",
    "spokenLanguages",
    "hobbies",
    "preferredMusic",
    "gender",
    "licenseExpiry",
    "acceptsCarpoolRides",
    "vehicleConditions"
];

const REQUIRED_SETUP_FILE_FIELDS = ["licensePhoto", "testPhoto", "insurancePhoto"];

function firstUpload(req, field) {
    const files = req.files?.[field];
    return Array.isArray(files) ? files[0] : files;
}

function cleanupSetupUploads(req) {
    for (const field of REQUIRED_SETUP_FILE_FIELDS) {
        upload.cleanupFile(firstUpload(req, field));
    }
}

async function storedUploadPath(file, folder, userId) {
    if (!file) return null;
    const { storedPath } = await upload.saveUpload(file, folder, userId);
    return storedPath;
}

function parseBoolean(value, fallback = false) {
    if (value === undefined) return fallback;
    if (typeof value === "boolean") return value;
    return String(value).toLowerCase() === "true";
}

function parseJson(value, fallback) {
    if (value === undefined) return fallback;
    if (typeof value === "object") return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function parseStringList(value) {
    const parsed = parseJson(value, value);
    if (Array.isArray(parsed)) return parsed.map(item => String(item).trim()).filter(Boolean);
    return String(parsed || "").split(",").map(item => item.trim()).filter(Boolean);
}

function duplicateError(field) {
    const error = new Error(`${field} already exists`);
    error.statusCode = 409;
    return error;
}

async function updateUserRoleAfterDriverSetup(userId) {
    const existingUser = await User.findById(userId);
    let newRole = "driver";
    if (existingUser?.role === "admin") {
        newRole = "admin";
    } else if (existingUser?.role === "passenger" || existingUser?.role === "both") {
        newRole = "both";
    }
    await User.findByIdAndUpdate(userId, { role: newRole });
}

function assertValidSetupUpload(file) {
    return file && upload.isValidImageFile(file);
}

// POST /drivers
async function registerDriver(req, res) {
    try {
        const userId = isAdmin(req) && req.body.userId ? req.body.userId : req.user.userId;
        const {
            licenseNumber,
            spokenLanguages,
            hobbies,
            preferredMusic,
            gender,
            licenseExpiry,
            acceptsCarpoolRides,
            vehicleConditions
        } = req.body;

        if (!VALID_DRIVER_GENDERS.has(gender)) {
            return res.status(400).json({ error: "Driver gender must be male or female" });
        }

        const existing = await DriverProfile.findOne({ userId });
        if (existing) return res.status(409).json({ error: "Driver profile already exists for this user" });

        const driver = await DriverProfile.create({
            userId,
            licenseNumber,
            spokenLanguages,
            hobbies,
            preferredMusic,
            gender,
            licenseExpiry,
            acceptsCarpoolRides,
            vehicleConditions
        });

        const existingUser = await User.findById(userId);
        let newRole = "driver";
        if (existingUser?.role === "admin") {
            newRole = "admin";
        } else if (existingUser?.role === "passenger" || existingUser?.role === "both") {
            newRole = "both";
        }
        await User.findByIdAndUpdate(userId, { role: newRole });

        res.status(201).json({ message: "Driver registered successfully", driver });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /drivers/setup
async function completeDriverSetup(req, res) {
    let createdDriverId = null;
    let createdVehicleId = null;

    try {
        const userId = isAdmin(req) && req.body.userId ? req.body.userId : req.user.userId;
        const existingDriver = await DriverProfile.findOne({ userId });
        const existingVehicle = existingDriver
            ? await Vehicle.findOne({ driverId: existingDriver._id })
            : null;

        const licensePhoto = firstUpload(req, "licensePhoto");
        const testPhoto = firstUpload(req, "testPhoto");
        const insurancePhoto = firstUpload(req, "insurancePhoto");

        const hasLicensePhoto = Boolean(licensePhoto || existingDriver?.licenseImagePath);
        const hasTestPhoto = Boolean(testPhoto || existingVehicle?.testImagePath);
        const hasInsurancePhoto = Boolean(insurancePhoto || existingVehicle?.insuranceImagePath);
        if (!hasLicensePhoto || !hasTestPhoto || !hasInsurancePhoto) {
            cleanupSetupUploads(req);
            return res.status(400).json({ error: "Driver license, vehicle test, and insurance photos are required" });
        }

        for (const file of [licensePhoto, testPhoto, insurancePhoto].filter(Boolean)) {
            if (!assertValidSetupUpload(file)) {
                cleanupSetupUploads(req);
                return res.status(400).json({ error: "Invalid image file" });
            }
        }

        const gender = req.body.gender;
        if (!VALID_DRIVER_GENDERS.has(gender)) {
            cleanupSetupUploads(req);
            return res.status(400).json({ error: "Driver gender must be male or female" });
        }

        const licenseNumber = String(req.body.licenseNumber || "").trim();
        const licensePlate = String(req.body.licensePlate || "").trim();
        const licenseOwner = await DriverProfile.findOne({
            licenseNumber,
            ...(existingDriver ? { _id: { $ne: existingDriver._id } } : {})
        });
        if (licenseOwner) throw duplicateError("licenseNumber");

        const plateOwner = await Vehicle.findOne({
            licensePlate,
            ...(existingVehicle ? { _id: { $ne: existingVehicle._id } } : {})
        });
        if (plateOwner) throw duplicateError("licensePlate");

        // Persist the images only once every validation above has passed.
        const [licensePath, testPath, insurancePath] = await Promise.all([
            storedUploadPath(licensePhoto, "licenses", userId),
            storedUploadPath(testPhoto, "vehicle-docs", userId),
            storedUploadPath(insurancePhoto, "vehicle-docs", userId)
        ]);

        const driverPayload = {
            userId,
            licenseNumber,
            gender,
            preferredMusic: req.body.preferredMusic || "",
            hobbies: parseStringList(req.body.hobbies),
            spokenLanguages: parseStringList(req.body.spokenLanguages),
            acceptsCarpoolRides: parseBoolean(req.body.acceptsCarpoolRides, true),
            vehicleConditions: parseJson(req.body.vehicleConditions, { noPets: false, noSmoking: true, noFood: false }),
            licenseExpiry: req.body.licenseExpiry || undefined,
            licenseImagePath: licensePath || existingDriver?.licenseImagePath,
            verificationStatus: "approved",
            isVerified: true
        };

        const vehiclePayload = {
            driverId: existingDriver?._id,
            company: req.body.company,
            model: req.body.model,
            year: Number(req.body.year),
            color: req.body.color,
            licensePlate,
            vehicleType: req.body.vehicleType || "regular",
            seats: Number(req.body.seats || 4),
            testImagePath: testPath || existingVehicle?.testImagePath,
            insuranceImagePath: insurancePath || existingVehicle?.insuranceImagePath,
            testApproval: true,
            insuranceApproval: true,
            documentsVerificationStatus: "approved"
        };

        let driver = existingDriver;
        let vehicle = existingVehicle;

        if (!driver) {
            driver = await DriverProfile.create(driverPayload);
            createdDriverId = driver._id;
            vehiclePayload.driverId = driver._id;
        }

        if (vehicle) {
            vehicle = await Vehicle.findByIdAndUpdate(vehicle._id, vehiclePayload, {
                new: true, runValidators: true
            });
        } else {
            vehicle = await Vehicle.create(vehiclePayload);
            createdVehicleId = vehicle._id;
        }

        if (existingDriver) {
            driver = await DriverProfile.findByIdAndUpdate(existingDriver._id, driverPayload, {
                new: true, runValidators: true
            });
        }

        await updateUserRoleAfterDriverSetup(userId);

        res.status(existingDriver ? 200 : 201).json({
            message: "Driver setup completed successfully",
            driver,
            vehicle
        });
    } catch (error) {
        cleanupSetupUploads(req);
        if (createdVehicleId) await Vehicle.findByIdAndDelete(createdVehicleId).catch(() => {});
        if (createdDriverId) await DriverProfile.findByIdAndDelete(createdDriverId).catch(() => {});

        if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
        if (error?.code === 11000) {
            const field = Object.keys(error.keyValue || {})[0] || "field";
            return res.status(409).json({ error: `${field} already exists` });
        }
        res.status(400).json({ error: error.message });
    }
}

// GET /drivers
async function getAllDrivers(req, res) {
    try {
        const { status, isVerified } = req.query;
        const filter = {};
        if (status)     filter.status = status;
        if (isVerified !== undefined) filter.isVerified = isVerified === "true";
        if (!isAdmin(req)) filter.userId = req.user.userId;

        const drivers = await DriverProfile.find(filter).populate("userId", "-passwordHash");
        res.status(200).json(drivers);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /drivers/available
async function getAvailableDrivers(req, res) {
    try {
        const drivers = await DriverProfile.find({ status: "available", isVerified: true })
            .select("userId ratingAverage totalRides currentLocation status")
            .populate("userId", "fullName");
        const sanitized = drivers.map(driver => ({
            _id: driver._id,
            userId: driver.userId,
            ratingAverage: driver.ratingAverage,
            totalRides: driver.totalRides,
            status: driver.status,
            currentLocation: hasValidCoordinates(driver.currentLocation?.lat, driver.currentLocation?.lng)
                ? {
                    lat: Math.round(Number(driver.currentLocation.lat) * 1000) / 1000,
                    lng: Math.round(Number(driver.currentLocation.lng) * 1000) / 1000,
                    updatedAt: driver.currentLocation.updatedAt
                }
                : null
        }));
        res.status(200).json(sanitized);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /drivers/:id
async function getDriverById(req, res) {
    try {
        if (!await canAccessDriver(req, req.params.id)) {
            return forbidden(res);
        }
        const driver = await DriverProfile.findById(req.params.id).populate("userId", "-passwordHash");
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json(driver);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /drivers/:id
async function updateDriver(req, res) {
    try {
        if (!await canAccessDriver(req, req.params.id)) {
            return forbidden(res);
        }
        const existing = await DriverProfile.findById(req.params.id);
        if (!existing) return res.status(404).json({ error: "Driver not found" });

        const update = {};
        for (const key of DRIVER_UPDATE_FIELDS) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }
        if (update.gender !== undefined && !VALID_DRIVER_GENDERS.has(update.gender)) {
            return res.status(400).json({ error: "Driver gender must be male or female" });
        }
        if (req.body.licenseNumber !== undefined && String(req.body.licenseNumber) !== String(existing.licenseNumber)) {
            update.isVerified = false;
            update.verificationStatus = "pending";
            update.status = "offline";
        }
        const driver = await DriverProfile.findByIdAndUpdate(req.params.id, update, {
            new: true, runValidators: true
        });
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json({ message: "Driver updated successfully", driver });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /drivers/:id/status
async function updateDriverStatus(req, res) {
    try {
        const { status } = req.body;
        if (!await canAccessDriver(req, req.params.id)) {
            return forbidden(res);
        }
        if (status === "available") {
            const driverCheck = await DriverProfile.findById(req.params.id);
            if (driverCheck && !driverCheck.isVerified) {
                return res.status(403).json({ error: "Driver must be verified before becoming available" });
            }
        }
        const driver = await DriverProfile.findByIdAndUpdate(
            req.params.id, { status }, { new: true, runValidators: true }
        );
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json({ message: "Status updated", driver });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /drivers/:id/location
async function updateLocation(req, res) {
    try {
        const { lat, lng } = req.body;
        if (!await canAccessDriver(req, req.params.id)) {
            return forbidden(res);
        }
        if (!hasValidCoordinates(lat, lng)) {
            return res.status(400).json({ error: "Invalid driver location" });
        }
        const driver = await DriverProfile.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    currentLocation: { lat: Number(lat), lng: Number(lng), updatedAt: new Date() },
                    geoLocation: toGeoPoint(lat, lng)
                }
            },
            { new: true }
        );
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json({ message: "Location updated", currentLocation: driver.currentLocation });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /drivers/:id/verify
async function verifyDriver(req, res) {
    try {
        const driver = await DriverProfile.findByIdAndUpdate(
            req.params.id, { isVerified: true, verificationStatus: "approved" }, { new: true }
        );
        if (!driver) return res.status(404).json({ error: "Driver not found" });
        res.status(200).json({ message: "Driver verified", driver });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// DELETE /drivers/:id
async function deleteDriver(req, res) {
    try {
        if (!isAdmin(req)) return forbidden(res, "Admin access required");

        const driver = await DriverProfile.findById(req.params.id);
        if (!driver) return res.status(404).json({ error: "Driver not found" });

        const activeRide = await Ride.findOne({
            driverId: driver._id,
            status: { $in: ["accepted", "driver_arriving", "in_progress"] }
        });
        if (activeRide) {
            return res.status(409).json({ error: "Cannot delete a driver assigned to an active ride" });
        }

        const vehicles = await Vehicle.find({ driverId: driver._id });
        await deleteStoredUploads([
            driver.licenseImagePath,
            ...vehicles.flatMap(vehicle => [vehicle.testImagePath, vehicle.insuranceImagePath])
        ]);

        await Vehicle.deleteMany({ driverId: driver._id });
        await DriverProfile.findByIdAndDelete(driver._id);

        const user = await User.findById(driver.userId);
        if (user) {
            await PassengerProfile.findOneAndUpdate(
                { userId: user._id },
                { $setOnInsert: { userId: user._id } },
                { upsert: true, new: true, setDefaultsOnInsert: true }
            );

            let nextRole = user.role;
            if (user.role === "driver" || user.role === "both") nextRole = "passenger";
            if (user.role === "admin") nextRole = "admin";
            await User.findByIdAndUpdate(user._id, { role: nextRole });
        }

        res.status(200).json({ message: "Driver profile and vehicles deleted; user remains active" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

module.exports = {
    registerDriver, completeDriverSetup, getAllDrivers, getAvailableDrivers,
    getDriverById, updateDriver, updateDriverStatus, updateLocation, verifyDriver, deleteDriver
};
