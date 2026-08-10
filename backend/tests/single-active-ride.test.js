const test = require("node:test");
const assert = require("node:assert/strict");

const CarpoolRequest = require("../db/models/CarpoolRequest");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const { createRide } = require("../controllers/rideController");
const { createCarpoolRequest } = require("../controllers/carpoolController");
const {
    ACTIVE_RIDE_STATUSES,
    OPEN_CARPOOL_STATUSES,
    findActiveBookingForPassenger
} = require("../utils/activeBooking");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

const pickupLocation = { address: "Pickup", lat: 32.0853, lng: 34.7818 };
const destinationLocation = { address: "Destination", lat: 31.7683, lng: 35.2137 };

function passengerRequest(body = {}) {
    return { user: { userId: "passenger-user", role: "passenger" }, body };
}

function carpoolBody(overrides = {}) {
    return {
        pickupLocation,
        destinationLocation,
        requestedTime: new Date(Date.now() + 60_000).toISOString(),
        seatsNeeded: 1,
        ...overrides
    };
}

function stubPassenger() {
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => (
        userId === "passenger-user" ? { _id: "passenger-1", userId: "user-1" } : null
    ));
}

function stubOpenBooking({ ride = null, carpoolRequest = null } = {}) {
    patchMethod(patches, Ride, "findOne", async () => ride);
    patchMethod(patches, CarpoolRequest, "findOne", async () => carpoolRequest);
}

function refuseCreation() {
    patchMethod(patches, Ride, "create", async () => {
        throw new Error("nothing may be created while a booking is open");
    });
    patchMethod(patches, CarpoolRequest, "create", async () => {
        throw new Error("nothing may be created while a booking is open");
    });
}

test("the booking lookup covers every status where a passenger is riding or waiting", async () => {
    assert.deepEqual(ACTIVE_RIDE_STATUSES, ["searching", "accepted", "driver_arriving", "in_progress"]);
    assert.deepEqual(OPEN_CARPOOL_STATUSES, ["pending", "matched", "confirmed"]);

    let rideFilter;
    let carpoolFilter;
    patchMethod(patches, Ride, "findOne", async (filter) => {
        rideFilter = filter;
        return null;
    });
    patchMethod(patches, CarpoolRequest, "findOne", async (filter) => {
        carpoolFilter = filter;
        return null;
    });

    assert.equal(await findActiveBookingForPassenger("passenger-1"), null);
    assert.deepEqual(rideFilter, { passengerId: "passenger-1", status: { $in: ACTIVE_RIDE_STATUSES } });
    assert.deepEqual(carpoolFilter, { passengerId: "passenger-1", status: { $in: OPEN_CARPOOL_STATUSES } });
});

test("a ride still looking for a driver blocks a second booking", async () => {
    stubPassenger();
    stubOpenBooking({ ride: { _id: "ride-1", status: "searching" } });
    refuseCreation();

    const res = makeRes();
    await createRide(passengerRequest({ pickupLocation, destinationLocation, passengerCount: 1 }), res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "ACTIVE_BOOKING_EXISTS");
    assert.equal(res.body.activeBooking.type, "ride");
    assert.equal(res.body.activeBooking.rideId, "ride-1");
    assert.match(res.body.error, /active ride/i);
});

test("a ride under way blocks a second booking", async () => {
    stubPassenger();
    stubOpenBooking({ ride: { _id: "ride-1", status: "in_progress" } });
    refuseCreation();

    const res = makeRes();
    await createRide(passengerRequest({ pickupLocation, destinationLocation }), res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.activeBooking.status, "in_progress");
});

test("a queued carpool request blocks a new ride", async () => {
    stubPassenger();
    stubOpenBooking({ carpoolRequest: { _id: "request-1", status: "pending", rideId: null } });
    refuseCreation();

    const res = makeRes();
    await createRide(passengerRequest({ pickupLocation, destinationLocation }), res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.activeBooking.type, "carpool");
    assert.equal(res.body.activeBooking.requestId, "request-1");
});

test("an active ride blocks a new carpool request", async () => {
    stubPassenger();
    stubOpenBooking({ ride: { _id: "ride-1", status: "driver_arriving" } });
    refuseCreation();

    const res = makeRes();
    await createCarpoolRequest(passengerRequest(carpoolBody()), res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "ACTIVE_BOOKING_EXISTS");
});

test("an approved carpool seat blocks another carpool request", async () => {
    stubPassenger();
    stubOpenBooking({ carpoolRequest: { _id: "request-1", status: "confirmed", rideId: "ride-9" } });
    refuseCreation();

    const res = makeRes();
    await createCarpoolRequest(passengerRequest(carpoolBody()), res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.activeBooking.rideId, "ride-9",
        "the client needs the ride to send the passenger to");
});

test("a finished ride leaves the passenger free to book again", async () => {
    let created;
    stubPassenger();
    stubOpenBooking();
    patchMethod(patches, Ride, "create", async (payload) => {
        created = payload;
        return { _id: "ride-2", ...payload };
    });

    const res = makeRes();
    await createRide(passengerRequest({ pickupLocation, destinationLocation, passengerCount: 1 }), res);

    assert.equal(res.statusCode, 201);
    assert.equal(created.status, "searching");
});

test("an admin can still place a ride for a passenger who is mid-trip", async () => {
    let created;
    patchMethod(patches, PassengerProfile, "findById", async () => ({ _id: "passenger-1", userId: "user-1" }));
    patchMethod(patches, Ride, "findOne", async () => {
        throw new Error("the booking guard must not run for an admin");
    });
    patchMethod(patches, Ride, "create", async (payload) => {
        created = payload;
        return { _id: "ride-3", ...payload };
    });

    const res = makeRes();
    await createRide({
        user: { userId: "admin-user", role: "admin" },
        body: { passengerId: "passenger-1", pickupLocation, destinationLocation }
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(created.passengerId, "passenger-1");
});
