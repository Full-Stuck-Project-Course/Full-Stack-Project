const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");
const path = require("path");

const CarpoolRequest = require("../db/models/CarpoolRequest");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const RideStop = require("../db/models/RideStop");
const User = require("../db/models/User");
const Vehicle = require("../db/models/Vehicle");
const {
    cleanupDeletedUserPrivacy,
    scrubExpiredGpsData,
    storedUploadPathToDiskPath
} = require("../utils/privacyCleanup");
const { deleteUser } = require("../controllers/userController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

test("stored upload paths resolve only inside owned upload folders", () => {
    const diskPath = storedUploadPathToDiskPath("/uploads/ids/id-photo.jpg");

    assert.ok(diskPath.endsWith(path.join("uploads", "ids", "id-photo.jpg")));
    assert.equal(storedUploadPathToDiskPath("/uploads/ids/../secrets.env"), null);
    assert.equal(storedUploadPathToDiskPath("/uploads/unknown/file.jpg"), null);
    assert.equal(storedUploadPathToDiskPath("https://example.com/avatar.jpg"), null);
});

test("deleteUser removes identity files, clears verification paths, and drops owned GPS data", async () => {
    const user = {
        _id: "user-1",
        profileImage: "/uploads/profiles/profile.jpg",
        idPhotoPath: "/uploads/ids/id.jpg"
    };
    const passenger = { _id: "passenger-1", userId: user._id };
    const driver = {
        _id: "driver-1",
        userId: user._id,
        licenseImagePath: "/uploads/licenses/license.jpg"
    };
    const vehicles = [{
        _id: "vehicle-1",
        driverId: driver._id,
        testImagePath: "/uploads/vehicle-docs/test.jpg",
        insuranceImagePath: "/uploads/vehicle-docs/insurance.jpg"
    }];

    const unlinked = [];
    let userUpdate;
    let passengerUpdate;
    let driverUpdate;
    let vehicleUpdate;

    patchMethod(patches, fs, "unlink", async (diskPath) => {
        unlinked.push(diskPath);
    });
    patchMethod(patches, User, "findById", async (id) => id === user._id ? user : null);
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => userId === user._id ? passenger : null);
    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => userId === user._id ? driver : null);
    patchMethod(patches, Vehicle, "find", async ({ driverId }) => driverId === driver._id ? vehicles : []);
    patchMethod(patches, User, "findByIdAndUpdate", async (id, update, options) => {
        userUpdate = { id, update, options };
        return { ...user, ...update };
    });
    patchMethod(patches, PassengerProfile, "findByIdAndUpdate", async (id, update) => {
        passengerUpdate = { id, update };
        return { ...passenger, ...update };
    });
    patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
        driverUpdate = { id, update };
        return { ...driver, ...update };
    });
    patchMethod(patches, Vehicle, "updateMany", async (filter, update) => {
        vehicleUpdate = { filter, update };
        return { modifiedCount: 1 };
    });

    const res = makeRes();
    await deleteUser({ params: { id: user._id } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.deletedUploadCount, 5);
    assert.equal(unlinked.length, 5);
    assert.deepEqual(userUpdate.update, {
        isActive: false,
        fullName: "Deleted user",
        email: "deleted-user-1@deleted.local",
        phone: null,
        profileImage: null,
        idPhotoPath: null,
        idVerificationStatus: "not_submitted",
        resetPasswordToken: null,
        resetPasswordCodeHash: null,
        resetPasswordExpires: null,
        resetPasswordCodeAttempts: 0
    });
    assert.deepEqual(passengerUpdate, {
        id: passenger._id,
        update: { savedLocations: [], defaultPaymentMethod: null }
    });
    assert.deepEqual(driverUpdate, {
        id: driver._id,
        update: {
            $set: {
                licenseImagePath: null,
                verificationStatus: "not_submitted",
                isVerified: false,
                status: "offline",
                currentLocation: { lat: null, lng: null, updatedAt: null }
            },
            $unset: { geoLocation: "" }
        }
    });
    assert.deepEqual(vehicleUpdate, {
        filter: { driverId: driver._id },
        update: {
            testImagePath: null,
            insuranceImagePath: null,
            testApproval: false,
            insuranceApproval: false,
            documentsVerificationStatus: "not_submitted",
            isActive: false
        }
    });
});

test("GPS retention scrub removes stale precise coordinates from terminal records", async () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    const cutoff = new Date("2026-05-07T12:00:00.000Z");
    const calls = {};

    patchMethod(patches, DriverProfile, "updateMany", async (filter, update) => {
        calls.driver = { filter, update };
        return { modifiedCount: 2 };
    });
    patchMethod(patches, Ride, "updateMany", async (filter, update) => {
        calls.ride = { filter, update };
        return { modifiedCount: 3 };
    });
    patchMethod(patches, RideStop, "updateMany", async (filter, update) => {
        calls.stop = { filter, update };
        return { modifiedCount: 4 };
    });
    patchMethod(patches, CarpoolRequest, "updateMany", async (filter, update) => {
        calls.carpool = { filter, update };
        return { modifiedCount: 5 };
    });

    const summary = await scrubExpiredGpsData({ now, retentionDays: 90 });

    assert.equal(summary.cutoff.toISOString(), cutoff.toISOString());
    assert.deepEqual(calls.driver, {
        filter: { "currentLocation.updatedAt": { $lt: cutoff } },
        update: {
            $set: { currentLocation: { lat: null, lng: null, updatedAt: null } },
            $unset: { geoLocation: "" }
        }
    });
    assert.deepEqual(calls.ride.filter.status, { $in: ["completed", "cancelled"] });
    assert.deepEqual(calls.ride.update.$unset, {
        "pickupLocation.lat": "",
        "pickupLocation.lng": "",
        "destinationLocation.lat": "",
        "destinationLocation.lng": ""
    });
    assert.deepEqual(calls.stop, {
        filter: { updatedAt: { $lt: cutoff } },
        update: { $unset: { lat: "", lng: "" } }
    });
    assert.deepEqual(calls.carpool.filter, {
        status: { $in: ["cancelled", "completed"] },
        updatedAt: { $lt: cutoff }
    });
    assert.equal(summary.driverLocations.modifiedCount, 2);
    assert.equal(summary.carpoolRequests.modifiedCount, 5);
});

test("cleanupDeletedUserPrivacy skips database changes when user does not exist", async () => {
    let updateCalled = false;

    patchMethod(patches, User, "findById", async () => null);
    patchMethod(patches, PassengerProfile, "findOne", async () => null);
    patchMethod(patches, DriverProfile, "findOne", async () => null);
    patchMethod(patches, User, "findByIdAndUpdate", async () => {
        updateCalled = true;
    });

    const result = await cleanupDeletedUserPrivacy("missing-user");

    assert.equal(result.user, null);
    assert.equal(updateCalled, false);
});
