const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const User = require("../db/models/User");
const { resetPassword } = require("../controllers/userController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

function hashResetSecret(value) {
    return crypto.createHash("sha256").update(String(value)).digest("hex");
}

test.afterEach(() => {
    restoreMethods(patches);
});

test("valid reset token changes the password hash and clears one-time reset fields", async () => {
    const token = "plain-reset-token";
    const user = {
        _id: "user-1",
        passwordHash: "old-hash",
        resetPasswordToken: hashResetSecret(token),
        resetPasswordCodeHash: hashResetSecret("123456"),
        resetPasswordExpires: new Date(Date.now() + 60_000),
        resetPasswordCodeAttempts: 2,
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        }
    };

    patchMethod(patches, User, "findOne", async (filter) => {
        assert.equal(filter.resetPasswordToken, hashResetSecret(token));
        assert.ok(filter.resetPasswordExpires.$gt instanceof Date);
        return user;
    });

    const res = makeRes();
    await resetPassword({
        body: { token, newPassword: "NewPassword1" }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.match(user.passwordHash, /^\$2[aby]\$/);
    assert.equal(user.resetPasswordToken, null);
    assert.equal(user.resetPasswordCodeHash, null);
    assert.equal(user.resetPasswordExpires, null);
    assert.equal(user.resetPasswordCodeAttempts, 0);
    assert.equal(user.saveCount, 1);
});

test("invalid reset code increments attempts and clears the request on the fifth failure", async () => {
    const user = {
        _id: "user-1",
        email: "user@example.com",
        passwordHash: "old-hash",
        resetPasswordToken: "token-hash",
        resetPasswordCodeHash: hashResetSecret("123456"),
        resetPasswordExpires: new Date(Date.now() + 60_000),
        resetPasswordCodeAttempts: 4,
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        }
    };

    patchMethod(patches, User, "findOne", async (filter) => {
        assert.equal(filter.email, "user@example.com");
        assert.deepEqual(filter.resetPasswordCodeHash, { $ne: null });
        assert.ok(filter.resetPasswordExpires.$gt instanceof Date);
        return user;
    });

    const res = makeRes();
    await resetPassword({
        body: {
            email: "USER@example.com",
            code: "000000",
            newPassword: "NewPassword1"
        }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Too many invalid/i);
    assert.equal(user.passwordHash, "old-hash");
    assert.equal(user.resetPasswordToken, null);
    assert.equal(user.resetPasswordCodeHash, null);
    assert.equal(user.resetPasswordExpires, null);
    assert.equal(user.resetPasswordCodeAttempts, 0);
    assert.equal(user.saveCount, 1);
});

test("weak reset passwords are rejected before user lookup", async () => {
    let lookupCalled = false;
    patchMethod(patches, User, "findOne", async () => {
        lookupCalled = true;
        return null;
    });

    const res = makeRes();
    await resetPassword({
        body: {
            token: "token",
            newPassword: "short"
        }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.equal(lookupCalled, false);
    assert.match(res.body.error, /at least 8/i);
});
