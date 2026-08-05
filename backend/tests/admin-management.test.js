const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises");

const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const User = require("../db/models/User");
const Vehicle = require("../db/models/Vehicle");
const { deleteDriver } = require("../controllers/driverController");
const { adminUpdateRide } = require("../controllers/rideController");
const { hardDeleteUser, updateUser } = require("../controllers/userController");
const { deleteVehicle } = require("../controllers/vehicleController");
const {
    makeRes,
    makeRide,
    patchMethod,
    queryResult,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

test("admins can update another user's role and active state", async () => {
    let capturedUpdate;

    patchMethod(patches, User, "findByIdAndUpdate", (id, update) => {
        capturedUpdate = { id, update };
        return queryResult({ _id: id, ...update });
    });
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-1" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await updateUser({
        user: { userId: "admin-user", role: "admin" },
        params: { id: "target-user" },
        body: {
            fullName: "Managed User",
            phone: "0501234567",
            preferredLanguage: "en",
            role: "both",
            isActive: false
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedUpdate, {
        id: "target-user",
        update: {
            fullName: "Managed User",
            phone: "0501234567",
            preferredLanguage: "en",
            role: "both",
            isActive: false
        }
    });
});

test("non-admin profile updates cannot smuggle role or active-state changes", async () => {
    let capturedUpdate;

    patchMethod(patches, User, "findByIdAndUpdate", (id, update) => {
        capturedUpdate = update;
        return queryResult({ _id: id, fullName: update.fullName, role: "passenger", isActive: true });
    });
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-1" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await updateUser({
        user: { userId: "target-user", role: "passenger" },
        params: { id: "target-user" },
        body: {
            fullName: "Self Edit",
            role: "admin",
            isActive: false
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedUpdate, { fullName: "Self Edit" });
});

test("hard deletion is blocked while the user has active rides", async () => {
    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: "passenger-1" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);
    patchMethod(patches, Ride, "findOne", async () => ({ _id: "active-ride" }));
    patchMethod(patches, User, "findByIdAndDelete", async () => {
        throw new Error("hard delete must not run for active rides");
    });

    const res = makeRes();
    await hardDeleteUser({
        user: { userId: "admin-user", role: "admin" },
        params: { id: "target-user" },
        body: {}
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /active rides/i);
});

test("admin ride updates can cancel rides and release the assigned driver", async () => {
    const existing = makeRide({ _id: "ride-1", status: "in_progress", driverId: "driver-1" });
    let updatePayload;
    let releasedDriver;

    patchMethod(patches, Ride, "findById", async () => existing);
    patchMethod(patches, Ride, "findByIdAndUpdate", async (id, update) => {
        updatePayload = { id, update };
        return { ...existing, ...update };
    });
    patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
        releasedDriver = { id, update };
        return { _id: id, ...update };
    });

    const res = makeRes();
    await adminUpdateRide({
        user: { userId: "admin-user", role: "admin" },
        params: { id: "ride-1" },
        body: {
            status: "cancelled",
            cancellationReason: "support cancellation"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(updatePayload.id, "ride-1");
    assert.equal(updatePayload.update.status, "cancelled");
    assert.equal(updatePayload.update.cancelledBy, "system");
    assert.equal(updatePayload.update.cancellationReason, "support cancellation");
    assert.ok(updatePayload.update.cancelledAt instanceof Date);
    assert.deepEqual(releasedDriver, {
        id: "driver-1",
        update: { status: "available" }
    });
});

test("admins can delete a driver profile without deleting the user", async () => {
    const driver = {
        _id: "driver-1",
        userId: "user-1",
        licenseImagePath: "/uploads/licenses/license.jpg"
    };
    const vehicles = [
        {
            _id: "vehicle-1",
            driverId: driver._id,
            testImagePath: "/uploads/vehicle-docs/test.jpg",
            insuranceImagePath: "/uploads/vehicle-docs/insurance.jpg"
        }
    ];
    const user = { _id: "user-1", role: "both" };
    const unlinked = [];
    let vehicleDeleteFilter;
    let deletedDriverId;
    let userRoleUpdate;
    let passengerUpsert;

    patchMethod(patches, DriverProfile, "findById", async () => driver);
    patchMethod(patches, Ride, "findOne", async () => null);
    patchMethod(patches, Vehicle, "find", async () => vehicles);
    patchMethod(patches, fs, "unlink", async (diskPath) => {
        unlinked.push(diskPath);
    });
    patchMethod(patches, Vehicle, "deleteMany", async (filter) => {
        vehicleDeleteFilter = filter;
        return { deletedCount: 1 };
    });
    patchMethod(patches, DriverProfile, "findByIdAndDelete", async (id) => {
        deletedDriverId = id;
        return driver;
    });
    patchMethod(patches, User, "findById", async () => user);
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async (filter, update, options) => {
        passengerUpsert = { filter, update, options };
        return { _id: "passenger-1", userId: user._id };
    });
    patchMethod(patches, User, "findByIdAndUpdate", async (id, update) => {
        userRoleUpdate = { id, update };
        return { ...user, ...update };
    });

    const res = makeRes();
    await deleteDriver({
        user: { userId: "admin-user", role: "admin" },
        params: { id: driver._id },
        body: {}
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(unlinked.length, 3);
    assert.deepEqual(vehicleDeleteFilter, { driverId: driver._id });
    assert.equal(deletedDriverId, driver._id);
    assert.deepEqual(passengerUpsert.filter, { userId: user._id });
    assert.equal(passengerUpsert.options.upsert, true);
    assert.deepEqual(userRoleUpdate, {
        id: user._id,
        update: { role: "passenger" }
    });
});

test("driver deletion is blocked while assigned to an active ride", async () => {
    patchMethod(patches, DriverProfile, "findById", async () => ({ _id: "driver-1", userId: "user-1" }));
    patchMethod(patches, Ride, "findOne", async () => ({ _id: "ride-1" }));
    patchMethod(patches, Vehicle, "deleteMany", async () => {
        throw new Error("vehicles must not be deleted for active drivers");
    });

    const res = makeRes();
    await deleteDriver({
        user: { userId: "admin-user", role: "admin" },
        params: { id: "driver-1" },
        body: {}
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /active ride/i);
});

test("vehicle deletion removes vehicle documents before deleting the vehicle", async () => {
    const vehicle = {
        _id: "vehicle-1",
        driverId: "driver-1",
        testImagePath: "/uploads/vehicle-docs/test.jpg",
        insuranceImagePath: "/uploads/vehicle-docs/insurance.jpg"
    };
    const unlinked = [];
    let deletedVehicleId;

    patchMethod(patches, Vehicle, "findById", async () => vehicle);
    patchMethod(patches, Ride, "findOne", async () => null);
    patchMethod(patches, fs, "unlink", async (diskPath) => {
        unlinked.push(diskPath);
    });
    patchMethod(patches, Vehicle, "findByIdAndDelete", async (id) => {
        deletedVehicleId = id;
        return vehicle;
    });

    const res = makeRes();
    await deleteVehicle({
        user: { userId: "admin-user", role: "admin" },
        params: { id: vehicle._id },
        body: {}
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(unlinked.length, 2);
    assert.equal(deletedVehicleId, vehicle._id);
});
