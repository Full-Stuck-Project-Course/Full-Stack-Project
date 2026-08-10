const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-driver-presence-secret-with-more-than-32-chars";

const DriverProfile = require("../db/models/DriverProfile");
const { updateDriverStatus } = require("../controllers/driverController");
const { markStaleAvailableDriversOffline } = require("../server");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

test("marking a driver available refreshes their activity timestamp", async () => {
    let statusUpdate;

    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => (
        userId === "driver-user" ? { _id: "driver-1" } : null
    ));
    patchMethod(patches, DriverProfile, "findById", async (id) => (
        id === "driver-1" ? { _id: "driver-1", isVerified: true } : null
    ));
    patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
        statusUpdate = { id, update };
        return { _id: id, ...update };
    });

    const res = makeRes();
    await updateDriverStatus({
        user: { userId: "driver-user", role: "driver" },
        params: { id: "driver-1" },
        body: { status: "available" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(statusUpdate.id, "driver-1");
    assert.equal(statusUpdate.update.status, "available");
    assert.ok(statusUpdate.update.lastActiveAt instanceof Date);
});

test("stale available driver cleanup marks inactive drivers offline", async () => {
    const originalWindow = process.env.DRIVER_ACTIVE_WINDOW_MS;
    let cleanup;

    process.env.DRIVER_ACTIVE_WINDOW_MS = "60000";
    patchMethod(patches, DriverProfile, "updateMany", async (filter, update) => {
        cleanup = { filter, update };
        return { modifiedCount: 2 };
    });

    try {
        const result = await markStaleAvailableDriversOffline(new Date("2026-08-10T12:00:00Z"));

        assert.equal(result.modifiedCount, 2);
        assert.equal(cleanup.filter.status, "available");
        assert.deepEqual(cleanup.filter.$or, [
            { lastActiveAt: null },
            { lastActiveAt: { $lt: new Date("2026-08-10T11:59:00Z") } }
        ]);
        assert.deepEqual(cleanup.update, { $set: { status: "offline" } });
    } finally {
        if (originalWindow === undefined) delete process.env.DRIVER_ACTIVE_WINDOW_MS;
        else process.env.DRIVER_ACTIVE_WINDOW_MS = originalWindow;
    }
});
