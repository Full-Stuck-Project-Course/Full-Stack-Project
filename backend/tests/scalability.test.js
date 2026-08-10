const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DriverProfile = require("../db/models/DriverProfile");
const Ride = require("../db/models/Ride");
const { updateLocation } = require("../controllers/driverController");
const { getAllRides } = require("../controllers/rideController");
const { findNearbyAvailableDrivers } = require("../utils/driverDiscovery");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

test("GET /rides applies capped pagination and returns pagination metadata", async () => {
    const capture = {};
    const rides = [{ _id: "ride-1" }, { _id: "ride-2" }];

    patchMethod(patches, Ride, "find", (filter) => {
        capture.filter = filter;
        return {
            populate(pathName) {
                capture.populates ||= [];
                capture.populates.push(pathName);
                return this;
            },
            sort(sortSpec) {
                capture.sort = sortSpec;
                return this;
            },
            skip(skipValue) {
                capture.skip = skipValue;
                return this;
            },
            limit(limitValue) {
                capture.limit = limitValue;
                return Promise.resolve(rides);
            }
        };
    });
    patchMethod(patches, Ride, "countDocuments", async (filter) => {
        capture.countFilter = filter;
        return 125;
    });

    const res = makeRes();
    await getAllRides({
        user: { userId: "admin-user", role: "admin" },
        query: { status: "completed", page: "3", limit: "25" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capture.filter, { status: "completed" });
    assert.deepEqual(capture.countFilter, { status: "completed" });
    assert.deepEqual(capture.sort, { createdAt: -1 });
    assert.equal(capture.skip, 50);
    assert.equal(capture.limit, 25);
    assert.deepEqual(capture.populates, ["passengerId", "driverId", "vehicleId"]);
    assert.equal(res.body.items, rides);
    assert.deepEqual(res.body.pagination, {
        page: 3,
        limit: 25,
        total: 125,
        totalPages: 5,
        hasNextPage: true,
        hasPreviousPage: true
    });
});

test("DriverProfile stores a 2dsphere index and updateLocation writes GeoJSON", async () => {
    const indexes = DriverProfile.schema.indexes();
    assert.ok(
        indexes.some(([spec]) => spec.geoLocation === "2dsphere" && spec.lastActiveAt === 1),
        "DriverProfile must index recent activity with geoLocation"
    );

    let updatePayload;
    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => (
        userId === "driver-user" ? { _id: "driver-1" } : null
    ));
    patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
        updatePayload = { id, update };
        return { _id: id, currentLocation: update.$set.currentLocation, geoLocation: update.$set.geoLocation };
    });

    const res = makeRes();
    await updateLocation({
        user: { userId: "driver-user", role: "driver" },
        params: { id: "driver-1" },
        body: { lat: 32.0853, lng: 34.7818 }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(updatePayload.id, "driver-1");
    assert.deepEqual(updatePayload.update.$set.geoLocation, {
        type: "Point",
        coordinates: [34.7818, 32.0853]
    });
    assert.ok(updatePayload.update.$set.lastActiveAt instanceof Date);
});

test("nearby driver lookup uses indexed $near instead of scanning all available drivers", async () => {
    const capture = {};
    const drivers = [{
        _id: "driver-1",
        currentLocation: { lat: 32.086, lng: 34.782 },
        userId: "user-1"
    }];

    patchMethod(patches, DriverProfile, "find", (filter) => {
        capture.filter = filter;
        return {
            limit(limitValue) {
                capture.limit = limitValue;
                return this;
            },
            populate(pathName, selection) {
                capture.populate = { pathName, selection };
                return Promise.resolve(drivers);
            },
            then(resolve, reject) {
                return Promise.resolve(drivers).then(resolve, reject);
            }
        };
    });

    const nearby = await findNearbyAvailableDrivers({
        location: { lat: 32.0853, lng: 34.7818 },
        radiusKm: 5,
        limit: 500,
        carpoolOnly: true,
        populateUser: true
    });

    assert.equal(capture.filter.status, "available");
    assert.equal(capture.filter.isVerified, true);
    assert.equal(capture.filter.acceptsCarpoolRides, true);
    assert.ok(capture.filter.lastActiveAt.$gte instanceof Date);
    assert.deepEqual(capture.filter.geoLocation.$near.$geometry, {
        type: "Point",
        coordinates: [34.7818, 32.0853]
    });
    assert.equal(capture.filter.geoLocation.$near.$maxDistance, 5000);
    assert.equal(capture.limit, 100);
    assert.deepEqual(capture.populate, { pathName: "userId", selection: "fullName" });
    assert.equal(nearby.length, 1);
    assert.equal(nearby[0].driver, drivers[0]);
    assert.ok(Number.isFinite(nearby[0].distanceKm));
});

test("driver notification loop delegates nearby matching to the geospatial helper", () => {
    const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

    assert.match(serverSource, /findNearbyAvailableDrivers/);
    assert.doesNotMatch(serverSource, /for \(const driver of availableDrivers\)/);
    assert.doesNotMatch(serverSource, /DriverProfile\.find\(\{ status: "available", isVerified: true \}\)/);
});
