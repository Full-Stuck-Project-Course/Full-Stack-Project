const test = require("node:test");
const assert = require("node:assert/strict");
const { OAuth2Client } = require("google-auth-library");

const User = require("../db/models/User");
const PassengerProfile = require("../db/models/PassengerProfile");
const DriverProfile = require("../db/models/DriverProfile");
const { googleLogin } = require("../controllers/userController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];
const originalEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID,
    JWT_SECRET: process.env.JWT_SECRET
};

test.afterEach(() => {
    restoreMethods(patches);
    if (originalEnv.GOOGLE_CLIENT_ID === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    if (originalEnv.VITE_GOOGLE_CLIENT_ID === undefined) delete process.env.VITE_GOOGLE_CLIENT_ID;
    else process.env.VITE_GOOGLE_CLIENT_ID = originalEnv.VITE_GOOGLE_CLIENT_ID;
    if (originalEnv.JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalEnv.JWT_SECRET;
});

test("google login verifies the credential against configured Google client ids", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-a.apps.googleusercontent.com, client-b.apps.googleusercontent.com";
    process.env.JWT_SECRET = "a-strong-test-secret-with-more-than-32-characters";

    const user = {
        _id: "64f000000000000000000001",
        fullName: "Test User",
        email: "user@example.com",
        phone: "0501234567",
        role: "passenger",
        preferredLanguage: "he",
        profileImage: null,
        referralCode: "ABCD1234",
        loyaltyPoints: 0,
        isActive: true,
        async save() {
            return this;
        }
    };

    patchMethod(patches, OAuth2Client.prototype, "verifyIdToken", async (options) => {
        assert.equal(options.idToken, "google-id-token");
        assert.deepEqual(options.audience, [
            "client-a.apps.googleusercontent.com",
            "client-b.apps.googleusercontent.com"
        ]);
        return {
            getPayload() {
                return {
                    email: "USER@example.com",
                    name: "Test User",
                    email_verified: true
                };
            }
        };
    });
    patchMethod(patches, User, "findOne", async (filter) => {
        assert.equal(filter.email, "user@example.com");
        return user;
    });
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-1" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await googleLogin({ body: { credential: "google-id-token" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.email, "user@example.com");
    assert.equal(res.body.passengerId, "passenger-1");
    assert.ok(res.body.token);
});

test("google login returns a clear configuration error before calling Google", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.VITE_GOOGLE_CLIENT_ID;

    let verifyCalled = false;
    patchMethod(patches, OAuth2Client.prototype, "verifyIdToken", async () => {
        verifyCalled = true;
        throw new Error("should not call Google");
    });

    const res = makeRes();
    await googleLogin({ body: { credential: "google-id-token" } }, res);

    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /GOOGLE_CLIENT_ID/);
    assert.equal(verifyCalled, false);
});
