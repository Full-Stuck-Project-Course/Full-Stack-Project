const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const CarpoolRequest = require("../db/models/CarpoolRequest");
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

test("carpool ride details include every approved passenger seat", async () => {
    const ride = makeRide({
        rideType: "carpool",
        passengerId: "passenger-1",
        driverId: "driver-1",
        passengerCount: 1
    });
    const capture = {};
    const seats = [
        {
            _id: "request-1",
            passengerId: { _id: "passenger-1", userId: { _id: "user-1", fullName: "First Passenger" } },
            seatsNeeded: 1,
            status: "confirmed",
            finalPrice: 22,
            pricePerSeat: 22
        },
        {
            _id: "request-2",
            passengerId: { _id: "passenger-2", userId: { _id: "user-2", fullName: "Second Passenger" } },
            seatsNeeded: 2,
            status: "confirmed",
            finalPrice: 44,
            pricePerSeat: 22
        }
    ];

    patchMethod(patches, Ride, "findById", () => queryResult(ride));
    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: "passenger-1" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);
    patchMethod(patches, CarpoolRequest, "find", (filter) => {
        capture.filter = filter;
        return queryResult(seats, capture);
    });

    const res = makeRes();
    await getRideById({
        user: { userId: "passenger-user", role: "passenger" },
        params: { id: ride._id },
        body: {}
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capture.filter, {
        rideId: ride._id,
        status: { $in: ["matched", "confirmed", "completed"] }
    });
    assert.equal(res.body.passengerCount, 3);
    assert.equal(res.body.carpoolPassengers.length, 2);
    assert.equal(res.body.carpoolPassengers[1].passengerId.userId.fullName, "Second Passenger");
});

test("payment lookup by ride is limited to involved passenger or driver", async () => {
    const ride = makeRide({
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1"
    });
    const payment = {
        _id: "payment-1",
        rideId: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        amount: 33
    };
    let paymentFilter = null;

    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, Payment, "findOne", (filter) => {
        paymentFilter = filter;
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
    assert.equal(paymentFilter, null);

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
    assert.deepEqual(paymentFilter, { rideId: "ride-1", passengerId: "passenger-1" });
    assert.equal(allowed.body, payment);
});
