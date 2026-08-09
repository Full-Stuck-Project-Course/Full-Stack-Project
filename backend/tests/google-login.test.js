const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");

const User = require("../db/models/User");
const PassengerProfile = require("../db/models/PassengerProfile");
const DriverProfile = require("../db/models/DriverProfile");
const { completeProfile, forgotPassword, googleLogin, login } = require("../controllers/userController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];
const originalEnv = {
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    VITE_GOOGLE_CLIENT_ID: process.env.VITE_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_ID_FILE_FALLBACK: process.env.GOOGLE_CLIENT_ID_FILE_FALLBACK,
    RETURN_RESET_TOKEN: process.env.RETURN_RESET_TOKEN,
    JWT_SECRET: process.env.JWT_SECRET
};

function readProductionGoogleClientId() {
    const envPath = path.join(__dirname, "..", "..", "frontend", ".env.production");
    const match = fs.readFileSync(envPath, "utf8").match(/^VITE_GOOGLE_CLIENT_ID\s*=\s*(.+)$/m);
    return match?.[1]?.trim() || "";
}

function audienceIncludes(audience, clientId) {
    return Array.isArray(audience)
        ? audience.includes(clientId)
        : audience === clientId;
}

test.afterEach(() => {
    restoreMethods(patches);
    if (originalEnv.GOOGLE_CLIENT_ID === undefined) delete process.env.GOOGLE_CLIENT_ID;
    else process.env.GOOGLE_CLIENT_ID = originalEnv.GOOGLE_CLIENT_ID;
    if (originalEnv.VITE_GOOGLE_CLIENT_ID === undefined) delete process.env.VITE_GOOGLE_CLIENT_ID;
    else process.env.VITE_GOOGLE_CLIENT_ID = originalEnv.VITE_GOOGLE_CLIENT_ID;
    if (originalEnv.GOOGLE_CLIENT_ID_FILE_FALLBACK === undefined) delete process.env.GOOGLE_CLIENT_ID_FILE_FALLBACK;
    else process.env.GOOGLE_CLIENT_ID_FILE_FALLBACK = originalEnv.GOOGLE_CLIENT_ID_FILE_FALLBACK;
    if (originalEnv.RETURN_RESET_TOKEN === undefined) delete process.env.RETURN_RESET_TOKEN;
    else process.env.RETURN_RESET_TOKEN = originalEnv.RETURN_RESET_TOKEN;
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
        idPhotoPath: "/uploads/ids/id.jpg",
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
    assert.equal(res.body.needsProfileCompletion, false);
    assert.ok(res.body.token);
});

test("google login ignores placeholder backend client ids and falls back to the frontend client id", async () => {
    process.env.GOOGLE_CLIENT_ID = "your_google_client_id.apps.googleusercontent.com";
    process.env.VITE_GOOGLE_CLIENT_ID = "frontend-client.apps.googleusercontent.com";
    process.env.JWT_SECRET = "a-strong-test-secret-with-more-than-32-characters";

    const user = {
        _id: "64f000000000000000000011",
        fullName: "Fallback User",
        email: "fallback@example.com",
        phone: "0502223333",
        role: "passenger",
        preferredLanguage: "he",
        profileImage: null,
        idPhotoPath: "/uploads/ids/id.jpg",
        referralCode: "FALLBACK",
        loyaltyPoints: 0,
        isActive: true,
        async save() {
            return this;
        }
    };

    patchMethod(patches, OAuth2Client.prototype, "verifyIdToken", async (options) => {
        assert.equal(options.audience, "frontend-client.apps.googleusercontent.com");
        return {
            getPayload() {
                return {
                    email: "fallback@example.com",
                    name: "Fallback User",
                    email_verified: true
                };
            }
        };
    });
    patchMethod(patches, User, "findOne", async () => user);
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-fallback" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await googleLogin({ body: { credential: "google-id-token" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.email, "fallback@example.com");
});

test("google login can verify against the public frontend production client id", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_ID_FILE_FALLBACK;
    process.env.JWT_SECRET = "a-strong-test-secret-with-more-than-32-characters";
    const productionGoogleClientId = readProductionGoogleClientId();
    assert.match(productionGoogleClientId, /^[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/);

    const user = {
        _id: "64f000000000000000000021",
        fullName: "Production Fallback User",
        email: "production-fallback@example.com",
        phone: "0504445555",
        role: "passenger",
        preferredLanguage: "he",
        profileImage: null,
        idPhotoPath: "/uploads/ids/id.jpg",
        referralCode: "PRODFALL",
        loyaltyPoints: 0,
        isActive: true,
        async save() {
            return this;
        }
    };

    patchMethod(patches, OAuth2Client.prototype, "verifyIdToken", async (options) => {
        assert.ok(audienceIncludes(options.audience, productionGoogleClientId));
        return {
            getPayload() {
                return {
                    email: "production-fallback@example.com",
                    name: "Production Fallback User",
                    email_verified: true
                };
            }
        };
    });
    patchMethod(patches, User, "findOne", async () => user);
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-production-fallback" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await googleLogin({ body: { credential: "google-id-token" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.email, "production-fallback@example.com");
});

test("first-time google login creates a temporary phone and requires profile completion", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-a.apps.googleusercontent.com";
    process.env.JWT_SECRET = "a-strong-test-secret-with-more-than-32-characters";

    let createdUser;
    patchMethod(patches, OAuth2Client.prototype, "verifyIdToken", async () => ({
        getPayload() {
            return {
                email: "new@example.com",
                name: "New Google User",
                picture: "https://example.com/avatar.png",
                email_verified: true
            };
        }
    }));
    patchMethod(patches, User, "findOne", async () => null);
    patchMethod(patches, User, "create", async (payload) => {
        createdUser = {
            _id: "64f000000000000000000002",
            isActive: true,
            referralCode: "NEW12345",
            loyaltyPoints: 0,
            saveCount: 0,
            async save() {
                this.saveCount += 1;
                return this;
            },
            ...payload
        };
        return createdUser;
    });
    patchMethod(patches, PassengerProfile, "create", async () => ({ _id: "passenger-2" }));
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-2" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await googleLogin({ body: { credential: "google-id-token" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(createdUser.email, "new@example.com");
    assert.match(createdUser.phone, /^google-/);
    assert.equal(createdUser.authProvider, "google");
    assert.equal(res.body.needsProfileCompletion, true);
});

test("first-time google login persists an email that can receive password reset instructions", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-a.apps.googleusercontent.com";
    process.env.JWT_SECRET = "a-strong-test-secret-with-more-than-32-characters";
    process.env.RETURN_RESET_TOKEN = "true";

    let createdUser = null;
    patchMethod(patches, OAuth2Client.prototype, "verifyIdToken", async () => ({
        getPayload() {
            return {
                email: "ResetMe@Example.com",
                name: "Reset Me",
                email_verified: true
            };
        }
    }));
    patchMethod(patches, User, "findOne", async (filter) => {
        assert.equal(filter.email, "resetme@example.com");
        return createdUser;
    });
    patchMethod(patches, User, "create", async (payload) => {
        createdUser = {
            _id: "64f000000000000000000012",
            isActive: true,
            referralCode: "RESET123",
            loyaltyPoints: 0,
            saveCount: 0,
            async save() {
                this.saveCount += 1;
                return this;
            },
            ...payload
        };
        return createdUser;
    });
    patchMethod(patches, PassengerProfile, "create", async () => ({ _id: "passenger-reset" }));
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-reset" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const loginRes = makeRes();
    await googleLogin({ body: { credential: "google-id-token" } }, loginRes);

    assert.equal(loginRes.statusCode, 200);
    assert.equal(createdUser.email, "resetme@example.com");

    const resetRes = makeRes();
    await forgotPassword({ body: { email: "ResetMe@Example.com" } }, resetRes);

    assert.equal(resetRes.statusCode, 200);
    assert.equal(resetRes.body.email, "resetme@example.com");
    assert.match(resetRes.body.resetToken, /^[a-f0-9]{64}$/);
    assert.match(resetRes.body.resetCode, /^\d{6}$/);
    assert.notEqual(createdUser.resetPasswordToken, null);
    assert.notEqual(createdUser.resetPasswordCodeHash, null);
    assert.ok(createdUser.resetPasswordExpires instanceof Date);
});

test("email login tells Google-created users to reset a password first", async () => {
    const user = {
        _id: "64f000000000000000000031",
        email: "google-first@example.com",
        passwordHash: await bcrypt.hash("generated-password-user-never-saw", 10),
        authProvider: "google",
        isActive: true
    };

    patchMethod(patches, User, "findOne", async (filter) => {
        assert.equal(filter.email, "google-first@example.com");
        return user;
    });

    const res = makeRes();
    await login({
        body: {
            email: "Google-First@Example.com",
            password: "Password1"
        }
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, "GOOGLE_PASSWORD_RESET_REQUIRED");
    assert.match(res.body.error, /Google/);
    assert.match(res.body.error, /לאפס סיסמה/);
});

test("Google users can use email login after setting a password", async () => {
    process.env.JWT_SECRET = "a-strong-test-secret-with-more-than-32-characters";

    const user = {
        _id: "64f000000000000000000032",
        fullName: "Google Reset User",
        email: "google-reset@example.com",
        phone: "0505556677",
        role: "passenger",
        preferredLanguage: "he",
        profileImage: null,
        idPhotoPath: "/uploads/ids/google-reset.jpg",
        referralCode: "GRESET1",
        loyaltyPoints: 0,
        passwordHash: await bcrypt.hash("Password1", 10),
        authProvider: "google",
        isActive: true,
        async save() {
            return this;
        }
    };

    patchMethod(patches, User, "findOne", async (filter) => {
        assert.equal(filter.email, "google-reset@example.com");
        return user;
    });
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-google-reset" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await login({
        body: {
            email: "Google-Reset@Example.com",
            password: "Password1"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.email, "google-reset@example.com");
    assert.equal(res.body.passengerId, "passenger-google-reset");
    assert.ok(res.body.token);
});

test("google login rejects accounts whose email was not verified by Google", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-a.apps.googleusercontent.com";

    let findOneCalled = false;
    patchMethod(patches, OAuth2Client.prototype, "verifyIdToken", async () => ({
        getPayload() {
            return {
                email: "unverified@example.com",
                name: "Unverified User",
                email_verified: false
            };
        }
    }));
    patchMethod(patches, User, "findOne", async () => {
        findOneCalled = true;
        return null;
    });

    const res = makeRes();
    await googleLogin({ body: { credential: "google-id-token" } }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /email must be verified/i);
    assert.equal(findOneCalled, false);
});

test("google login returns a clear configuration error before calling Google", async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.VITE_GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID_FILE_FALLBACK = "false";

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

test("google login reports certificate network failures as a service outage", async () => {
    process.env.GOOGLE_CLIENT_ID = "client-a.apps.googleusercontent.com";

    patchMethod(patches, OAuth2Client.prototype, "verifyIdToken", async () => {
        throw new Error("Failed to retrieve verification certificates: request to https://www.googleapis.com/oauth2/v1/certs failed, reason:");
    });

    const res = makeRes();
    await googleLogin({ body: { credential: "google-id-token" } }, res);

    assert.equal(res.statusCode, 503);
    assert.match(res.body.error, /server cannot reach Google/i);
});

test("google users can complete the required profile details", async () => {
    const user = {
        _id: "64f000000000000000000003",
        fullName: "Google Name",
        email: "google@example.com",
        phone: "google-123",
        role: "passenger",
        preferredLanguage: "he",
        profileImage: null,
        authProvider: "google",
        idPhotoPath: "/uploads/ids/id.jpg",
        idVerificationStatus: "approved",
        referralCode: "COMPLETE1",
        loyaltyPoints: 0,
        isActive: true,
        async save() {
            return this;
        }
    };

    patchMethod(patches, User, "findById", async (id) => {
        assert.equal(id, user._id);
        return user;
    });
    patchMethod(patches, User, "findOne", async (filter) => {
        assert.equal(filter.phone, "0501234567");
        assert.deepEqual(filter._id, { $ne: user._id });
        return null;
    });
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-3" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await completeProfile({
        user: { userId: user._id, role: "passenger" },
        params: { id: user._id },
        body: {
            fullName: "Completed User",
            phone: "0501234567",
            role: "both",
            preferredLanguage: "en"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(user.fullName, "Completed User");
    assert.equal(user.phone, "0501234567");
    assert.equal(user.role, "both");
    assert.equal(user.preferredLanguage, "en");
    assert.equal(res.body.needsProfileCompletion, false);
});

test("google users still need profile completion until an ID photo exists", async () => {
    const user = {
        _id: "64f000000000000000000005",
        fullName: "Google Name",
        email: "google-no-id@example.com",
        phone: "google-789",
        role: "passenger",
        preferredLanguage: "he",
        authProvider: "google",
        idPhotoPath: null,
        referralCode: "NOID1234",
        loyaltyPoints: 0,
        isActive: true,
        async save() {
            return this;
        }
    };

    patchMethod(patches, User, "findById", async () => user);
    patchMethod(patches, User, "findOne", async () => null);
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-5" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await completeProfile({
        user: { userId: user._id, role: "passenger" },
        params: { id: user._id },
        body: {
            fullName: "Completed User",
            phone: "0501112223",
            role: "passenger",
            preferredLanguage: "he"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.needsProfileCompletion, true);
});

test("google users with an existing real phone can complete details before uploading an ID photo", async () => {
    const user = {
        _id: "64f000000000000000000006",
        fullName: "Existing Google Name",
        email: "existing-google@example.com",
        phone: "0509998888",
        role: "passenger",
        preferredLanguage: "he",
        authProvider: "google",
        idPhotoPath: null,
        referralCode: "REALPHONE",
        loyaltyPoints: 0,
        isActive: true,
        async save() {
            return this;
        }
    };

    patchMethod(patches, User, "findById", async () => user);
    patchMethod(patches, User, "findOne", async (filter) => {
        assert.equal(filter.phone, "0509998888");
        assert.deepEqual(filter._id, { $ne: user._id });
        return null;
    });
    patchMethod(patches, PassengerProfile, "findOneAndUpdate", async () => ({ _id: "passenger-real-phone" }));
    patchMethod(patches, DriverProfile, "findOne", async () => null);

    const res = makeRes();
    await completeProfile({
        user: { userId: user._id, role: "passenger" },
        params: { id: user._id },
        body: {
            fullName: "Existing Google Name",
            phone: "0509998888",
            role: "passenger",
            preferredLanguage: "he"
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.needsProfileCompletion, true);
    assert.equal(user.phone, "0509998888");
});

test("profile completion rejects a phone that is already in use", async () => {
    const user = {
        _id: "64f000000000000000000004",
        phone: "google-456"
    };

    patchMethod(patches, User, "findById", async () => user);
    patchMethod(patches, User, "findOne", async () => ({ _id: "other-user" }));

    const res = makeRes();
    await completeProfile({
        user: { userId: user._id, role: "passenger" },
        params: { id: user._id },
        body: {
            fullName: "Completed User",
            phone: "0507654321",
            role: "passenger",
            preferredLanguage: "he"
        }
    }, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: "Registration details already in use" });
});
