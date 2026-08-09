const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const Notification = require("../db/models/Notification");
const PassengerProfile = require("../db/models/PassengerProfile");
const Payment = require("../db/models/payment");
const Ride = require("../db/models/Ride");
const { completeRide } = require("../controllers/rideController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

function inProgressRide(overrides = {}) {
    return {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        status: "in_progress",
        finalPrice: 40,
        driverCompletedAt: null,
        passengerCompletedAt: null,
        completedAt: null,
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        },
        ...overrides
    };
}

// Records what completing a ride touched, so the tests can prove the side
// effects only fire once both sides agree.
function patchRideDependencies(ride, captured = {}) {
    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => (
        userId === "driver-user" ? { _id: ride.driverId } : null
    ));
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => (
        userId === "passenger-user" ? { _id: ride.passengerId } : null
    ));
    patchMethod(patches, DriverProfile, "findById", () => ({
        select: async () => ({ userId: "driver-user" })
    }));
    patchMethod(patches, PassengerProfile, "findById", () => ({
        select: async () => ({ userId: "passenger-user" })
    }));
    patchMethod(patches, Notification, "create", async (doc) => {
        captured.nudges = captured.nudges || [];
        captured.nudges.push(doc);
        return { _id: "notification-1", ...doc };
    });
    patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
        captured.driverUpdate = update;
        return { _id: id };
    });
    patchMethod(patches, PassengerProfile, "findByIdAndUpdate", async (id, update) => {
        captured.passengerUpdate = update;
        return { _id: id };
    });
    patchMethod(patches, Payment, "findOneAndUpdate", async (filter, update) => {
        captured.payment = { filter, update };
        return { _id: "payment-1" };
    });
    return captured;
}

function confirmAs(role) {
    return {
        user: { userId: `${role}-user`, role },
        params: { id: "ride-1" },
        body: {}
    };
}

test("the driver confirming alone leaves the ride in progress", async () => {
    const ride = inProgressRide();
    const captured = patchRideDependencies(ride);

    const res = makeRes();
    await completeRide(confirmAs("driver"), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.awaiting, "passenger");
    assert.equal(ride.status, "in_progress");
    assert.ok(ride.driverCompletedAt instanceof Date);
    assert.equal(captured.payment, undefined, "no payment before both sides confirm");
    assert.equal(captured.driverUpdate, undefined, "driver stays busy until the ride really ends");
});

test("the passenger confirming alone leaves the ride in progress", async () => {
    const ride = inProgressRide();
    const captured = patchRideDependencies(ride);

    const res = makeRes();
    await completeRide(confirmAs("passenger"), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.awaiting, "driver");
    assert.equal(ride.status, "in_progress");
    assert.ok(ride.passengerCompletedAt instanceof Date);
    assert.equal(captured.payment, undefined);
});

test("the second confirmation finishes the ride and runs the side effects once", async () => {
    const ride = inProgressRide();
    const captured = patchRideDependencies(ride);

    await completeRide(confirmAs("driver"), makeRes());
    const res = makeRes();
    await completeRide(confirmAs("passenger"), res);

    assert.equal(res.statusCode, 200);
    assert.equal(ride.status, "completed");
    assert.ok(ride.completedAt instanceof Date);
    assert.deepEqual(captured.driverUpdate, {
        $inc: { totalRides: 1, totalEarnings: 40 },
        status: "available"
    });
    assert.deepEqual(captured.passengerUpdate, { $inc: { totalRides: 1, totalSpent: 40 } });
    assert.equal(captured.payment.update.$setOnInsert.paymentStatus, "pending");
});

test("confirming twice from the same side does not stand in for the other", async () => {
    const ride = inProgressRide();
    const captured = patchRideDependencies(ride);

    await completeRide(confirmAs("driver"), makeRes());
    const firstConfirmedAt = ride.driverCompletedAt;

    const res = makeRes();
    await completeRide(confirmAs("driver"), res);

    assert.equal(ride.status, "in_progress");
    assert.equal(ride.driverCompletedAt, firstConfirmedAt, "the original confirmation time is kept");
    assert.equal(captured.payment, undefined);
});

test("the first confirmation nudges the other side", async () => {
    const ride = inProgressRide();
    const captured = patchRideDependencies(ride);

    await completeRide(confirmAs("driver"), makeRes());

    assert.equal(captured.nudges.length, 1);
    assert.equal(captured.nudges[0].userId, "passenger-user");
    assert.equal(captured.nudges[0].type, "ride_completed");
    assert.equal(captured.nudges[0].rideId, ride._id);
});

test("an admin can settle a disputed ride on behalf of both sides", async () => {
    const ride = inProgressRide();
    const captured = patchRideDependencies(ride);

    const res = makeRes();
    await completeRide({
        user: { userId: "admin-user", role: "admin" },
        params: { id: "ride-1" },
        body: {}
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(ride.status, "completed");
    assert.ok(ride.driverCompletedAt instanceof Date);
    assert.ok(ride.passengerCompletedAt instanceof Date);
    assert.equal(captured.payment.update.$setOnInsert.paymentStatus, "pending");
});

test("an admin settling a ride keeps a confirmation the driver already gave", async () => {
    const earlier = new Date("2026-01-01T10:00:00Z");
    const ride = inProgressRide({ driverCompletedAt: earlier });
    patchRideDependencies(ride);

    await completeRide({
        user: { userId: "admin-user", role: "admin" },
        params: { id: "ride-1" },
        body: {}
    }, makeRes());

    assert.equal(ride.driverCompletedAt, earlier);
    assert.equal(ride.status, "completed");
});

test("someone who is neither side cannot confirm the ride ended", async () => {
    const ride = inProgressRide();
    const captured = patchRideDependencies(ride);

    const res = makeRes();
    await completeRide({
        user: { userId: "stranger-user", role: "passenger" },
        params: { id: "ride-1" },
        body: {}
    }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(ride.status, "in_progress");
    assert.ok(!ride.driverCompletedAt);
    assert.ok(!ride.passengerCompletedAt);
    assert.equal(captured.payment, undefined);
});

test("a ride that is not in progress cannot be confirmed", async () => {
    const ride = inProgressRide({ status: "accepted" });
    patchRideDependencies(ride);

    const res = makeRes();
    await completeRide(confirmAs("driver"), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /not in progress/i);
    assert.ok(!ride.driverCompletedAt);
});
