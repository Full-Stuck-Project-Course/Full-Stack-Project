const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const CarpoolRequest = require("../db/models/CarpoolRequest");
const Rating = require("../db/models/rating");
const Ride = require("../db/models/Ride");
const User = require("../db/models/User");
const { createRating } = require("../controllers/ratingController");
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

function makeCompletedRide(overrides = {}) {
    return {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        status: "completed",
        ...overrides
    };
}

test("rating schema allows one rating in each direction for the same ride", () => {
    const indexes = Rating.schema.indexes();

    assert.ok(indexes.some(([fields, options]) =>
        fields.rideId === 1 &&
        fields.direction === 1 &&
        fields.passengerId === 1 &&
        options.unique === true
    ));
    assert.equal(indexes.some(([fields, options]) =>
        fields.rideId === 1 &&
        Object.keys(fields).length === 1 &&
        options.unique === true
    ), false);
});

test("passenger rating targets the driver, updates driver average, and awards loyalty points", async () => {
    const ride = makeCompletedRide();
    let duplicateFilter;
    let createdRating;
    let averageFilter;
    let driverAverageUpdate;
    let loyaltyUpdate;

    patchMethod(patches, Ride, "findById", async id => {
        assert.equal(id, ride._id);
        return ride;
    });
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => (
        userId === "passenger-user" ? { _id: ride.passengerId, userId } : null
    ));
    patchMethod(patches, Rating, "findOne", async filter => {
        duplicateFilter = filter;
        return null;
    });
    patchMethod(patches, Rating, "create", async doc => {
        createdRating = doc;
        return { _id: "rating-1", ...doc };
    });
    patchMethod(patches, Rating, "find", async filter => {
        averageFilter = filter;
        return [{ rating: 4 }, { rating: 5 }];
    });
    patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
        driverAverageUpdate = { id, update };
        return { _id: id, ...update };
    });
    patchMethod(patches, PassengerProfile, "findById", id => {
        assert.equal(id, ride.passengerId);
        return queryResult({ _id: id, userId: "passenger-user" });
    });
    patchMethod(patches, User, "findByIdAndUpdate", async (id, update, options) => {
        loyaltyUpdate = { id, update, options };
        return { _id: id, loyaltyPoints: 110 };
    });

    const res = makeRes();
    await createRating({
        user: { userId: "passenger-user", role: "passenger" },
        body: {
            rideId: ride._id,
            rating: 5,
            comment: "Great ride"
        }
    }, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(duplicateFilter, {
        rideId: ride._id,
        passengerId: ride.passengerId,
        $or: [
            { direction: "passenger_to_driver" },
            { direction: { $exists: false } }
        ]
    });
    assert.equal(createdRating.direction, "passenger_to_driver");
    assert.equal(createdRating.driverId, ride.driverId);
    assert.equal(createdRating.passengerId, ride.passengerId);
    assert.deepEqual(averageFilter, {
        driverId: ride.driverId,
        $or: [
            { direction: "passenger_to_driver" },
            { direction: { $exists: false } }
        ]
    });
    assert.deepEqual(driverAverageUpdate, {
        id: ride.driverId,
        update: { ratingAverage: 4.5 }
    });
    assert.deepEqual(loyaltyUpdate.update, { $inc: { loyaltyPoints: 10 } });
});

test("assigned driver rating targets the passenger and updates passenger average", async () => {
    const ride = makeCompletedRide();
    let duplicateFilter;
    let createdRating;
    let averageFilter;
    let passengerAverageUpdate;

    patchMethod(patches, Ride, "findById", async id => {
        assert.equal(id, ride._id);
        return ride;
    });
    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => (
        userId === "driver-user" ? { _id: ride.driverId, userId } : null
    ));
    patchMethod(patches, PassengerProfile, "findOne", async () => {
        throw new Error("Driver-to-passenger ratings must authorize through the driver profile");
    });
    patchMethod(patches, Rating, "findOne", async filter => {
        duplicateFilter = filter;
        return null;
    });
    patchMethod(patches, Rating, "create", async doc => {
        createdRating = doc;
        return { _id: "rating-2", ...doc };
    });
    patchMethod(patches, Rating, "find", async filter => {
        averageFilter = filter;
        return [{ rating: 3 }, { rating: 5 }];
    });
    patchMethod(patches, PassengerProfile, "findByIdAndUpdate", async (id, update) => {
        passengerAverageUpdate = { id, update };
        return { _id: id, ...update };
    });
    patchMethod(patches, PassengerProfile, "findById", () => {
        throw new Error("Driver-to-passenger ratings must not award passenger loyalty points");
    });
    patchMethod(patches, User, "findByIdAndUpdate", () => {
        throw new Error("Driver-to-passenger ratings must not write user loyalty points");
    });

    const res = makeRes();
    await createRating({
        user: { userId: "driver-user", role: "driver" },
        body: {
            rideId: ride._id,
            direction: "driver_to_passenger",
            rating: 5,
            comment: "Easy pickup"
        }
    }, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(duplicateFilter, {
        rideId: ride._id,
        passengerId: ride.passengerId,
        direction: "driver_to_passenger"
    });
    assert.equal(createdRating.direction, "driver_to_passenger");
    assert.equal(createdRating.driverId, ride.driverId);
    assert.equal(createdRating.passengerId, ride.passengerId);
    assert.deepEqual(averageFilter, {
        passengerId: ride.passengerId,
        direction: "driver_to_passenger"
    });
    assert.deepEqual(passengerAverageUpdate, {
        id: ride.passengerId,
        update: { ratingAverage: 4 }
    });
});

test("assigned driver can rate a specific completed carpool passenger", async () => {
    const ride = makeCompletedRide({
        rideType: "carpool",
        passengerId: "passenger-1"
    });
    let carpoolSeatFilter;
    let duplicateFilter;
    let createdRating;
    let passengerAverageUpdate;

    patchMethod(patches, Ride, "findById", async id => {
        assert.equal(id, ride._id);
        return ride;
    });
    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => (
        userId === "driver-user" ? { _id: ride.driverId, userId } : null
    ));
    patchMethod(patches, CarpoolRequest, "findOne", async filter => {
        carpoolSeatFilter = filter;
        return {
            _id: "request-2",
            rideId: ride._id,
            passengerId: "passenger-2",
            status: "completed"
        };
    });
    patchMethod(patches, Rating, "findOne", async filter => {
        duplicateFilter = filter;
        return null;
    });
    patchMethod(patches, Rating, "create", async doc => {
        createdRating = doc;
        return { _id: "rating-3", ...doc };
    });
    patchMethod(patches, Rating, "find", async () => [{ rating: 5 }]);
    patchMethod(patches, PassengerProfile, "findByIdAndUpdate", async (id, update) => {
        passengerAverageUpdate = { id, update };
        return { _id: id, ...update };
    });

    const res = makeRes();
    await createRating({
        user: { userId: "driver-user", role: "driver" },
        body: {
            rideId: ride._id,
            passengerId: "passenger-2",
            direction: "driver_to_passenger",
            rating: 4,
            comment: "Good carpool passenger"
        }
    }, res);

    assert.equal(res.statusCode, 201);
    assert.deepEqual(carpoolSeatFilter, {
        rideId: ride._id,
        passengerId: "passenger-2",
        status: "completed"
    });
    assert.deepEqual(duplicateFilter, {
        rideId: ride._id,
        passengerId: "passenger-2",
        direction: "driver_to_passenger"
    });
    assert.equal(createdRating.passengerId, "passenger-2");
    assert.equal(createdRating.driverId, ride.driverId);
    assert.deepEqual(passengerAverageUpdate, {
        id: "passenger-2",
        update: { ratingAverage: 5 }
    });
});
