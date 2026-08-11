const test = require("node:test");
const assert = require("node:assert/strict");

const CarpoolRequest = require("../db/models/CarpoolRequest");
const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const { getAllRides } = require("../controllers/rideController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

function stubPassenger() {
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => (
        userId === "passenger-user" ? { _id: "passenger-1" } : null
    ));
}

function stubDriver(driver = null) {
    patchMethod(patches, DriverProfile, "findOne", async () => driver);
}

function stubCarpoolSeats(capture, seats) {
    patchMethod(patches, CarpoolRequest, "find", (filter) => {
        capture.carpoolFilter = filter;
        return {
            select(selection) {
                capture.carpoolSelection = selection;
                return Promise.resolve(seats);
            }
        };
    });
}

function stubRideList(capture, rides = []) {
    patchMethod(patches, Ride, "find", (filter) => {
        capture.filter = filter;
        return {
            populate(pathName) {
                capture.populates ||= [];
                capture.populates.push(pathName);
                return this;
            },
            sort(sortSpec) {
                capture.sort = sortSpec;
                return this;
            },
            skip(skipValue) {
                capture.skip = skipValue;
                return this;
            },
            limit(limitValue) {
                capture.limit = limitValue;
                return Promise.resolve(rides);
            }
        };
    });
    patchMethod(patches, Ride, "countDocuments", async (filter) => {
        capture.countFilter = filter;
        return rides.length;
    });
}

test("a passenger's ride list includes carpool rides joined through approved requests", async () => {
    const capture = {};
    const rides = [{ _id: "own-ride" }, { _id: "joined-carpool-ride" }];

    stubPassenger();
    stubDriver();
    stubCarpoolSeats(capture, [
        { rideId: "joined-carpool-ride" },
        { rideId: { _id: "joined-carpool-ride" } }
    ]);
    stubRideList(capture, rides);

    const res = makeRes();
    await getAllRides({
        user: { userId: "passenger-user", role: "passenger" },
        query: {}
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capture.carpoolFilter, {
        passengerId: "passenger-1",
        rideId: { $ne: null },
        status: { $in: ["matched", "confirmed", "completed"] }
    });
    assert.equal(capture.carpoolSelection, "rideId");
    assert.deepEqual(capture.filter.$or, [
        { passengerId: "passenger-1" },
        { _id: { $in: ["joined-carpool-ride"] } }
    ]);
    assert.deepEqual(capture.countFilter, capture.filter);
    assert.deepEqual(res.body.items, rides);
});

test("passenger-scoped ride lookup includes joined carpool rides for booking checks", async () => {
    const capture = {};

    stubPassenger();
    stubDriver();
    stubCarpoolSeats(capture, [{ rideId: "joined-carpool-ride" }]);
    stubRideList(capture);

    const res = makeRes();
    await getAllRides({
        user: { userId: "passenger-user", role: "passenger" },
        query: { passengerId: "passenger-1" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capture.filter.$or, [
        { passengerId: "passenger-1" },
        { _id: { $in: ["joined-carpool-ride"] } }
    ]);
});
