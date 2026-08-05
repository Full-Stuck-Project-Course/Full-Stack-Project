const test = require("node:test");
const assert = require("node:assert/strict");

const { configuredOrigins, isAllowedOrigin } = require("../utils/corsOrigins");

const originalEnv = {
    CORS_ORIGINS: process.env.CORS_ORIGINS,
    NODE_ENV: process.env.NODE_ENV
};

test.afterEach(() => {
    if (originalEnv.CORS_ORIGINS === undefined) {
        delete process.env.CORS_ORIGINS;
    } else {
        process.env.CORS_ORIGINS = originalEnv.CORS_ORIGINS;
    }

    if (originalEnv.NODE_ENV === undefined) {
        delete process.env.NODE_ENV;
    } else {
        process.env.NODE_ENV = originalEnv.NODE_ENV;
    }
});

test("CORS origins allow configured origins and reject unknown browser origins", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://app.hailnow.test, https://admin.hailnow.test";

    assert.deepEqual(configuredOrigins(), [
        "https://app.hailnow.test",
        "https://admin.hailnow.test"
    ]);
    assert.equal(isAllowedOrigin("https://app.hailnow.test"), true);
    assert.equal(isAllowedOrigin("https://evil.example"), false);
});

test("CORS intentionally allows requests without an Origin header", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://app.hailnow.test";

    assert.equal(isAllowedOrigin(undefined), true);
    assert.equal(isAllowedOrigin(null), true);
    assert.equal(isAllowedOrigin(""), true);
});

test("CORS allows localhost origins only outside production", () => {
    process.env.CORS_ORIGINS = "https://app.hailnow.test";

    process.env.NODE_ENV = "development";
    assert.equal(isAllowedOrigin("http://localhost:5173"), true);

    process.env.NODE_ENV = "production";
    assert.equal(isAllowedOrigin("http://localhost:5173"), false);
});
