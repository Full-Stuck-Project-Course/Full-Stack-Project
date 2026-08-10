const assert = require("assert");

const DriverProfile = require("../db/models/DriverProfile");
const Notification = require("../db/models/Notification");
const Ride = require("../db/models/Ride");
const Vehicle = require("../db/models/Vehicle");
const PassengerProfile = require("../db/models/PassengerProfile");
const CarpoolRequest = require("../db/models/CarpoolRequest");
const { createRide } = require("../controllers/rideController");
const {
    acceptCarpoolRequest,
    createCarpoolRequest,
    matchCarpoolRequest
} = require("../controllers/carpoolController");

const originals = {
    rideCreate: Ride.create,
    rideFindById: Ride.findById,
    rideFindOne: Ride.findOne,
    rideFindByIdAndUpdate: Ride.findByIdAndUpdate,
    passengerFindOne: PassengerProfile.findOne,
    passengerFindById: PassengerProfile.findById,
    driverFindOne: DriverProfile.findOne,
    driverFindOneAndUpdate: DriverProfile.findOneAndUpdate,
    driverFindByIdAndUpdate: DriverProfile.findByIdAndUpdate,
    notificationCreate: Notification.create,
    carpoolCreate: CarpoolRequest.create,
    carpoolFindById: CarpoolRequest.findById,
    carpoolFindOne: CarpoolRequest.findOne,
    carpoolFind: CarpoolRequest.find,
    carpoolFindByIdAndUpdate: CarpoolRequest.findByIdAndUpdate,
    vehicleFindById: Vehicle.findById,
    vehicleFindOne: Vehicle.findOne,
    carpoolFindOneAndUpdate: CarpoolRequest.findOneAndUpdate
};

// The booking guard runs before anything is created, so every scenario that
// creates a booking needs the "nothing open yet" answer.
function stubNoActiveBooking() {
    Ride.findOne = async () => null;
    CarpoolRequest.findOne = async () => null;
}

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

    stubNoActiveBooking();
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

    stubNoActiveBooking();
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

async function assertDriverApprovalOpensCarpoolRide() {
    const originalGoogleServerKey = process.env.GOOGLE_SERVER_MAPS_API_KEY;
    const originalGoogleKey = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_SERVER_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;

    let claimUpdate = null;
    let ridePayload = null;
    let confirmUpdate = null;
    let driverClaim = null;

    try {
        DriverProfile.findOne = async ({ userId }) => (
            userId === "driver-user"
                ? { _id: "driver-profile", userId, isVerified: true, acceptsCarpoolRides: true, status: "available" }
                : null
        );
        CarpoolRequest.findById = async () => ({
            _id: "request-id",
            passengerId: "passenger-profile",
            status: "pending",
            expiresAt: null,
            seatsNeeded: 2,
            pickupLocation,
            destinationLocation,
            requestedTime: new Date(Date.now() + 60_000)
        });
        Vehicle.findOne = () => ({
            sort: async () => ({
                _id: "vehicle-id",
                driverId: "driver-profile",
                isActive: true,
                seats: 4,
                vehicleType: "regular",
                testApproval: true,
                insuranceApproval: true
            })
        });
        CarpoolRequest.findOneAndUpdate = async (filter, update) => {
            claimUpdate = { filter, update };
            return { _id: "request-id", passengerId: "passenger-profile", ...update };
        };
        DriverProfile.findOneAndUpdate = async (filter, update) => {
            driverClaim = { filter, update };
            return { _id: "driver-profile", ...update };
        };
        Ride.create = async (payload) => {
            ridePayload = payload;
            return { _id: "carpool-ride", ...payload };
        };
        CarpoolRequest.findByIdAndUpdate = async (id, update) => {
            confirmUpdate = { id, update };
            return { _id: id, passengerId: "passenger-profile", ...update };
        };
        PassengerProfile.findById = () => ({ select: async () => ({ userId: "passenger-user" }) });
        Notification.create = async (doc) => ({ _id: "notification-id", ...doc });

        const res = makeRes();
        await acceptCarpoolRequest(
            { user: { userId: "driver-user", role: "driver" }, params: { id: "request-id" }, body: {} },
            res
        );

        assert.strictEqual(res.statusCode, 200, "a verified carpool driver must be able to approve a waiting passenger");
        assert.strictEqual(claimUpdate.filter.status, "pending", "approval must claim only a pending request");
        assert.strictEqual(claimUpdate.update.driverId, "driver-profile", "approval must record the approving driver");
        assert.deepStrictEqual(driverClaim.filter, { _id: "driver-profile", status: "available", isVerified: true },
            "opening a carpool ride must claim an available verified driver");
        assert.strictEqual(ridePayload.rideType, "carpool", "approval must open a carpool ride");
        assert.strictEqual(ridePayload.driverId, "driver-profile", "the approving driver must own the opened ride");
        assert.strictEqual(ridePayload.passengerId, "passenger-profile", "the approved passenger must own the opened ride");
        assert.strictEqual(ridePayload.passengerCount, 2, "the ride must seat the requested number of passengers");
        assert.strictEqual(confirmUpdate.update.status, "confirmed", "an approved request must end up confirmed");
        assert.strictEqual(confirmUpdate.update.rideId, "carpool-ride", "an approved request must point at the opened ride");
    } finally {
        if (originalGoogleServerKey === undefined) delete process.env.GOOGLE_SERVER_MAPS_API_KEY;
        else process.env.GOOGLE_SERVER_MAPS_API_KEY = originalGoogleServerKey;
        if (originalGoogleKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
        else process.env.GOOGLE_MAPS_API_KEY = originalGoogleKey;
    }
}

async function assertDriversWhoOptedOutSeeNoApproval() {
    DriverProfile.findOne = async () => ({
        _id: "driver-profile",
        userId: "driver-user",
        isVerified: true,
        acceptsCarpoolRides: false,
        status: "available"
    });
    CarpoolRequest.findById = async () => {
        throw new Error("a driver who declined carpool must be rejected before the request is read");
    };

    const res = makeRes();
    await acceptCarpoolRequest(
        { user: { userId: "driver-user", role: "driver" }, params: { id: "request-id" }, body: {} },
        res
    );

    assert.strictEqual(res.statusCode, 403, "a driver who does not accept carpool rides must not approve passengers");
}

async function assertSecondBookingIsRefusedWhileOneIsOpen() {
    PassengerProfile.findOne = async ({ userId }) => (
        userId === "passenger-user" ? { _id: "passenger-profile", userId } : null
    );
    Ride.findOne = async () => ({ _id: "open-ride", status: "in_progress" });
    CarpoolRequest.findOne = async () => null;
    Ride.create = async () => {
        throw new Error("a second ride must not be created while one is active");
    };
    CarpoolRequest.create = async () => {
        throw new Error("a carpool request must not be created while a ride is active");
    };

    const rideRes = makeRes();
    await createRide(
        passengerRequest({ pickupLocation, destinationLocation, passengerCount: 1 }),
        rideRes
    );
    assert.strictEqual(rideRes.statusCode, 409, "booking a ride while one is active must conflict");
    assert.strictEqual(rideRes.body.code, "ACTIVE_BOOKING_EXISTS", "the conflict must be identifiable by the client");

    const carpoolRes = makeRes();
    await createCarpoolRequest(
        passengerRequest({
            pickupLocation,
            destinationLocation,
            requestedTime: new Date(Date.now() + 60_000).toISOString(),
            seatsNeeded: 1
        }),
        carpoolRes
    );
    assert.strictEqual(carpoolRes.statusCode, 409, "booking a carpool while a ride is active must conflict");
    assert.strictEqual(carpoolRes.body.code, "ACTIVE_BOOKING_EXISTS", "the conflict must be identifiable by the client");

    // An open carpool request blocks a new ride just as an open ride does.
    Ride.findOne = async () => null;
    CarpoolRequest.findOne = async () => ({ _id: "open-request", status: "pending", rideId: null });

    const blockedByCarpool = makeRes();
    await createRide(
        passengerRequest({ pickupLocation, destinationLocation, passengerCount: 1 }),
        blockedByCarpool
    );
    assert.strictEqual(blockedByCarpool.statusCode, 409, "a queued carpool request must block a new ride");
    assert.strictEqual(blockedByCarpool.body.activeBooking.type, "carpool", "the conflict must name the carpool request");
}

(async () => {
    try {
        await assertCarpoolPostCreatesPendingRequest();
        await assertCarpoolRideCreationDoesNotBypassQueue();
        await assertOnlyPendingRequestsCanBeMatched();
        await assertMatchedRequestsReserveVehicleSeats();
        await assertDriverApprovalOpensCarpoolRide();
        await assertDriversWhoOptedOutSeeNoApproval();
        await assertSecondBookingIsRefusedWhileOneIsOpen();

        console.log("Carpool flow check passed: drivers approve waiting passengers and a passenger can only hold one booking.");
    } finally {
        Ride.create = originals.rideCreate;
        Ride.findById = originals.rideFindById;
        Ride.findOne = originals.rideFindOne;
        Ride.findByIdAndUpdate = originals.rideFindByIdAndUpdate;
        Vehicle.findById = originals.vehicleFindById;
        Vehicle.findOne = originals.vehicleFindOne;
        PassengerProfile.findOne = originals.passengerFindOne;
        PassengerProfile.findById = originals.passengerFindById;
        DriverProfile.findOne = originals.driverFindOne;
        DriverProfile.findOneAndUpdate = originals.driverFindOneAndUpdate;
        DriverProfile.findByIdAndUpdate = originals.driverFindByIdAndUpdate;
        Notification.create = originals.notificationCreate;
        CarpoolRequest.create = originals.carpoolCreate;
        CarpoolRequest.findById = originals.carpoolFindById;
        CarpoolRequest.findOne = originals.carpoolFindOne;
        CarpoolRequest.find = originals.carpoolFind;
        CarpoolRequest.findByIdAndUpdate = originals.carpoolFindByIdAndUpdate;
        CarpoolRequest.findOneAndUpdate = originals.carpoolFindOneAndUpdate;
    }
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
