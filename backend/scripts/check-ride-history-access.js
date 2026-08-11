const assert = require("assert");

const CarpoolRequest = require("../db/models/CarpoolRequest");
const Ride = require("../db/models/Ride");
const PassengerProfile = require("../db/models/PassengerProfile");
const DriverProfile = require("../db/models/DriverProfile");
const { getAllRides } = require("../controllers/rideController");

const originals = {
    carpoolFind: CarpoolRequest.find,
    rideFind: Ride.find,
    rideCountDocuments: Ride.countDocuments,
    passengerFindOne: PassengerProfile.findOne,
    driverFindOne: DriverProfile.findOne
};

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

function makeRideFind(capture) {
    return (filter) => {
        capture.filter = filter;
        return {
            populate() {
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
                return Promise.resolve([]);
            }
        };
    };
}

async function exercise({ user, query = {}, passenger = null, driver = null, carpoolSeats = [] }) {
    const capture = { filter: null, sort: null };

    CarpoolRequest.find = (filter) => {
        capture.carpoolFilter = filter;
        return {
            select(selection) {
                capture.carpoolSelection = selection;
                return Promise.resolve(carpoolSeats);
            }
        };
    };
    Ride.find = makeRideFind(capture);
    Ride.countDocuments = async (filter) => {
        capture.countFilter = filter;
        return 0;
    };
    PassengerProfile.findOne = async ({ userId }) => userId === user.userId ? passenger : null;
    DriverProfile.findOne = async ({ userId }) => userId === user.userId ? driver : null;

    const res = makeRes();
    await getAllRides({ user, query }, res);
    return { capture, res };
}

function assertOwnFilter(filter, expected) {
    assert(filter.$or, "non-admin history must be limited with an $or ownership filter");
    assert.deepStrictEqual(filter.$or, expected);
    assert.strictEqual(filter.status, undefined, "plain history access must not inject status filtering");
}

(async () => {
    try {
        const admin = await exercise({
            user: { userId: "admin-user", role: "admin" }
        });
        assert.deepStrictEqual(admin.capture.filter, {}, "admins should be able to list every ride");

        const passengerOnly = await exercise({
            user: { userId: "passenger-user", role: "passenger" },
            passenger: { _id: "passenger-profile" }
        });
        assertOwnFilter(passengerOnly.capture.filter, [{ passengerId: "passenger-profile" }]);
        assert.deepStrictEqual(passengerOnly.capture.carpoolFilter, {
            passengerId: "passenger-profile",
            rideId: { $ne: null },
            status: { $in: ["matched", "confirmed", "completed"] }
        });

        const passengerWithCarpoolSeat = await exercise({
            user: { userId: "passenger-user", role: "passenger" },
            passenger: { _id: "passenger-profile" },
            carpoolSeats: [{ rideId: "carpool-ride-1" }]
        });
        assertOwnFilter(passengerWithCarpoolSeat.capture.filter, [
            { passengerId: "passenger-profile" },
            { _id: { $in: ["carpool-ride-1"] } }
        ]);

        const driverOnly = await exercise({
            user: { userId: "driver-user", role: "driver" },
            driver: { _id: "driver-profile" }
        });
        assertOwnFilter(driverOnly.capture.filter, [{ driverId: "driver-profile" }]);

        const bothRoles = await exercise({
            user: { userId: "both-user", role: "both" },
            passenger: { _id: "both-passenger-profile" },
            driver: { _id: "both-driver-profile" },
            carpoolSeats: [{ rideId: "carpool-ride-2" }]
        });
        assertOwnFilter(bothRoles.capture.filter, [
            { passengerId: "both-passenger-profile" },
            { _id: { $in: ["carpool-ride-2"] } },
            { driverId: "both-driver-profile" }
        ]);

        const scopedPassengerId = await exercise({
            user: { userId: "passenger-user", role: "passenger" },
            query: { passengerId: "passenger-profile" },
            passenger: { _id: "passenger-profile" },
            carpoolSeats: [{ rideId: "carpool-ride-3" }]
        });
        assertOwnFilter(scopedPassengerId.capture.filter, [
            { passengerId: "passenger-profile" },
            { _id: { $in: ["carpool-ride-3"] } }
        ]);

        const unrelated = await exercise({
            user: { userId: "unrelated-user", role: "passenger" }
        });
        assert.deepStrictEqual(unrelated.res.body.items, [], "users without ride profiles should receive an empty history page");
        assert.deepStrictEqual(unrelated.res.body.pagination, {
            page: 1,
            limit: 50,
            total: 0,
            totalPages: 1,
            hasNextPage: false,
            hasPreviousPage: false
        });
        assert.strictEqual(unrelated.capture.filter, null, "users without profiles must not hit the all-rides query");

        const forgedPassengerId = await exercise({
            user: { userId: "passenger-user", role: "passenger" },
            query: { passengerId: "other-passenger" },
            passenger: { _id: "passenger-profile" }
        });
        assert.strictEqual(forgedPassengerId.res.statusCode, 403, "users must not query another passenger's rides");
        assert.strictEqual(forgedPassengerId.capture.filter, null, "forbidden passenger filters must not query rides");

        const openRequestsForDriver = await exercise({
            user: { userId: "driver-user", role: "driver" },
            query: { status: "searching" },
            driver: { _id: "driver-profile", isVerified: true, acceptsCarpoolRides: true }
        });
        assert.strictEqual(openRequestsForDriver.capture.filter.status, "searching");
        assert(
            openRequestsForDriver.capture.filter.$or?.every((condition) => Object.hasOwn(condition, "scheduledTime")),
            "open ride dispatch filters should only expose scheduled dispatch windows, not ride history ownership"
        );

        console.log("Ride history access check passed: history is limited to involved users, while admins can see all rides.");
    } finally {
        CarpoolRequest.find = originals.carpoolFind;
        Ride.find = originals.rideFind;
        Ride.countDocuments = originals.rideCountDocuments;
        PassengerProfile.findOne = originals.passengerFindOne;
        DriverProfile.findOne = originals.driverFindOne;
    }
})().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
