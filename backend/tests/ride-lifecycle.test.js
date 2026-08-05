const test = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Payment = require("../db/models/payment");
const Ride = require("../db/models/Ride");
const Vehicle = require("../db/models/Vehicle");
const User = require("../db/models/User");
const {
    createRide,
    acceptRide,
    driverArriving,
    startRide,
    completeRide,
    cancelRide
} = require("../controllers/rideController");
const {
    makeRes,
    makeRide,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

const pickupLocation = { address: "Pickup", lat: 32.0853, lng: 34.7818 };
const destinationLocation = { address: "Destination", lat: 31.7683, lng: 35.2137 };

function makeSession(events) {
    return {
        async withTransaction(callback) {
            events.push("transaction-start");
            try {
                await callback();
                events.push("transaction-commit");
            } catch (error) {
                events.push("transaction-abort");
                throw error;
            }
        },
        async endSession() {
            events.push("session-end");
        }
    };
}

test("point redemption and ride creation are committed in one Mongo transaction", async () => {
    const events = [];
    const session = makeSession(events);
    let userUpdate;
    let rideCreate;

    patchMethod(patches, mongoose, "startSession", async () => session);
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => {
        assert.equal(userId, "passenger-user");
        return { _id: "passenger-1", userId: "user-1" };
    });
    patchMethod(patches, User, "findOneAndUpdate", async (filter, update, options) => {
        userUpdate = { filter, update, options };
        return { _id: "user-1", loyaltyPoints: 85 };
    });
    patchMethod(patches, Ride, "create", async (docs, options) => {
        rideCreate = { docs, options };
        return [{ _id: "ride-1", ...docs[0] }];
    });

    const res = makeRes();
    await createRide({
        user: { userId: "passenger-user", role: "passenger" },
        body: {
            pickupLocation,
            destinationLocation,
            passengerCount: 1,
            pointsToRedeem: 15
        }
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.remainingPoints, 85);
    assert.equal(userUpdate.options.session, session);
    assert.equal(rideCreate.options.session, session);
    assert.equal(Array.isArray(rideCreate.docs), true);
    assert.equal(rideCreate.docs[0].passengerId, "passenger-1");
    assert.equal(rideCreate.docs[0].status, "searching");
    assert.deepEqual(userUpdate.update, { $inc: { loyaltyPoints: -15 } });
    assert.deepEqual(events, ["transaction-start", "transaction-commit", "session-end"]);
});

test("insufficient loyalty points aborts the transaction before ride creation", async () => {
    const events = [];
    const session = makeSession(events);
    let rideCreateCalls = 0;

    patchMethod(patches, mongoose, "startSession", async () => session);
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => (
        userId === "passenger-user" ? { _id: "passenger-1", userId: "user-1" } : null
    ));
    patchMethod(patches, User, "findOneAndUpdate", async (filter, update, options) => {
        assert.equal(options.session, session);
        return null;
    });
    patchMethod(patches, Ride, "create", async () => {
        rideCreateCalls += 1;
        throw new Error("Ride must not be created when points are unavailable");
    });

    const res = makeRes();
    await createRide({
        user: { userId: "passenger-user", role: "passenger" },
        body: {
            pickupLocation,
            destinationLocation,
            pointsToRedeem: 10
        }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: "Not enough points" });
    assert.equal(rideCreateCalls, 0);
    assert.deepEqual(events, ["transaction-start", "transaction-abort", "session-end"]);
});

test("transaction retries do not apply loyalty redemption twice", async () => {
    const session = {
        async withTransaction(callback) {
            await callback();
            await callback();
        },
        async endSession() {}
    };
    const finalPrices = [];

    patchMethod(patches, mongoose, "startSession", async () => session);
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => (
        userId === "passenger-user" ? { _id: "passenger-1", userId: "user-1" } : null
    ));
    patchMethod(patches, User, "findOneAndUpdate", async () => ({ _id: "user-1", loyaltyPoints: 90 }));
    patchMethod(patches, Ride, "create", async (docs) => {
        finalPrices.push(docs[0].finalPrice);
        return [{ _id: `ride-${finalPrices.length}`, ...docs[0] }];
    });

    const res = makeRes();
    await createRide({
        user: { userId: "passenger-user", role: "passenger" },
        body: {
            pickupLocation,
            destinationLocation,
            pointsToRedeem: 10
        }
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(finalPrices.length, 2);
    assert.equal(finalPrices[0], finalPrices[1]);
});

test("verified driver can claim, start, and complete a ride while payment/profile side effects are created", async () => {
    const driver = {
        _id: "driver-1",
        userId: "driver-user",
        status: "available",
        isVerified: true,
        acceptsCarpoolRides: true
    };
    const vehicle = {
        _id: "vehicle-1",
        driverId: "driver-1",
        isActive: true,
        seats: 4,
        testApproval: true,
        insuranceApproval: true
    };
    const ride = makeRide({
        status: "searching",
        driverId: null,
        vehicleId: null,
        passengerCount: 2,
        finalPrice: 58.5
    });

    let driverClaim;
    let rideClaim;
    let driverProfileUpdate;
    let passengerProfileUpdate;
    let paymentUpsert;

    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => {
        return userId === "driver-user" ? driver : null;
    });
    patchMethod(patches, PassengerProfile, "findOne", async () => null);
    patchMethod(patches, DriverProfile, "findById", async (id) => {
        return id === driver._id ? driver : null;
    });
    patchMethod(patches, Ride, "findOne", async (filter) => {
        assert.equal(filter._id, ride._id);
        assert.equal(filter.status, "searching");
        assert.ok(filter.$or, "driver dispatch lookup must include the scheduled dispatch window");
        return ride;
    });
    patchMethod(patches, Vehicle, "findOne", async (filter) => {
        assert.deepEqual(filter, { _id: vehicle._id, driverId: driver._id, isActive: true });
        return vehicle;
    });
    patchMethod(patches, DriverProfile, "findOneAndUpdate", async (filter, update, options) => {
        driverClaim = { filter, update, options };
        assert.deepEqual(filter, { _id: driver._id, status: "available", isVerified: true });
        assert.deepEqual(update, { status: "busy" });
        driver.status = "busy";
        return driver;
    });
    patchMethod(patches, Ride, "findOneAndUpdate", async (filter, update, options) => {
        rideClaim = { filter, update, options };
        ride.driverId = update.$set.driverId;
        ride.vehicleId = update.$set.vehicleId;
        ride.status = update.$set.status;
        return ride;
    });
    patchMethod(patches, Ride, "findById", async (id) => {
        assert.equal(id, ride._id);
        return ride;
    });
    patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
        driverProfileUpdate = { id, update };
        return { _id: id, ...update };
    });
    patchMethod(patches, PassengerProfile, "findByIdAndUpdate", async (id, update) => {
        passengerProfileUpdate = { id, update };
        return { _id: id, ...update };
    });
    patchMethod(patches, Payment, "findOneAndUpdate", async (filter, update, options) => {
        paymentUpsert = { filter, update, options };
        return { _id: "payment-1", ...update.$setOnInsert };
    });

    const acceptRes = makeRes();
    await acceptRide({
        user: { userId: "driver-user", role: "driver" },
        params: { id: ride._id },
        body: { vehicleId: vehicle._id }
    }, acceptRes);

    assert.equal(acceptRes.statusCode, 200);
    assert.equal(ride.status, "accepted");
    assert.equal(ride.driverId, driver._id);
    assert.equal(ride.vehicleId, vehicle._id);
    assert.equal(driverClaim.options.new, true);
    assert.equal(rideClaim.options.runValidators, true);

    const arrivingRes = makeRes();
    await driverArriving({
        user: { userId: "driver-user", role: "driver" },
        params: { id: ride._id },
        body: {}
    }, arrivingRes);

    assert.equal(arrivingRes.statusCode, 200);
    assert.equal(ride.status, "driver_arriving");

    const startRes = makeRes();
    await startRide({
        user: { userId: "driver-user", role: "driver" },
        params: { id: ride._id },
        body: {}
    }, startRes);

    assert.equal(startRes.statusCode, 200);
    assert.equal(ride.status, "in_progress");
    assert.ok(ride.startedAt instanceof Date);

    const completeRes = makeRes();
    await completeRide({
        user: { userId: "driver-user", role: "driver" },
        params: { id: ride._id },
        body: { paymentMethod: "not_real" }
    }, completeRes);

    assert.equal(completeRes.statusCode, 200);
    assert.equal(ride.status, "completed");
    assert.ok(ride.completedAt instanceof Date);
    assert.deepEqual(driverProfileUpdate.update, {
        $inc: { totalRides: 1, totalEarnings: 58.5 },
        status: "available"
    });
    assert.deepEqual(passengerProfileUpdate.update, {
        $inc: { totalRides: 1, totalSpent: 58.5 }
    });
    assert.deepEqual(paymentUpsert.filter, { rideId: ride._id });
    assert.equal(paymentUpsert.update.$setOnInsert.paymentMethod, "cash");
    assert.equal(paymentUpsert.update.$setOnInsert.paymentStatus, "paid");
    assert.ok(paymentUpsert.update.$setOnInsert.paidAt instanceof Date);
    assert.equal(paymentUpsert.options.upsert, true);
});

test("assigned driver is released when an accepted ride is cancelled", async () => {
    const ride = makeRide({ status: "accepted", driverId: "driver-1" });
    let releasedDriverId;
    let releasedUpdate;

    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => {
        return userId === "passenger-user" ? { _id: ride.passengerId, userId } : null;
    });
    patchMethod(patches, DriverProfile, "findOne", async () => null);
    patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
        releasedDriverId = id;
        releasedUpdate = update;
        return { _id: id, ...update };
    });

    const res = makeRes();
    await cancelRide({
        user: { userId: "passenger-user", role: "passenger" },
        params: { id: ride._id },
        body: { cancellationReason: "plans changed" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(ride.status, "cancelled");
    assert.equal(ride.cancelledBy, "passenger");
    assert.equal(ride.cancellationReason, "plans changed");
    assert.ok(ride.cancelledAt instanceof Date);
    assert.equal(releasedDriverId, "driver-1");
    assert.deepEqual(releasedUpdate, { status: "available" });
});
