const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Payment = require("../db/models/payment");
const Ride = require("../db/models/Ride");
const { getPaymentByRide } = require("../controllers/paymentController");
const { getRideById, startRide } = require("../controllers/rideController");
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

test("ride details are hidden from users who are neither passenger nor assigned driver", async () => {
    const ride = makeRide({ passengerId: "passenger-1", driverId: "driver-1" });

    patchMethod(patches, Ride, "findById", () => queryResult(ride));
    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: "other-passenger" }));
    patchMethod(patches, DriverProfile, "findOne", async () => ({ _id: "other-driver" }));

    const res = makeRes();
    await getRideById({
        user: { userId: "unrelated-user", role: "passenger" },
        params: { id: ride._id },
        body: {}
    }, res);

    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: "Access denied" });
});

test("only the assigned driver can start a ride", async () => {
    const ride = makeRide({
        status: "accepted",
        passengerId: "passenger-1",
        driverId: "assigned-driver"
    });

    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, PassengerProfile, "findOne", async () => null);
    patchMethod(patches, DriverProfile, "findOne", async () => ({ _id: "other-driver" }));

    const res = makeRes();
    await startRide({
        user: { userId: "other-driver-user", role: "driver" },
        params: { id: ride._id },
        body: {}
    }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(ride.status, "accepted");
    assert.equal(ride.saveCount, 0);
});

test("payment lookup by ride is limited to involved passenger or driver", async () => {
    const payment = {
        _id: "payment-1",
        rideId: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        amount: 33
    };

    patchMethod(patches, Payment, "findOne", (filter) => {
        assert.deepEqual(filter, { rideId: "ride-1" });
        return queryResult(payment);
    });
    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: "other-passenger" }));
    patchMethod(patches, DriverProfile, "findOne", async () => ({ _id: "other-driver" }));

    const denied = makeRes();
    await getPaymentByRide({
        user: { userId: "unrelated-user", role: "passenger" },
        params: { rideId: "ride-1" },
        body: {},
        query: {}
    }, denied);

    assert.equal(denied.statusCode, 403);

    PassengerProfile.findOne = async () => ({ _id: "passenger-1" });
    DriverProfile.findOne = async () => null;

    const allowed = makeRes();
    await getPaymentByRide({
        user: { userId: "passenger-user", role: "passenger" },
        params: { rideId: "ride-1" },
        body: {},
        query: {}
    }, allowed);

    assert.equal(allowed.statusCode, 200);
    assert.equal(allowed.body, payment);
});
