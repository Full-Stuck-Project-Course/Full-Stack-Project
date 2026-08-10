const test = require("node:test");
const assert = require("node:assert/strict");

const PassengerProfile = require("../db/models/PassengerProfile");
const { updatePassenger } = require("../controllers/passengerController");
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

test("passenger profile stores only masked default payment method details", async () => {
    let capturedUpdate;

    patchMethod(patches, PassengerProfile, "findOne", async ({ userId }) => (
        userId === "user-1" ? { _id: "passenger-1" } : null
    ));
    patchMethod(patches, PassengerProfile, "findByIdAndUpdate", (id, update, options) => {
        capturedUpdate = { id, update, options };
        return queryResult({ _id: id, ...update });
    });

    const res = makeRes();
    await updatePassenger({
        user: { userId: "user-1", role: "passenger" },
        params: { id: "passenger-1" },
        body: {
            defaultPaymentMethod: {
                cardholderName: "Test Passenger",
                cardNumber: "4111 1111 1111 1111",
                expiry: "2099-12",
                cvv: "123"
            }
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(capturedUpdate.id, "passenger-1");
    assert.equal(capturedUpdate.update.defaultPaymentMethod.cardholderName, "Test Passenger");
    assert.equal(capturedUpdate.update.defaultPaymentMethod.cardBrand, "visa");
    assert.equal(capturedUpdate.update.defaultPaymentMethod.cardLast4, "1111");
    assert.equal(capturedUpdate.update.defaultPaymentMethod.expiry, "2099-12");
    assert.ok(capturedUpdate.update.defaultPaymentMethod.updatedAt instanceof Date);
    assert.equal(Object.hasOwn(capturedUpdate.update.defaultPaymentMethod, "cardNumber"), false);
    assert.equal(Object.hasOwn(capturedUpdate.update.defaultPaymentMethod, "cvv"), false);
    assert.equal(capturedUpdate.options.runValidators, true);
});

test("passenger profile can remove the default payment method", async () => {
    let capturedUpdate;

    patchMethod(patches, PassengerProfile, "findOne", async () => ({ _id: "passenger-1" }));
    patchMethod(patches, PassengerProfile, "findByIdAndUpdate", (id, update, options) => {
        capturedUpdate = { id, update, options };
        return queryResult({ _id: id, ...update });
    });

    const res = makeRes();
    await updatePassenger({
        user: { userId: "user-1", role: "passenger" },
        params: { id: "passenger-1" },
        body: { defaultPaymentMethod: null }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(capturedUpdate.update, { defaultPaymentMethod: null });
});
