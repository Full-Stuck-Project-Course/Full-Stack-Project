const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const User = require("../db/models/User");
const { adminOnly, auth } = require("../middleware/auth");
const {
    MIN_JWT_SECRET_LENGTH,
    signAuthToken,
    validateJwtSecret,
    verifyAuthToken
} = require("../utils/jwtConfig");
const {
    makeRes,
    patchMethod,
    queryResult,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];
const originalJwtSecret = process.env.JWT_SECRET;
const STRONG_SECRET = "test-jwt-secret-with-more-than-32-chars";

test.afterEach(() => {
    restoreMethods(patches);
    if (originalJwtSecret === undefined) {
        delete process.env.JWT_SECRET;
    } else {
        process.env.JWT_SECRET = originalJwtSecret;
    }
});

test("JWT startup validation rejects missing, short, and known insecure secrets", () => {
    assert.throws(() => validateJwtSecret(""), /required/i);
    assert.throws(() => validateJwtSecret("short-secret"), new RegExp(`${MIN_JWT_SECRET_LENGTH}`));
    assert.throws(() => validateJwtSecret("development_jwt_secret_do_not_use"), /default|known insecure/i);
    assert.throws(() => validateJwtSecret("local_dev_jwt_secret_change_me_before_production"), /placeholder|known insecure/i);
    assert.throws(() => validateJwtSecret("your_super_secret_key_change_this"), /placeholder|known insecure/i);
    assert.equal(validateJwtSecret(STRONG_SECRET), STRONG_SECRET);
});

test("auth tokens contain only the user id, not the authorization role", () => {
    process.env.JWT_SECRET = STRONG_SECRET;

    const token = signAuthToken({ _id: "user-1", role: "admin" });
    const decoded = verifyAuthToken(token);

    assert.equal(decoded.userId, "user-1");
    assert.equal(decoded.role, undefined);
});

test("admin access is based on the database role, not a forged token role", async () => {
    process.env.JWT_SECRET = STRONG_SECRET;
    const forgedAdminToken = jwt.sign(
        { userId: "user-1", role: "admin" },
        STRONG_SECRET,
        { expiresIn: "7d" }
    );

    patchMethod(patches, User, "findById", (id) => {
        assert.equal(id, "user-1");
        return queryResult({ _id: "user-1", role: "passenger", isActive: true });
    });

    const req = {
        headers: { authorization: `Bearer ${forgedAdminToken}` }
    };
    const authRes = makeRes();
    let nextCalled = false;
    await auth(req, authRes, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(req.user, { userId: "user-1", role: "passenger", isActive: true });

    const adminRes = makeRes();
    let adminNextCalled = false;
    adminOnly(req, adminRes, () => {
        adminNextCalled = true;
    });

    assert.equal(adminNextCalled, false);
    assert.equal(adminRes.statusCode, 403);
});

test("disabled users cannot authenticate with an otherwise valid token", async () => {
    process.env.JWT_SECRET = STRONG_SECRET;
    const token = signAuthToken({ _id: "disabled-user" });

    patchMethod(patches, User, "findById", () => (
        queryResult({ _id: "disabled-user", role: "admin", isActive: false })
    ));

    const res = makeRes();
    let nextCalled = false;
    await auth({
        headers: { authorization: `Bearer ${token}` }
    }, res, () => {
        nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /disabled/i);
});
