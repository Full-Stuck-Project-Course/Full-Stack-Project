const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const Notification = require("../db/models/Notification");
const PassengerProfile = require("../db/models/PassengerProfile");
const Payment = require("../db/models/payment");
const Ride = require("../db/models/Ride");
const {
    createPayment,
    getAllPayments,
    refundPayment,
    simulatePayment,
    updatePaymentStatus
} = require("../controllers/paymentController");
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

test("non-admin users cannot create or mutate payments", async () => {
    let rideLookupCount = 0;
    let paymentLookupCount = 0;

    patchMethod(patches, Ride, "findById", async () => {
        rideLookupCount += 1;
        return null;
    });
    patchMethod(patches, Payment, "findById", async () => {
        paymentLookupCount += 1;
        return { _id: "payment-1", amount: 20 };
    });
    patchMethod(patches, Payment, "findByIdAndUpdate", async () => {
        throw new Error("non-admin users must not mutate payments");
    });

    const createRes = makeRes();
    await createPayment({
        user: { userId: "passenger-user", role: "passenger" },
        body: { rideId: "ride-1", amount: 20 }
    }, createRes);

    assert.equal(createRes.statusCode, 403);
    assert.equal(rideLookupCount, 0);

    const statusRes = makeRes();
    await updatePaymentStatus({
        user: { userId: "driver-user", role: "driver" },
        params: { id: "payment-1" },
        body: { paymentStatus: "paid" }
    }, statusRes);

    assert.equal(statusRes.statusCode, 403);
    assert.equal(paymentLookupCount, 1);

    const refundRes = makeRes();
    await refundPayment({
        user: { userId: "passenger-user", role: "passenger" },
        params: { id: "payment-1" },
        body: { refundAmount: 10 }
    }, refundRes);

    assert.equal(refundRes.statusCode, 403);
    assert.equal(paymentLookupCount, 2);
});

test("payment listing prevents forged passenger filters", async () => {
    let paymentFindCalled = false;

    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => {
        return userId === "passenger-user" ? { _id: "own-passenger" } : null;
    });
    patchMethod(patches, DriverProfile, "findOne", async () => null);
    patchMethod(patches, Payment, "find", () => {
        paymentFindCalled = true;
        return queryResult([]);
    });

    const res = makeRes();
    await getAllPayments({
        user: { userId: "passenger-user", role: "passenger" },
        query: { passengerId: "other-passenger" },
        body: {}
    }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(paymentFindCalled, false);
});

test("admins create payments from the assigned ride and cannot refund more than the payment amount", async () => {
    const ride = {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1"
    };
    const existingPayment = {
        _id: "payment-1",
        amount: 50
    };
    let createdPaymentPayload;
    let refundUpdate;

    patchMethod(patches, Ride, "findById", async (id) => id === ride._id ? ride : null);
    patchMethod(patches, Payment, "create", async (payload) => {
        createdPaymentPayload = payload;
        return { _id: "payment-1", ...payload };
    });
    patchMethod(patches, Payment, "findById", async () => existingPayment);
    patchMethod(patches, Payment, "findByIdAndUpdate", async (id, update) => {
        refundUpdate = { id, update };
        return { ...existingPayment, ...update };
    });

    const createRes = makeRes();
    await createPayment({
        user: { userId: "admin-user", role: "admin" },
        body: {
            rideId: ride._id,
            amount: 50,
            currency: "ILS",
            paymentMethod: "credit_card",
            paymentStatus: "paid",
            transactionId: "txn-1"
        }
    }, createRes);

    assert.equal(createRes.statusCode, 201);
    assert.equal(createdPaymentPayload.passengerId, ride.passengerId);
    assert.equal(createdPaymentPayload.driverId, ride.driverId);

    const tooMuch = makeRes();
    await refundPayment({
        user: { userId: "admin-user", role: "admin" },
        params: { id: existingPayment._id },
        body: { refundAmount: 51, refundReason: "overcharge" }
    }, tooMuch);

    assert.equal(tooMuch.statusCode, 400);
    assert.match(tooMuch.body.error, /cannot exceed/i);

    const validRefund = makeRes();
    await refundPayment({
        user: { userId: "admin-user", role: "admin" },
        params: { id: existingPayment._id },
        body: { refundAmount: 20, refundReason: "partial refund" }
    }, validRefund);

    assert.equal(validRefund.statusCode, 200);
    assert.deepEqual(refundUpdate, {
        id: existingPayment._id,
        update: {
            paymentStatus: "refunded",
            refundAmount: 20,
            refundReason: "partial refund"
        }
    });
});

// The payment controller announces an approved payment; these stubs keep that
// side effect isolated from whatever the test under test is asserting.
function stubPaymentNotifications(captured = {}) {
    patchMethod(patches, PassengerProfile, "findById", () => ({
        select: async () => ({ userId: "passenger-user" })
    }));
    patchMethod(patches, DriverProfile, "findById", () => ({
        select: async () => ({ userId: "driver-user" })
    }));
    patchMethod(patches, Notification, "insertMany", async (docs) => {
        captured.notifications = docs;
        return docs.map((doc, index) => ({ _id: `notification-${index}`, ...doc }));
    });
    return captured;
}

test("ride passenger can approve a completed ride with simulated card details", async () => {
    const ride = {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        status: "completed",
        finalPrice: 72.5
    };
    let paymentUpsert;

    stubPaymentNotifications();
    patchMethod(patches, Ride, "findById", async (id) => id === ride._id ? ride : null);
    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => {
        return userId === "passenger-user" ? { _id: ride.passengerId } : null;
    });
    patchMethod(patches, Payment, "findOne", async () => null);
    patchMethod(patches, Payment, "findOneAndUpdate", async (filter, update, options) => {
        paymentUpsert = { filter, update, options };
        return { _id: "payment-1", ...update.$setOnInsert, ...update.$set };
    });

    const res = makeRes();
    await simulatePayment({
        user: { userId: "passenger-user", role: "passenger" },
        params: { rideId: ride._id },
        body: {
            cardholderName: "Test Passenger",
            cardNumber: "4111 1111 1111 1111",
            expiry: "2099-12",
            cvv: "123"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.payment.paymentStatus, "paid");
    assert.equal(paymentUpsert.filter.rideId, ride._id);
    assert.equal(paymentUpsert.update.$set.paymentMethod, "credit_card");
    assert.equal(paymentUpsert.update.$set.paymentProvider, "simulated");
    assert.equal(paymentUpsert.update.$set.cardLast4, "1111");
    assert.match(paymentUpsert.update.$set.transactionId, /^sim_ride-1_/);
    assert.ok(paymentUpsert.update.$set.paidAt instanceof Date);
    assert.equal(Object.hasOwn(paymentUpsert.update.$set, "cardNumber"), false);
    assert.equal(Object.hasOwn(paymentUpsert.update.$set, "cvv"), false);
});

test("approving a payment notifies the passenger and the driver", async () => {
    const ride = {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        status: "completed",
        finalPrice: 72.5
    };
    const captured = stubPaymentNotifications();
    const emitted = [];

    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: ride.passengerId }));
    patchMethod(patches, Payment, "findOne", async () => null);
    patchMethod(patches, Payment, "findOneAndUpdate", async (filter, update) => ({
        _id: "payment-1",
        ...update.$setOnInsert,
        ...update.$set
    }));

    const io = {
        to(room) {
            return {
                emit(event, payload) {
                    emitted.push({ room, event, payload });
                }
            };
        }
    };

    const res = makeRes();
    await simulatePayment({
        app: { get: (key) => key === "io" ? io : null },
        user: { userId: "passenger-user", role: "passenger" },
        params: { rideId: ride._id },
        body: {
            cardholderName: "Test Passenger",
            cardNumber: "4111 1111 1111 1111",
            expiry: "2099-12",
            cvv: "123"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(captured.notifications.length, 2);

    const [passengerNote, driverNote] = captured.notifications;
    assert.equal(passengerNote.userId, "passenger-user");
    assert.equal(passengerNote.type, "payment_received");
    assert.equal(passengerNote.rideId, ride._id);
    assert.match(passengerNote.body, /72\.5/);
    assert.match(passengerNote.body, /1111/);

    assert.equal(driverNote.userId, "driver-user");
    assert.equal(driverNote.type, "payment_received");

    assert.deepEqual(emitted.map(e => e.room), ["user:passenger-user", "user:driver-user"]);
    assert.deepEqual([...new Set(emitted.map(e => e.event))], ["payment-approved"]);
    assert.equal(emitted[0].payload.amount, 72.5);
});

test("a notification failure never turns an approved payment into an error", async () => {
    const ride = {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        status: "completed",
        finalPrice: 30
    };

    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: ride.passengerId }));
    patchMethod(patches, PassengerProfile, "findById", () => ({
        select: async () => { throw new Error("notification lookup exploded"); }
    }));
    patchMethod(patches, DriverProfile, "findById", () => ({
        select: async () => ({ userId: "driver-user" })
    }));
    patchMethod(patches, Notification, "insertMany", async () => {
        throw new Error("notifications are down");
    });
    patchMethod(patches, Payment, "findOne", async () => null);
    patchMethod(patches, Payment, "findOneAndUpdate", async (filter, update) => ({
        _id: "payment-1",
        ...update.$set
    }));

    const res = makeRes();
    await simulatePayment({
        user: { userId: "passenger-user", role: "passenger" },
        params: { rideId: ride._id },
        body: {
            cardholderName: "Test Passenger",
            cardNumber: "4111 1111 1111 1111",
            expiry: "2099-12",
            cvv: "123"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.payment.paymentStatus, "paid");
});

test("an already-approved payment is not announced a second time", async () => {
    const ride = {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        status: "completed",
        finalPrice: 30
    };
    let notificationsSent = false;

    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: ride.passengerId }));
    patchMethod(patches, Payment, "findOne", async () => ({
        _id: "payment-1",
        paymentStatus: "paid"
    }));
    patchMethod(patches, Notification, "insertMany", async () => {
        notificationsSent = true;
        return [];
    });

    const res = makeRes();
    await simulatePayment({
        user: { userId: "passenger-user", role: "passenger" },
        params: { rideId: ride._id },
        body: {
            cardholderName: "Test Passenger",
            cardNumber: "4111 1111 1111 1111",
            expiry: "2099-12",
            cvv: "123"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /already approved/i);
    assert.equal(notificationsSent, false);
});

test("simulated payment can only be approved by the ride passenger", async () => {
    const ride = {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        status: "completed",
        finalPrice: 40
    };
    let paymentMutated = false;

    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: "other-passenger" }));
    patchMethod(patches, Payment, "findOneAndUpdate", async () => {
        paymentMutated = true;
        return null;
    });

    const res = makeRes();
    await simulatePayment({
        user: { userId: "other-user", role: "passenger" },
        params: { rideId: ride._id },
        body: {
            cardholderName: "Other Passenger",
            cardNumber: "4111 1111 1111 1111",
            expiry: "2099-12",
            cvv: "123"
        }
    }, res);

    assert.equal(res.statusCode, 403);
    assert.equal(paymentMutated, false);
});

test("simulated payment cannot run before the ride is completed", async () => {
    const ride = {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        status: "in_progress",
        finalPrice: 40
    };
    let passengerLookupCount = 0;

    patchMethod(patches, Ride, "findById", async () => ride);
    patchMethod(patches, PassengerProfile, "findOne", async () => {
        passengerLookupCount += 1;
        return { _id: ride.passengerId };
    });

    const res = makeRes();
    await simulatePayment({
        user: { userId: "passenger-user", role: "passenger" },
        params: { rideId: ride._id },
        body: {
            cardholderName: "Test Passenger",
            cardNumber: "4111 1111 1111 1111",
            expiry: "2099-12",
            cvv: "123"
        }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(passengerLookupCount, 0);
});
