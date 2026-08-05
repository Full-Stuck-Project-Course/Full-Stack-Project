const assert = require("assert");

const Ride = require("../db/models/Ride");
const Vehicle = require("../db/models/Vehicle");
const PassengerProfile = require("../db/models/PassengerProfile");
const CarpoolRequest = require("../db/models/CarpoolRequest");
const { createRide } = require("../controllers/rideController");
const { createCarpoolRequest, matchCarpoolRequest } = require("../controllers/carpoolController");

const originals = {
    rideCreate: Ride.create,
    rideFindById: Ride.findById,
    passengerFindOne: PassengerProfile.findOne,
    carpoolCreate: CarpoolRequest.create,
    carpoolFindById: CarpoolRequest.findById,
    carpoolFind: CarpoolRequest.find,
    vehicleFindById: Vehicle.findById,
    carpoolFindOneAndUpdate: CarpoolRequest.findOneAndUpdate
};

const pickupLocation = { address: "Pickup", lat: 32.0853, lng: 34.7818 };
const destinationLocation = { address: "Destination", lat: 31.7683, lng: 35.2137 };

function makeRes() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

function passengerRequest(body = {}) {
    return {
        user: { userId: "passenger-user", role: "passenger" },
        body
    };
}

async function assertCarpoolPostCreatesPendingRequest() {
    let createdPayload = null;

    PassengerProfile.findOne = async ({ userId }) => (
        userId === "passenger-user" ? { _id: "passenger-profile", userId } : null
    );
    CarpoolRequest.create = async (payload) => {
        createdPayload = payload;
        return { _id: "carpool-request", ...payload };
    };

    const res = makeRes();
    await createCarpoolRequest(
        passengerRequest({
            pickupLocation,
            destinationLocation,
            requestedTime: new Date(Date.now() + 60_000).toISOString(),
            seatsNeeded: 2,
            maxDetourMinutes: 12,
            pricePerSeat: 18
        }),
        res
    );

    assert.strictEqual(res.statusCode, 201, "POST /carpool should create a request");
    assert.strictEqual(createdPayload.status, "pending", "POST /carpool must enter the matching queue as pending");
    assert.strictEqual(createdPayload.rideId, null, "POST /carpool must not bind to a ride before matching");
    assert.strictEqual(createdPayload.seatsNeeded, 2, "POST /carpool should preserve the requested seat count");
}

async function assertCarpoolRideCreationDoesNotBypassQueue() {
    let carpoolCreateCalls = 0;

    PassengerProfile.findOne = async ({ userId }) => (
        userId === "passenger-user" ? { _id: "passenger-profile", userId } : null
    );
    Ride.create = async (payload) => ({ _id: "ride-id", ...payload });
    CarpoolRequest.create = async () => {
        carpoolCreateCalls += 1;
        throw new Error("createRide must not create CarpoolRequest records");
    };

    const res = makeRes();
    await createRide(
        passengerRequest({
            rideType: "carpool",
            pickupLocation,
            destinationLocation,
            passengerCount: 2
        }),
        res
    );

    assert.strictEqual(res.statusCode, 201, "POST /rides should still create carpool rides for explicit ride creation");
    assert.strictEqual(carpoolCreateCalls, 0, "POST /rides must not create confirmed carpool requests that skip matching");
}

async function assertOnlyPendingRequestsCanBeMatched() {
    let updatePayload = null;

    Ride.findById = async () => ({
        _id: "ride-id",
        rideType: "carpool",
        status: "searching",
        vehicleId: null,
        passengerCount: 1
    });

    CarpoolRequest.findById = async () => ({
        _id: "request-id",
        status: "confirmed",
        expiresAt: null,
        seatsNeeded: 1
    });
    CarpoolRequest.findOneAndUpdate = async () => {
        throw new Error("confirmed requests must not be matched");
    };

    const rejected = makeRes();
    await matchCarpoolRequest(
        { user: { userId: "admin-user", role: "admin" }, params: { id: "request-id" }, body: { rideId: "ride-id" } },
        rejected
    );
    assert.strictEqual(rejected.statusCode, 409, "confirmed carpool requests must not be matchable");

    CarpoolRequest.findById = async () => ({
        _id: "request-id",
        status: "pending",
        expiresAt: null,
        seatsNeeded: 1
    });
    CarpoolRequest.findOneAndUpdate = async (filter, update) => {
        updatePayload = { filter, update };
        return { _id: "request-id", status: update.status, rideId: update.rideId };
    };

    const matched = makeRes();
    await matchCarpoolRequest(
        { user: { userId: "admin-user", role: "admin" }, params: { id: "request-id" }, body: { rideId: "ride-id" } },
        matched
    );

    assert.strictEqual(matched.statusCode, 200, "pending carpool requests should be matchable");
    assert.strictEqual(updatePayload.filter.status, "pending", "matching must claim only pending requests");
    assert.strictEqual(updatePayload.update.status, "matched", "matching should move requests from pending to matched");
}

async function assertMatchedRequestsReserveVehicleSeats() {
    let matchedFilter = null;
    let updateCalled = false;

    Ride.findById = async () => ({
        _id: "ride-id",
        rideType: "carpool",
        status: "searching",
        vehicleId: "vehicle-id",
        passengerCount: 1
    });
    Vehicle.findById = async () => ({ _id: "vehicle-id", seats: 4 });
    CarpoolRequest.findById = async () => ({
        _id: "request-id",
        status: "pending",
        expiresAt: null,
        seatsNeeded: 2
    });
    CarpoolRequest.find = async (filter) => {
        matchedFilter = filter;
        return [{ _id: "matched-request", seatsNeeded: 2 }];
    };
    CarpoolRequest.findOneAndUpdate = async () => {
        updateCalled = true;
        return { _id: "request-id", status: "matched", rideId: "ride-id" };
    };

    const res = makeRes();
    await matchCarpoolRequest(
        { user: { userId: "admin-user", role: "admin" }, params: { id: "request-id" }, body: { rideId: "ride-id" } },
        res
    );

    assert.strictEqual(res.statusCode, 400, "carpool matching must reject requests that exceed vehicle seats");
    assert.strictEqual(updateCalled, false, "over-capacity matches must not update the request");
    assert.strictEqual(matchedFilter.rideId, "ride-id", "capacity checks must include existing matches for the target ride");
    assert.deepStrictEqual(matchedFilter.status.$in, ["matched", "confirmed"], "capacity checks must count matched and confirmed requests");
}

(async () => {
    try {
        await assertCarpoolPostCreatesPendingRequest();
        await assertCarpoolRideCreationDoesNotBypassQueue();
        await assertOnlyPendingRequestsCanBeMatched();
        await assertMatchedRequestsReserveVehicleSeats();

        console.log("Carpool flow check passed: booking enters /carpool as pending and matching only consumes pending requests.");
    } finally {
        Ride.create = originals.rideCreate;
        Ride.findById = originals.rideFindById;
        Vehicle.findById = originals.vehicleFindById;
        PassengerProfile.findOne = originals.passengerFindOne;
        CarpoolRequest.create = originals.carpoolCreate;
        CarpoolRequest.findById = originals.carpoolFindById;
        CarpoolRequest.find = originals.carpoolFind;
        CarpoolRequest.findOneAndUpdate = originals.carpoolFindOneAndUpdate;
    }
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
