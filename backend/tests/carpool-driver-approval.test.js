const test = require("node:test");
const assert = require("node:assert/strict");

const CarpoolRequest = require("../db/models/CarpoolRequest");
const DriverProfile = require("../db/models/DriverProfile");
const Notification = require("../db/models/Notification");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const Vehicle = require("../db/models/Vehicle");
const {
    acceptCarpoolRequest,
    getPendingRequests
} = require("../controllers/carpoolController");
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

const pickupLocation = { address: "Pickup", lat: 32.0853, lng: 34.7818 };
const destinationLocation = { address: "Destination", lat: 31.7683, lng: 35.2137 };

function makeDriver(overrides = {}) {
    return {
        _id: "driver-1",
        userId: "driver-user",
        isVerified: true,
        acceptsCarpoolRides: true,
        status: "available",
        ...overrides
    };
}

function makeVehicle(overrides = {}) {
    return {
        _id: "vehicle-1",
        driverId: "driver-1",
        isActive: true,
        seats: 4,
        vehicleType: "regular",
        testApproval: true,
        insuranceApproval: true,
        ...overrides
    };
}

function makeRequest(overrides = {}) {
    return {
        _id: "request-1",
        passengerId: "passenger-1",
        status: "pending",
        expiresAt: null,
        seatsNeeded: 1,
        pickupLocation,
        destinationLocation,
        requestedTime: new Date(Date.now() + 60_000),
        ...overrides
    };
}

// Vehicle lookup in the approval path is a sorted query, not a bare promise.
function stubVehicle(vehicle) {
    patchMethod(patches, Vehicle, "findOne", () => ({ sort: async () => vehicle }));
}

function stubApprovalNotice() {
    patchMethod(patches, PassengerProfile, "findById", () => ({
        select: async () => ({ userId: "passenger-user" })
    }));
    patchMethod(patches, Notification, "create", async (doc) => ({ _id: "notification-1", ...doc }));
}

function withoutGoogleMaps(run) {
    const serverKey = process.env.GOOGLE_SERVER_MAPS_API_KEY;
    const browserKey = process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_SERVER_MAPS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    return (async () => {
        try {
            return await run();
        } finally {
            if (serverKey === undefined) delete process.env.GOOGLE_SERVER_MAPS_API_KEY;
            else process.env.GOOGLE_SERVER_MAPS_API_KEY = serverKey;
            if (browserKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
            else process.env.GOOGLE_MAPS_API_KEY = browserKey;
        }
    })();
}

test("a verified carpool driver sees the queue of waiting passengers", async () => {
    const capture = {};
    const waiting = [makeRequest()];

    patchMethod(patches, DriverProfile, "findOne", async ({ userId }) => (
        userId === "driver-user" ? makeDriver() : null
    ));
    patchMethod(patches, CarpoolRequest, "find", (filter) => {
        capture.filter = filter;
        return queryResult(waiting, capture);
    });

    const res = makeRes();
    await getPendingRequests({ user: { userId: "driver-user", role: "driver" }, query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, waiting);
    assert.equal(capture.filter.status, "pending");
    assert.ok(capture.filter.$or, "expired requests must be filtered out of the queue");
});

test("a driver who turned carpool off gets an empty queue instead of other people's requests", async () => {
    patchMethod(patches, DriverProfile, "findOne", async () => makeDriver({ acceptsCarpoolRides: false }));
    patchMethod(patches, CarpoolRequest, "find", () => {
        throw new Error("the queue must not be read for a driver who declined carpool");
    });

    const res = makeRes();
    await getPendingRequests({ user: { userId: "driver-user", role: "driver" }, query: {} }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, []);
});

test("an unverified driver cannot read the carpool queue", async () => {
    patchMethod(patches, DriverProfile, "findOne", async () => makeDriver({ isVerified: false }));
    patchMethod(patches, CarpoolRequest, "find", () => {
        throw new Error("the queue must not be read for an unverified driver");
    });

    const res = makeRes();
    await getPendingRequests({ user: { userId: "driver-user", role: "driver" }, query: {} }, res);

    assert.equal(res.statusCode, 403);
});

test("approving a waiting passenger opens a carpool ride and confirms the request", async () => {
    await withoutGoogleMaps(async () => {
        const request = makeRequest({ seatsNeeded: 2 });
        let claim;
        let driverClaim;
        let ridePayload;
        let confirm;
        let notice;

        patchMethod(patches, DriverProfile, "findOne", async () => makeDriver());
        patchMethod(patches, CarpoolRequest, "findById", async () => request);
        stubVehicle(makeVehicle());
        patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async (filter, update) => {
            claim = { filter, update };
            return { ...request, ...update };
        });
        patchMethod(patches, DriverProfile, "findOneAndUpdate", async (filter, update) => {
            driverClaim = { filter, update };
            return makeDriver({ status: update.status });
        });
        patchMethod(patches, Ride, "create", async (payload) => {
            ridePayload = payload;
            return { _id: "carpool-ride-1", ...payload };
        });
        patchMethod(patches, CarpoolRequest, "findByIdAndUpdate", async (id, update) => {
            confirm = { id, update };
            return { ...request, ...update };
        });
        patchMethod(patches, PassengerProfile, "findById", () => ({
            select: async () => ({ userId: "passenger-user" })
        }));
        patchMethod(patches, Notification, "create", async (doc) => {
            notice = doc;
            return { _id: "notification-1", ...doc };
        });

        const res = makeRes();
        await acceptCarpoolRequest({
            user: { userId: "driver-user", role: "driver" },
            params: { id: request._id },
            body: {}
        }, res);

        assert.equal(res.statusCode, 200);
        // The claim has to be conditional so two drivers cannot take the same rider.
        assert.equal(claim.filter.status, "pending");
        assert.equal(claim.update.driverId, "driver-1");
        assert.deepEqual(driverClaim.filter, { _id: "driver-1", status: "available", isVerified: true });
        assert.deepEqual(driverClaim.update, { status: "busy" });
        assert.equal(ridePayload.rideType, "carpool");
        assert.equal(ridePayload.status, "accepted");
        assert.equal(ridePayload.driverId, "driver-1");
        assert.equal(ridePayload.vehicleId, "vehicle-1");
        assert.equal(ridePayload.passengerId, "passenger-1");
        assert.equal(ridePayload.passengerCount, 2);
        assert.equal(ridePayload.pickupLocation.address, pickupLocation.address);
        assert.ok(ridePayload.finalPrice > 0, "the opened ride must carry a fare");
        assert.equal(confirm.update.status, "confirmed");
        assert.equal(confirm.update.rideId, "carpool-ride-1");
        assert.equal(notice.userId, "passenger-user");
        assert.equal(notice.rideId, "carpool-ride-1");
    });
});

test("a second passenger joins the carpool ride the driver is already running", async () => {
    const request = makeRequest({ _id: "request-2", passengerId: "passenger-2", seatsNeeded: 1 });
    const ride = {
        _id: "carpool-ride-1",
        rideType: "carpool",
        driverId: "driver-1",
        status: "driver_arriving",
        passengerCount: 2
    };
    let reservedFilter;
    let rideCreateCalls = 0;
    let confirm;

    patchMethod(patches, DriverProfile, "findOne", async () => makeDriver({ status: "busy" }));
    patchMethod(patches, CarpoolRequest, "findById", async () => request);
    stubVehicle(makeVehicle());
    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, CarpoolRequest, "find", async (filter) => {
        reservedFilter = filter;
        return [{ _id: "request-1", seatsNeeded: 1 }];
    });
    patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async (filter, update) => ({ ...request, ...update }));
    patchMethod(patches, Ride, "create", async () => {
        rideCreateCalls += 1;
        throw new Error("joining an existing carpool must not open another ride");
    });
    patchMethod(patches, CarpoolRequest, "findByIdAndUpdate", async (id, update) => {
        confirm = { id, update };
        return { ...request, ...update };
    });
    stubApprovalNotice();

    const res = makeRes();
    await acceptCarpoolRequest({
        user: { userId: "driver-user", role: "driver" },
        params: { id: request._id },
        body: { rideId: ride._id }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(rideCreateCalls, 0);
    assert.equal(confirm.update.rideId, "carpool-ride-1");
    assert.equal(reservedFilter.rideId, "carpool-ride-1");
    assert.deepEqual(reservedFilter.status.$in, ["matched", "confirmed"],
        "seats already promised to other riders must count against capacity");
});

test("a passenger is refused when the seats left on the ride do not cover the request", async () => {
    const request = makeRequest({ _id: "request-3", seatsNeeded: 2 });
    const ride = {
        _id: "carpool-ride-1",
        rideType: "carpool",
        driverId: "driver-1",
        status: "accepted",
        passengerCount: 2
    };

    patchMethod(patches, DriverProfile, "findOne", async () => makeDriver({ status: "busy" }));
    patchMethod(patches, CarpoolRequest, "findById", async () => request);
    stubVehicle(makeVehicle({ seats: 4 }));
    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, CarpoolRequest, "find", async () => [{ _id: "request-1", seatsNeeded: 1 }]);
    patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async () => {
        throw new Error("an over-capacity request must not be claimed");
    });

    const res = makeRes();
    await acceptCarpoolRequest({
        user: { userId: "driver-user", role: "driver" },
        params: { id: request._id },
        body: { rideId: ride._id }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /seats/);
});

test("a driver cannot add passengers to someone else's carpool ride", async () => {
    patchMethod(patches, DriverProfile, "findOne", async () => makeDriver({ status: "busy" }));
    patchMethod(patches, CarpoolRequest, "findById", async () => makeRequest());
    stubVehicle(makeVehicle());
    patchMethod(patches, Ride, "findById", async () => ({
        _id: "carpool-ride-9",
        rideType: "carpool",
        driverId: "driver-2",
        status: "accepted",
        passengerCount: 1
    }));
    patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async () => {
        throw new Error("another driver's ride must not be claimed");
    });

    const res = makeRes();
    await acceptCarpoolRequest({
        user: { userId: "driver-user", role: "driver" },
        params: { id: "request-1" },
        body: { rideId: "carpool-ride-9" }
    }, res);

    assert.equal(res.statusCode, 403);
});

test("only pending requests can be approved", async () => {
    patchMethod(patches, DriverProfile, "findOne", async () => makeDriver());
    patchMethod(patches, CarpoolRequest, "findById", async () => makeRequest({ status: "confirmed" }));
    patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async () => {
        throw new Error("a confirmed request must not be approved again");
    });

    const res = makeRes();
    await acceptCarpoolRequest({
        user: { userId: "driver-user", role: "driver" },
        params: { id: "request-1" },
        body: {}
    }, res);

    assert.equal(res.statusCode, 409);
});

test("a driver whose vehicle documents are not approved cannot take carpool passengers", async () => {
    patchMethod(patches, DriverProfile, "findOne", async () => makeDriver());
    patchMethod(patches, CarpoolRequest, "findById", async () => makeRequest());
    stubVehicle(makeVehicle({ insuranceApproval: false }));
    patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async () => {
        throw new Error("an undocumented vehicle must not claim a rider");
    });

    const res = makeRes();
    await acceptCarpoolRequest({
        user: { userId: "driver-user", role: "driver" },
        params: { id: "request-1" },
        body: {}
    }, res);

    assert.equal(res.statusCode, 403);
});

test("a failed ride opening returns the passenger to the queue and frees the driver", async () => {
    await withoutGoogleMaps(async () => {
        const request = makeRequest();
        let rollback;
        let released;

        patchMethod(patches, DriverProfile, "findOne", async () => makeDriver());
        patchMethod(patches, CarpoolRequest, "findById", async () => request);
        stubVehicle(makeVehicle());
        patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async (filter, update) => ({ ...request, ...update }));
        patchMethod(patches, DriverProfile, "findOneAndUpdate", async () => makeDriver({ status: "busy" }));
        patchMethod(patches, Ride, "create", async () => {
            throw new Error("ride storage is down");
        });
        patchMethod(patches, CarpoolRequest, "findByIdAndUpdate", async (id, update) => {
            rollback = { id, update };
            return { ...request, ...update };
        });
        patchMethod(patches, DriverProfile, "findByIdAndUpdate", async (id, update) => {
            released = { id, update };
            return { _id: id, ...update };
        });

        const res = makeRes();
        await acceptCarpoolRequest({
            user: { userId: "driver-user", role: "driver" },
            params: { id: request._id },
            body: {}
        }, res);

        assert.equal(res.statusCode, 400);
        assert.equal(rollback.update.status, "pending", "a half-finished approval must not strand the passenger");
        assert.equal(rollback.update.driverId, null);
        assert.deepEqual(released.update, { status: "available" }, "the driver must not stay busy for a ride that never opened");
    });
});
