const test = require("node:test");
const assert = require("node:assert/strict");

const { isSmtpConfigured, normalizeSmtpPassword, missingSmtpSettings } = require("../utils/email");

const originalEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    MAIL_FROM: process.env.MAIL_FROM,
    SMTP_FROM: process.env.SMTP_FROM
};

function restoreEnv() {
    for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
}

function clearSmtpEnv() {
    for (const key of Object.keys(originalEnv)) {
        delete process.env[key];
    }
}

test.afterEach(restoreEnv);

test("SMTP config is incomplete when auth username is missing a password", () => {
    clearSmtpEnv();
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "hailnow.app@gmail.com";
    process.env.MAIL_FROM = "HailNow <hailnow.app@gmail.com>";

    assert.equal(isSmtpConfigured(), false);
});

test("SMTP config is complete when host, port, sender, username, and password are set", () => {
    clearSmtpEnv();
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "hailnow.app@gmail.com";
    process.env.SMTP_PASS = "app-password";
    process.env.MAIL_FROM = "HailNow <hailnow.app@gmail.com>";

    assert.equal(isSmtpConfigured(), true);
});

test("a Gmail app password pasted with the spaces Google shows still authenticates", () => {
    assert.equal(normalizeSmtpPassword("abcd efgh ijkl mnop"), "abcdefghijklmnop");
    assert.equal(normalizeSmtpPassword("  abcd efgh ijkl mnop  "), "abcdefghijklmnop");
    assert.equal(normalizeSmtpPassword("abcdefghijklmnop"), "abcdefghijklmnop");
});

test("a password that is not an app password keeps its spaces", () => {
    assert.equal(normalizeSmtpPassword("correct horse battery staple"), "correct horse battery staple");
    assert.equal(normalizeSmtpPassword("  trailing-newline-only  "), "trailing-newline-only");
});

test("missing SMTP settings are named so an operator knows what to set", () => {
    clearSmtpEnv();
    process.env.SMTP_HOST = "smtp.gmail.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_PASS = "app-password";

    assert.deepEqual(missingSmtpSettings(), ["SMTP_USER (required because SMTP_PASS is set)"]);
});

test("SMTP config can be complete for a no-auth relay", () => {
    clearSmtpEnv();
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "1025";
    process.env.MAIL_FROM = "HailNow <no-reply@hailnow.local>";

    assert.equal(isSmtpConfigured(), true);
});
