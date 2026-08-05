const fs = require("fs/promises");
const path = require("path");

const CarpoolRequest = require("../db/models/CarpoolRequest");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const RideStop = require("../db/models/RideStop");
const User = require("../db/models/User");
const Vehicle = require("../db/models/Vehicle");

const UPLOAD_BASE = path.resolve(__dirname, "..", "uploads");
const OWNED_UPLOAD_FOLDERS = new Set(["profiles", "ids", "licenses", "vehicle-docs"]);
const DEFAULT_GPS_RETENTION_DAYS = 90;

function storedUploadPathToDiskPath(storedPath) {
    if (!storedPath || typeof storedPath !== "string") return null;

    const normalized = storedPath.replace(/\\/g, "/");
    const match = normalized.match(/^\/?uploads\/([^/]+)\/([^/]+)$/);
    if (!match) return null;

    const [, folder, filename] = match;
    if (!OWNED_UPLOAD_FOLDERS.has(folder)) return null;
    if (path.basename(filename) !== filename) return null;

    const folderPath = path.resolve(UPLOAD_BASE, folder);
    const diskPath = path.resolve(folderPath, filename);
    if (!diskPath.startsWith(`${folderPath}${path.sep}`)) return null;

    return diskPath;
}

function uniqueUploadPaths(paths) {
    return [...new Set(paths.filter(Boolean).map(String))];
}

async function deleteStoredUpload(storedPath) {
    const diskPath = storedUploadPathToDiskPath(storedPath);
    if (!diskPath) return { storedPath, deleted: false, skipped: true };

    try {
        await fs.unlink(diskPath);
        return { storedPath, deleted: true };
    } catch (error) {
        if (error.code === "ENOENT") return { storedPath, deleted: false, missing: true };
        console.warn(`Could not delete upload ${storedPath}:`, error.message);
        return { storedPath, deleted: false, error: error.message };
    }
}

async function deleteStoredUploads(paths) {
    return Promise.all(uniqueUploadPaths(paths).map(deleteStoredUpload));
}

async function cleanupDeletedUserPrivacy(userId) {
    const [user, passenger, driver] = await Promise.all([
        User.findById(userId),
        PassengerProfile.findOne({ userId }),
        DriverProfile.findOne({ userId })
    ]);

    if (!user) return { user: null, deletedUploads: [] };

    const vehicles = driver ? await Vehicle.find({ driverId: driver._id }) : [];
    const uploadPaths = [
        user.profileImage,
        user.idPhotoPath,
        driver?.licenseImagePath,
        ...vehicles.flatMap(vehicle => [vehicle.testImagePath, vehicle.insuranceImagePath])
    ];

    const deletedUploads = await deleteStoredUploads(uploadPaths);

    await User.findByIdAndUpdate(userId, {
        isActive: false,
        fullName: "Deleted user",
        email: `deleted-${userId}@deleted.local`,
        phone: null,
        profileImage: null,
        idPhotoPath: null,
        idVerificationStatus: "not_submitted",
        resetPasswordToken: null,
        resetPasswordCodeHash: null,
        resetPasswordExpires: null,
        resetPasswordCodeAttempts: 0
    }, { new: true });

    if (passenger) {
        await PassengerProfile.findByIdAndUpdate(passenger._id, {
            savedLocations: []
        });
    }

    if (driver) {
        await DriverProfile.findByIdAndUpdate(driver._id, {
            $set: {
                licenseImagePath: null,
                verificationStatus: "not_submitted",
                isVerified: false,
                status: "offline",
                currentLocation: { lat: null, lng: null, updatedAt: null }
            },
            $unset: { geoLocation: "" }
        });

        await Vehicle.updateMany({ driverId: driver._id }, {
            testImagePath: null,
            insuranceImagePath: null,
            testApproval: false,
            insuranceApproval: false,
            documentsVerificationStatus: "not_submitted",
            isActive: false
        });
    }

    return { user, passenger, driver, vehicles, deletedUploads };
}

function getGpsRetentionDays() {
    const parsed = Number(process.env.GPS_RETENTION_DAYS || DEFAULT_GPS_RETENTION_DAYS);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_GPS_RETENTION_DAYS;
}

function gpsRetentionCutoff(now = new Date(), retentionDays = getGpsRetentionDays()) {
    return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

function terminalRideGpsFilter(cutoff) {
    return {
        status: { $in: ["completed", "cancelled"] },
        $or: [
            { completedAt: { $lt: cutoff } },
            { cancelledAt: { $lt: cutoff } },
            { updatedAt: { $lt: cutoff } }
        ]
    };
}

async function scrubExpiredGpsData({ now = new Date(), retentionDays = getGpsRetentionDays() } = {}) {
    const cutoff = gpsRetentionCutoff(now, retentionDays);

    const [driverLocations, rides, rideStops, carpoolRequests] = await Promise.all([
        DriverProfile.updateMany(
            { "currentLocation.updatedAt": { $lt: cutoff } },
            {
                $set: { currentLocation: { lat: null, lng: null, updatedAt: null } },
                $unset: { geoLocation: "" }
            }
        ),
        Ride.updateMany(
            terminalRideGpsFilter(cutoff),
            {
                $unset: {
                    "pickupLocation.lat": "",
                    "pickupLocation.lng": "",
                    "destinationLocation.lat": "",
                    "destinationLocation.lng": ""
                }
            }
        ),
        RideStop.updateMany(
            { updatedAt: { $lt: cutoff } },
            { $unset: { lat: "", lng: "" } }
        ),
        CarpoolRequest.updateMany(
            {
                status: { $in: ["cancelled", "completed"] },
                updatedAt: { $lt: cutoff }
            },
            {
                $unset: {
                    "pickupLocation.lat": "",
                    "pickupLocation.lng": "",
                    "destinationLocation.lat": "",
                    "destinationLocation.lng": ""
                }
            }
        )
    ]);

    return {
        cutoff,
        retentionDays,
        driverLocations,
        rides,
        rideStops,
        carpoolRequests
    };
}

module.exports = {
    cleanupDeletedUserPrivacy,
    deleteStoredUpload,
    deleteStoredUploads,
    getGpsRetentionDays,
    gpsRetentionCutoff,
    scrubExpiredGpsData,
    storedUploadPathToDiskPath,
    terminalRideGpsFilter
};
