const test = require("node:test");
const assert = require("node:assert/strict");

const net = require("node:net");

const {
    isSmtpConfigured,
    isBrevoConfigured,
    isEmailDeliveryConfigured,
    normalizeSmtpPassword,
    missingSmtpSettings,
    parseFromAddress,
    describePasswordResetDelivery,
    sendPasswordResetEmail
} = require("../utils/email");

const originalEnv = {
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    MAIL_FROM: process.env.MAIL_FROM,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_TIMEOUT_MS: process.env.SMTP_TIMEOUT_MS,
    BREVO_API_KEY: process.env.BREVO_API_KEY
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

// A host that blocks outbound SMTP leaves nodemailer waiting on its own
// defaults — two minutes to connect, thirty seconds for the greeting — and the
// password reset request hangs behind a spinner for all of it.
test("a mail server that never answers gives up instead of hanging the request", async () => {
    const silentServer = net.createServer(socket => socket.on("error", () => {}));
    await new Promise(resolve => silentServer.listen(0, "127.0.0.1", resolve));

    clearSmtpEnv();
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String(silentServer.address().port);
    process.env.SMTP_USER = "hailnow.app@gmail.com";
    process.env.SMTP_PASS = "app-password";
    process.env.MAIL_FROM = "HailNow <hailnow.app@gmail.com>";
    process.env.SMTP_TIMEOUT_MS = "250";

    const startedAt = Date.now();
    await assert.rejects(
        sendPasswordResetEmail({ to: "user@example.com", resetLink: "https://x/y", resetCode: "123456" }),
        error => /timeout|greeting/i.test(error.message)
    );

    const elapsed = Date.now() - startedAt;
    assert.ok(elapsed < 5000, `gave up after ${elapsed}ms, which means the configured timeout was ignored`);
    silentServer.close();
});

// Brevo goes out over HTTPS, so it works on hosts that block outbound SMTP.
test("a Brevo key and a verified sender are enough on their own, with no SMTP settings", () => {
    clearSmtpEnv();
    process.env.BREVO_API_KEY = "xkeysib-test";
    process.env.MAIL_FROM = "HailNow <noreply@hailnow.app>";

    assert.equal(isBrevoConfigured(), true);
    assert.equal(isSmtpConfigured(), false, "no SMTP settings are present");
    assert.equal(isEmailDeliveryConfigured(), true, "mail can still be delivered");
    assert.match(describePasswordResetDelivery(), /Brevo HTTPS API, from noreply@hailnow\.app/);
});

test("a Brevo key without a sender address is not usable, and says so", () => {
    clearSmtpEnv();
    process.env.BREVO_API_KEY = "xkeysib-test";

    assert.equal(isBrevoConfigured(), false, "Brevo refuses a sender it has not verified");
    assert.deepEqual(missingSmtpSettings(), [
        "MAIL_FROM (required because BREVO_API_KEY is set; it must be a sender Brevo has verified)"
    ]);
});

test("the sender address is split into the name and address Brevo expects", () => {
    assert.deepEqual(parseFromAddress("HailNow <noreply@hailnow.app>"), { name: "HailNow", email: "noreply@hailnow.app" });
    assert.deepEqual(parseFromAddress('"HailNow" <noreply@hailnow.app>'), { name: "HailNow", email: "noreply@hailnow.app" });
    assert.deepEqual(parseFromAddress("noreply@hailnow.app"), { name: "HailNow", email: "noreply@hailnow.app" });
});

test("SMTP config can be complete for a no-auth relay", () => {
    clearSmtpEnv();
    process.env.SMTP_HOST = "localhost";
    process.env.SMTP_PORT = "1025";
    process.env.MAIL_FROM = "HailNow <no-reply@hailnow.local>";

    assert.equal(isSmtpConfigured(), true);
});
