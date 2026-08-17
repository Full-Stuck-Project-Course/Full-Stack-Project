const test = require("node:test");
const assert = require("node:assert/strict");

const { isSmtpConfigured } = require("../utils/email");

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

test("SMTP config can be complete for a no-auth relay", () => {
    clearSmtpEnv();
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "1025";
    process.env.MAIL_FROM = "HailNow <no-reply@hailnow.local>";

    assert.equal(isSmtpConfigured(), true);
});
