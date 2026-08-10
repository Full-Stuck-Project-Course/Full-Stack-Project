const test = require("node:test");
const assert = require("node:assert/strict");

process.env.JWT_SECRET = "test-booking-expiry-secret-with-more-than-32-chars";

const CarpoolRequest = require("../db/models/CarpoolRequest");
const Notification = require("../db/models/Notification");
const PassengerProfile = require("../db/models/PassengerProfile");
const Ride = require("../db/models/Ride");
const {
    DEFAULT_APPROVAL_GRACE_MS,
    approvalCutoff,
    approvalDeadline,
    expiredCarpoolRequestFilter,
    expiredRideFilter
} = require("../utils/bookingExpiry");
const {
    autoCancelStaleCarpoolRequests,
    autoCancelStaleRides
} = require("../server");
const {
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

const MINUTE = 60 * 1000;
const now = new Date("2026-08-10T12:00:00.000Z");

function makeStaleRide(overrides = {}) {
    return {
        _id: "ride-1",
        passengerId: "passenger-1",
        rideType: "ride",
        status: "searching",
        scheduledTime: null,
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        },
        ...overrides
    };
}

test("the grace period is thirty minutes", () => {
    assert.equal(DEFAULT_APPROVAL_GRACE_MS, 30 * MINUTE);
    assert.equal(approvalCutoff(now).toISOString(), new Date(now.getTime() - 30 * MINUTE).toISOString());
});

test("a scheduled booking is measured from its scheduled time, not from when it was booked", () => {
    const bookedLongAgo = {
        createdAt: new Date("2026-08-01T09:00:00.000Z"),
        scheduledTime: new Date("2026-08-20T18:00:00.000Z")
    };
    assert.equal(
        approvalDeadline(bookedLongAgo).toISOString(),
        new Date("2026-08-20T18:30:00.000Z").toISOString(),
        "a ride booked weeks early must expire 30 minutes after the time it was booked for"
    );

    const immediate = { createdAt: new Date("2026-08-10T11:00:00.000Z"), scheduledTime: null };
    assert.equal(
        approvalDeadline(immediate).toISOString(),
        new Date("2026-08-10T11:30:00.000Z").toISOString(),
        "an immediate ride must expire 30 minutes after it was booked"
    );

    const carpool = { requestedTime: new Date("2026-08-10T13:00:00.000Z") };
    assert.equal(
        approvalDeadline(carpool).toISOString(),
        new Date("2026-08-10T13:30:00.000Z").toISOString(),
        "a carpool request must expire 30 minutes after the time it asked for"
    );
});

test("the ride sweep only claims bookings whose own deadline has passed", () => {
    const filter = expiredRideFilter(now);
    const cutoff = new Date(now.getTime() - 30 * MINUTE);

    assert.equal(filter.status, "searching", "an accepted ride is never swept");
    assert.deepEqual(filter.$or, [
        { scheduledTime: { $ne: null, $lt: cutoff } },
        { scheduledTime: null, createdAt: { $lt: cutoff } }
    ]);
});

test("the carpool sweep only claims requests still waiting in the queue", () => {
    const filter = expiredCarpoolRequestFilter(now);

    assert.equal(filter.status, "pending", "an approved carpool seat belongs to a ride and is not swept");
    assert.deepEqual(filter.requestedTime, { $lt: new Date(now.getTime() - 30 * MINUTE) });
});

test("a ride nobody approved in time is cancelled and the passenger is told why", async () => {
    const ride = makeStaleRide({ scheduledTime: new Date("2026-08-10T11:00:00.000Z") });
    let queriedFilter;
    let notice;

    patchMethod(patches, Ride, "find", async (filter) => {
        queriedFilter = filter;
        return [ride];
    });
    patchMethod(patches, PassengerProfile, "findById", async () => ({ _id: "passenger-1", userId: "user-1" }));
    patchMethod(patches, Notification, "create", async (doc) => {
        notice = doc;
        return { _id: "notification-1", ...doc };
    });

    const cancelled = await autoCancelStaleRides(now);

    assert.equal(cancelled.length, 1);
    assert.equal(queriedFilter.status, "searching");
    assert.equal(ride.status, "cancelled");
    assert.equal(ride.cancelledBy, "system");
    assert.ok(ride.cancelledAt instanceof Date);
    assert.match(ride.cancellationReason, /30/);
    assert.equal(ride.saveCount, 1);
    assert.equal(notice.userId, "user-1");
    assert.equal(notice.type, "ride_cancelled");
    assert.equal(notice.rideId, "ride-1");
});

test("cancelling a carpool ride for timeout releases the riders who had joined it", async () => {
    const ride = makeStaleRide({ rideType: "carpool" });
    let seatRelease;

    patchMethod(patches, Ride, "find", async () => [ride]);
    patchMethod(patches, CarpoolRequest, "updateMany", async (filter, update) => {
        seatRelease = { filter, update };
        return { modifiedCount: 2 };
    });
    patchMethod(patches, PassengerProfile, "findById", async () => ({ _id: "passenger-1", userId: "user-1" }));
    patchMethod(patches, Notification, "create", async (doc) => ({ _id: "notification-1", ...doc }));

    await autoCancelStaleRides(now);

    assert.equal(ride.status, "cancelled");
    assert.deepEqual(seatRelease.filter, {
        rideId: "ride-1",
        status: { $in: ["matched", "confirmed"] }
    });
    assert.deepEqual(seatRelease.update, { status: "cancelled" });
});

test("a ride whose passenger profile is gone is still cancelled", async () => {
    const ride = makeStaleRide();

    patchMethod(patches, Ride, "find", async () => [ride]);
    patchMethod(patches, PassengerProfile, "findById", async () => null);
    patchMethod(patches, Notification, "create", async () => {
        throw new Error("there is nobody to notify");
    });

    await autoCancelStaleRides(now);

    assert.equal(ride.status, "cancelled", "a missing passenger must not leave the ride searching forever");
});

test("a carpool request nobody approved in time is cancelled and the passenger is told why", async () => {
    let queriedFilter;
    let claim;
    let notice;

    patchMethod(patches, CarpoolRequest, "find", async (filter) => {
        queriedFilter = filter;
        return [{ _id: "request-1", passengerId: "passenger-1", status: "pending" }];
    });
    patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async (filter, update) => {
        claim = { filter, update };
        return { _id: "request-1", passengerId: "passenger-1", ...update };
    });
    patchMethod(patches, PassengerProfile, "findById", async () => ({ _id: "passenger-1", userId: "user-1" }));
    patchMethod(patches, Notification, "create", async (doc) => {
        notice = doc;
        return { _id: "notification-1", ...doc };
    });

    const cancelled = await autoCancelStaleCarpoolRequests(now);

    assert.equal(cancelled.length, 1);
    assert.equal(queriedFilter.status, "pending");
    // Conditional so a driver approving in the same moment is not overwritten.
    assert.deepEqual(claim.filter, { _id: "request-1", status: "pending" });
    assert.deepEqual(claim.update, { status: "cancelled" });
    assert.equal(notice.userId, "user-1");
    assert.equal(notice.type, "ride_cancelled");
});

test("a carpool request approved during the sweep is left alone", async () => {
    let noticeCount = 0;

    patchMethod(patches, CarpoolRequest, "find", async () => [
        { _id: "request-1", passengerId: "passenger-1", status: "pending" }
    ]);
    // A driver approved it between the read and the write.
    patchMethod(patches, CarpoolRequest, "findOneAndUpdate", async () => null);
    patchMethod(patches, PassengerProfile, "findById", async () => ({ _id: "passenger-1", userId: "user-1" }));
    patchMethod(patches, Notification, "create", async () => {
        noticeCount += 1;
        return {};
    });

    await autoCancelStaleCarpoolRequests(now);

    assert.equal(noticeCount, 0, "a request a driver just took must not be reported as cancelled");
});
