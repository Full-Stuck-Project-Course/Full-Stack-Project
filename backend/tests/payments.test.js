const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const PassengerProfile = require("../db/models/PassengerProfile");
const Payment = require("../db/models/payment");
const Ride = require("../db/models/Ride");
const {
    createPayment,
    getAllPayments,
    refundPayment,
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
