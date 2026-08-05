const test = require("node:test");
const assert = require("node:assert/strict");

const DriverAlert = require("../db/models/DriverAlert");
const DriverProfile = require("../db/models/DriverProfile");
const {
    createDriverAlert,
    getAlertsByDriver,
    markAlertAsRead
} = require("../controllers/driverAlertController");
const {
    makeRes,
    patchMethod,
    queryResult,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

test("SOS/driver alerts can only be created by admins and are sanitized before persistence", async () => {
    let createdPayload;
    let createCalls = 0;

    patchMethod(patches, DriverAlert, "create", async (payload) => {
        createCalls += 1;
        createdPayload = payload;
        return { _id: "alert-1", ...payload };
    });

    const denied = makeRes();
    await createDriverAlert({
        user: { userId: "driver-user", role: "driver" },
        body: {
            driverId: "driver-1",
            alertType: "system",
            title: "Need help",
            message: "Emergency"
        }
    }, denied);

    assert.equal(denied.statusCode, 403);
    assert.equal(createCalls, 0);

    const longTitle = `  ${"A".repeat(150)}  `;
    const longMessage = `  ${"B".repeat(1200)}  `;
    const created = makeRes();
    await createDriverAlert({
        user: { userId: "admin-user", role: "admin" },
        body: {
            driverId: "driver-1",
            alertType: "system",
            title: longTitle,
            message: longMessage,
            area: {
                city: `  ${"Tel Aviv".repeat(20)}  `,
                address: `  ${"Main ".repeat(80)}  `,
                lat: "200",
                lng: "not-a-number"
            },
            demandLevel: "high"
        }
    }, created);

    assert.equal(created.statusCode, 201);
    assert.equal(createdPayload.title.length, 120);
    assert.equal(createdPayload.message.length, 1000);
    assert.equal(createdPayload.area.city.length, 80);
    assert.equal(createdPayload.area.address.length, 200);
    assert.equal(createdPayload.area.lat, null);
    assert.equal(createdPayload.area.lng, null);
});

test("drivers can read or mark only their own SOS/driver alerts", async () => {
    let findCalled = false;
    let updateCalled = false;

    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => {
        return userId === "driver-user" ? { _id: "own-driver" } : null;
    });
    patchMethod(patches, DriverAlert, "find", () => {
        findCalled = true;
        return queryResult([]);
    });
    patchMethod(patches, DriverAlert, "findById", async () => ({
        _id: "alert-1",
        driverId: "other-driver"
    }));
    patchMethod(patches, DriverAlert, "findByIdAndUpdate", async () => {
        updateCalled = true;
        return null;
    });

    const listDenied = makeRes();
    await getAlertsByDriver({
        user: { userId: "driver-user", role: "driver" },
        params: { driverId: "other-driver" },
        query: {},
        body: {}
    }, listDenied);

    assert.equal(listDenied.statusCode, 403);
    assert.equal(findCalled, false);

    const markDenied = makeRes();
    await markAlertAsRead({
        user: { userId: "driver-user", role: "driver" },
        params: { id: "alert-1" },
        query: {},
        body: {}
    }, markDenied);

    assert.equal(markDenied.statusCode, 403);
    assert.equal(updateCalled, false);
});
