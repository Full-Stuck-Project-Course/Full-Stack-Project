const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const Ride = require("../db/models/Ride");
const Vehicle = require("../db/models/Vehicle");
const {
    allowanceFilter,
    findNearbyAvailableDrivers,
    normalizeAllowances,
    normalizeDriverGender,
    normalizeMinRating,
    normalizeVehicleType
} = require("../utils/driverDiscovery");
const { acceptRide } = require("../controllers/rideController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

const TEL_AVIV = { lat: 32.0853, lng: 34.7818 };

function driverQuery(drivers, capture = {}) {
    return {
        limit(value) {
            capture.limit = value;
            return this;
        },
        populate(path, selection) {
            capture.populate = { path, selection };
            return this;
        },
        then(resolve, reject) {
            return Promise.resolve(drivers).then(resolve, reject);
        }
    };
}

function vehicleQuery(vehicles) {
    return {
        select() {
            return Promise.resolve(vehicles);
        }
    };
}

test("driver preference values are normalized, and unknown values mean no preference", () => {
    assert.equal(normalizeDriverGender("FEMALE"), "female");
    assert.equal(normalizeDriverGender(" male "), "male");
    assert.equal(normalizeDriverGender("other"), null);
    assert.equal(normalizeDriverGender(undefined), null);

    assert.equal(normalizeVehicleType("Luxury"), "luxury");
    assert.equal(normalizeVehicleType("bicycle"), null);
    assert.equal(normalizeVehicleType(null), null);
});

test("a minimum rating of 1 or lower is treated as no rating preference", () => {
    assert.equal(normalizeMinRating(4.5), 4.5);
    assert.equal(normalizeMinRating("4"), 4);
    assert.equal(normalizeMinRating(9), 5, "a rating above the scale is capped, not ignored");
    assert.equal(normalizeMinRating(1), null);
    assert.equal(normalizeMinRating(0), null);
    assert.equal(normalizeMinRating("any"), null);
});

test("only the allowances the passenger actually asked for constrain the search", () => {
    assert.deepEqual(normalizeAllowances({ pets: true, smoking: false }), { pets: true });
    assert.deepEqual(normalizeAllowances({ pets: "true", food: "false" }), { pets: true });
    assert.deepEqual(normalizeAllowances({}), {});

    // Needing pets excludes drivers who set noPets, and leaves drivers who never
    // saved the field at all.
    assert.deepEqual(allowanceFilter({ pets: true }), { "vehicleConditions.noPets": { $ne: true } });
    assert.deepEqual(allowanceFilter({}), {});
});

test("nearby driver search filters by rating and by what the driver allows", async () => {
    let driverFilter;

    patchMethod(patches, DriverProfile, "find", (filter) => {
        driverFilter = filter;
        return driverQuery([]);
    });

    await findNearbyAvailableDrivers({
        location: TEL_AVIV,
        radiusKm: 8,
        minRating: 4,
        allowances: { pets: true, food: true, smoking: false }
    });

    assert.deepEqual(driverFilter.ratingAverage, { $gte: 4 });
    assert.deepEqual(driverFilter["vehicleConditions.noPets"], { $ne: true });
    assert.deepEqual(driverFilter["vehicleConditions.noFood"], { $ne: true });
    assert.equal(driverFilter["vehicleConditions.noSmoking"], undefined,
        "an allowance the passenger did not ask for must not narrow the search");
});

test("nearby driver search filters by gender and vehicle type", async () => {
    let driverFilter;

    patchMethod(patches, Vehicle, "find", (filter) => {
        assert.deepEqual(filter, { vehicleType: "van", isActive: true });
        return vehicleQuery([{ driverId: "driver-1" }, { driverId: "driver-2" }]);
    });
    patchMethod(patches, DriverProfile, "find", (filter) => {
        driverFilter = filter;
        return driverQuery([{
            _id: "driver-1",
            gender: "female",
            currentLocation: TEL_AVIV
        }]);
    });

    const results = await findNearbyAvailableDrivers({
        location: TEL_AVIV,
        radiusKm: 8,
        gender: "female",
        vehicleType: "van"
    });

    assert.equal(driverFilter.gender, "female");
    assert.deepEqual(driverFilter._id, { $in: ["driver-1", "driver-2"] });
    assert.equal(driverFilter.status, "available");
    assert.equal(driverFilter.isVerified, true);
    assert.equal(results.length, 1);
    assert.equal(results[0].distanceKm, 0);
});

test("nearby driver search returns nothing when no vehicle matches the requested type", async () => {
    patchMethod(patches, Vehicle, "find", () => vehicleQuery([]));
    patchMethod(patches, DriverProfile, "find", () => {
        throw new Error("driver lookup must be skipped when no vehicle matches");
    });

    const results = await findNearbyAvailableDrivers({
        location: TEL_AVIV,
        radiusKm: 8,
        vehicleType: "luxury"
    });

    assert.deepEqual(results, []);
});

test("nearby driver search ignores unrecognised filter values instead of hiding every driver", async () => {
    let driverFilter;

    patchMethod(patches, Vehicle, "find", () => {
        throw new Error("vehicle lookup must be skipped for an unrecognised vehicle type");
    });
    patchMethod(patches, DriverProfile, "find", (filter) => {
        driverFilter = filter;
        return driverQuery([]);
    });

    await findNearbyAvailableDrivers({
        location: TEL_AVIV,
        radiusKm: 8,
        gender: "unspecified",
        vehicleType: "helicopter"
    });

    assert.equal(driverFilter.gender, undefined);
    assert.equal(driverFilter._id, undefined);
});

test("nearby driver search can exclude the passenger's own driver profile", async () => {
    let driverFilter;

    patchMethod(patches, DriverProfile, "find", (filter) => {
        driverFilter = filter;
        return driverQuery([]);
    });

    await findNearbyAvailableDrivers({
        location: TEL_AVIV,
        radiusKm: 8,
        excludeUserId: "passenger-user"
    });

    assert.deepEqual(driverFilter.userId, { $ne: "passenger-user" });
});

test("nearby driver search requires recent driver activity by default", async () => {
    const originalWindow = process.env.DRIVER_ACTIVE_WINDOW_MS;
    const now = new Date("2026-08-10T12:00:00Z");
    let driverFilter;

    process.env.DRIVER_ACTIVE_WINDOW_MS = "60000";
    patchMethod(patches, DriverProfile, "find", (filter) => {
        driverFilter = filter;
        return driverQuery([]);
    });

    try {
        await findNearbyAvailableDrivers({
            location: TEL_AVIV,
            radiusKm: 8,
            activityDate: now
        });

        assert.deepEqual(driverFilter.lastActiveAt, {
            $gte: new Date("2026-08-10T11:59:00Z")
        });
    } finally {
        if (originalWindow === undefined) delete process.env.DRIVER_ACTIVE_WINDOW_MS;
        else process.env.DRIVER_ACTIVE_WINDOW_MS = originalWindow;
    }
});

function patchAcceptRideDependencies({ driver, vehicle, ride }) {
    patchMethod(patches, DriverProfile, "findById", async () => driver);
    patchMethod(patches, Ride, "findOne", async () => ride);
    patchMethod(patches, Vehicle, "findOne", () => ({
        sort: async () => vehicle,
        then: (resolve, reject) => Promise.resolve(vehicle).then(resolve, reject)
    }));
    patchMethod(patches, DriverProfile, "findOneAndUpdate", async () => {
        throw new Error("driver must not be claimed when preferences do not match");
    });
}

// Accepting as an admin keeps the driver id explicit, so these tests exercise the
// preference checks rather than the profile lookup that precedes them.
function acceptRideRequest() {
    return {
        user: { userId: "admin-user", role: "admin" },
        params: { id: "ride-1" },
        body: { driverId: "driver-1" }
    };
}

const MATCHING_DRIVER = {
    _id: "driver-1",
    gender: "female",
    isVerified: true,
    status: "available",
    ratingAverage: 4.8,
    vehicleConditions: { noPets: false, noSmoking: true, noFood: false },
    currentLocation: TEL_AVIV
};

const MATCHING_VEHICLE = {
    _id: "vehicle-1",
    vehicleType: "comfort",
    seats: 4,
    testApproval: true,
    insuranceApproval: true
};

function rideWithPreferences(overrides) {
    return {
        _id: "ride-1",
        status: "searching",
        rideType: "ride",
        passengerCount: 1,
        pickupLocation: TEL_AVIV,
        preferredDriverGender: null,
        vehicleType: null,
        maxDriverDistanceKm: null,
        minDriverRating: null,
        requiredAllowances: { pets: false, smoking: false, food: false },
        ...overrides
    };
}

test("a driver of the wrong gender cannot accept a ride that requested otherwise", async () => {
    patchAcceptRideDependencies({
        driver: MATCHING_DRIVER,
        vehicle: MATCHING_VEHICLE,
        ride: rideWithPreferences({ preferredDriverGender: "male" })
    });

    const res = makeRes();
    await acceptRide(acceptRideRequest(), res);

    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /different gender/i);
});

test("a driver whose vehicle type does not match the booked type cannot accept the ride", async () => {
    patchAcceptRideDependencies({
        driver: MATCHING_DRIVER,
        vehicle: MATCHING_VEHICLE,
        ride: rideWithPreferences({ vehicleType: "luxury" })
    });

    const res = makeRes();
    await acceptRide(acceptRideRequest(), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /priced for a luxury vehicle/i);
});

test("a driver beyond the distance the passenger allowed cannot accept the ride", async () => {
    patchAcceptRideDependencies({
        driver: { ...MATCHING_DRIVER, currentLocation: { lat: 31.7683, lng: 35.2137 } },
        vehicle: MATCHING_VEHICLE,
        ride: rideWithPreferences({ maxDriverDistanceKm: 5 })
    });

    const res = makeRes();
    await acceptRide(acceptRideRequest(), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /beyond the 5 km/i);
});

test("a driver rated below what the passenger asked for cannot accept the ride", async () => {
    patchAcceptRideDependencies({
        driver: { ...MATCHING_DRIVER, ratingAverage: 3.6 },
        vehicle: MATCHING_VEHICLE,
        ride: rideWithPreferences({ minDriverRating: 4 })
    });

    const res = makeRes();
    await acceptRide(acceptRideRequest(), res);

    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /rated 4 or above/i);
});

test("a driver who forbids something the passenger needs cannot accept the ride", async () => {
    patchAcceptRideDependencies({
        driver: MATCHING_DRIVER,
        vehicle: MATCHING_VEHICLE,
        ride: rideWithPreferences({
            requiredAllowances: { pets: false, smoking: true, food: false }
        })
    });

    const res = makeRes();
    await acceptRide(acceptRideRequest(), res);

    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /allows smoking/i);
});

test("an allowance the passenger did not need does not block a driver who forbids it", async () => {
    let claimAttempted = false;

    patchMethod(patches, DriverProfile, "findById", async () => MATCHING_DRIVER);
    patchMethod(patches, Ride, "findOne", async () => rideWithPreferences({
        // The driver forbids smoking, but the passenger only needs pets allowed.
        requiredAllowances: { pets: true, smoking: false, food: false }
    }));
    patchMethod(patches, Vehicle, "findOne", () => ({
        sort: async () => MATCHING_VEHICLE,
        then: (resolve, reject) => Promise.resolve(MATCHING_VEHICLE).then(resolve, reject)
    }));
    patchMethod(patches, DriverProfile, "findOneAndUpdate", async () => {
        claimAttempted = true;
        return null;
    });
    patchMethod(patches, Ride, "findById", async () => rideWithPreferences({ status: "searching" }));

    const res = makeRes();
    await acceptRide(acceptRideRequest(), res);

    assert.equal(claimAttempted, true);
    assert.equal(res.statusCode, 409);
});

test("a driver matching every preference is allowed through to the claim step", async () => {
    let claimAttempted = false;

    patchMethod(patches, DriverProfile, "findById", async () => MATCHING_DRIVER);
    patchMethod(patches, Ride, "findOne", async () => rideWithPreferences({
        preferredDriverGender: "female",
        vehicleType: "comfort",
        maxDriverDistanceKm: 10,
        minDriverRating: 4.5,
        requiredAllowances: { pets: true, smoking: false, food: true }
    }));
    patchMethod(patches, Vehicle, "findOne", () => ({
        sort: async () => MATCHING_VEHICLE,
        then: (resolve, reject) => Promise.resolve(MATCHING_VEHICLE).then(resolve, reject)
    }));
    patchMethod(patches, DriverProfile, "findOneAndUpdate", async () => {
        claimAttempted = true;
        return null;
    });
    patchMethod(patches, Ride, "findById", async () => rideWithPreferences({ status: "searching" }));

    const res = makeRes();
    await acceptRide(acceptRideRequest(), res);

    assert.equal(claimAttempted, true, "preference checks must not block a matching driver");
    assert.equal(res.statusCode, 409, "the ride is only lost to the concurrent-claim guard");
});
