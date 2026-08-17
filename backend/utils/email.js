const nodemailer = require("nodemailer");
const axios = require("axios");

// Brevo delivers over HTTPS, which matters because most hosting tiers block
// outbound SMTP entirely — the connection to port 587 simply never completes.
// When BREVO_API_KEY is set it is preferred over SMTP.
const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const BREVO_ACCOUNT_URL = "https://api.brevo.com/v3/account";

function parseBoolean(value) {
    if (value === undefined) return undefined;
    return String(value).toLowerCase() === "true";
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Only what the operator actually set. Brevo refuses to send from an address
// nobody verified, so the built-in placeholder must not count as a sender.
function configuredFromAddress() {
    return process.env.MAIL_FROM || process.env.SMTP_FROM || "";
}

function getFromAddress() {
    return configuredFromAddress() || "HailNow <no-reply@hailnow.local>";
}

// "HailNow <a@b.com>" -> { name: "HailNow", email: "a@b.com" }, which is the
// shape Brevo wants. A bare address works too.
function parseFromAddress(value) {
    const withName = /^\s*"?(.*?)"?\s*<\s*([^>]+?)\s*>\s*$/.exec(String(value || ""));
    if (withName) return { name: withName[1].trim() || "HailNow", email: withName[2].trim() };
    return { name: "HailNow", email: String(value || "").trim() };
}

function isBrevoConfigured() {
    return Boolean(process.env.BREVO_API_KEY && configuredFromAddress());
}

function isSmtpAuthComplete() {
    const hasUser = Boolean(process.env.SMTP_USER);
    const hasPass = Boolean(process.env.SMTP_PASS);
    return hasUser === hasPass;
}

function isSmtpConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && getFromAddress() && isSmtpAuthComplete());
}

// Which settings stop mail going out. isSmtpConfigured() is a yes/no, which
// leaves an operator guessing at the one thing they missed — most often a
// password without the matching username, which silently disables SMTP.
function missingSmtpSettings() {
    if (process.env.BREVO_API_KEY && !configuredFromAddress()) {
        return ["MAIL_FROM (required because BREVO_API_KEY is set; it must be a sender Brevo has verified)"];
    }

    const missing = [];
    if (!process.env.SMTP_HOST) missing.push("SMTP_HOST");
    if (!process.env.SMTP_PORT) missing.push("SMTP_PORT");
    if (process.env.SMTP_PASS && !process.env.SMTP_USER) missing.push("SMTP_USER (required because SMTP_PASS is set)");
    if (process.env.SMTP_USER && !process.env.SMTP_PASS) missing.push("SMTP_PASS (required because SMTP_USER is set)");
    return missing;
}

// Any route that can actually deliver, not just SMTP.
function isEmailDeliveryConfigured() {
    return isBrevoConfigured() || isSmtpConfigured();
}

// Which route this instance will actually use. Reported by /api/health so a
// deployment can be checked from a browser.
function passwordResetDeliveryMode() {
    if (process.env.RESET_EMAIL_WEBHOOK_URL) return "webhook";
    if (isBrevoConfigured()) return "brevo";
    if (isSmtpConfigured()) return "smtp";
    return "disabled";
}

// One line for the startup log, so a misconfigured deployment is visible
// before a user ever asks for a reset link.
function describePasswordResetDelivery() {
    if (process.env.RESET_EMAIL_WEBHOOK_URL) return "Password reset delivery: webhook (RESET_EMAIL_WEBHOOK_URL)";
    if (isBrevoConfigured()) return `Password reset delivery: Brevo HTTPS API, from ${parseFromAddress(getFromAddress()).email}`;
    if (isSmtpConfigured()) return `Password reset delivery: SMTP via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`;

    const missing = missingSmtpSettings();
    return "Password reset delivery: DISABLED — " + (missing.length
        ? `missing ${missing.join(", ")}`
        : "set BREVO_API_KEY and MAIL_FROM, or SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS");
}

// Google shows an app password as four groups of four ("abcd efgh ijkl mnop"),
// and it gets pasted into .env exactly like that. The spaces are for reading
// only — Gmail rejects the password with them still in — so drop the whitespace
// when what is left is the sixteen letters Google actually issued. Any other
// password keeps its spaces, in case a provider allows them.
function normalizeSmtpPassword(value) {
    const raw = String(value ?? "");
    const stripped = raw.replace(/\s+/g, "");
    if (raw !== stripped && /^[a-z]{16}$/i.test(stripped)) return stripped;
    return raw.trim();
}

// Nodemailer waits 2 minutes to connect and 30 seconds for the greeting. A host
// that blocks outbound SMTP never completes the handshake at all, so the
// password reset request hangs for minutes behind a spinner instead of failing.
// Give up quickly: the caller turns a failure into a 503 the user can act on.
const DEFAULT_SMTP_TIMEOUT_MS = 10_000;

function smtpTimeoutMs() {
    const configured = Number(process.env.SMTP_TIMEOUT_MS);
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_SMTP_TIMEOUT_MS;
}

function createTransporter() {
    const port = Number(process.env.SMTP_PORT);
    const secure = parseBoolean(process.env.SMTP_SECURE);
    const auth = process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER.trim(), pass: normalizeSmtpPassword(process.env.SMTP_PASS) }
        : undefined;
    const timeout = smtpTimeoutMs();

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: secure ?? port === 465,
        auth,
        connectionTimeout: timeout,
        greetingTimeout: timeout,
        socketTimeout: timeout * 2
    });
}

// Opens the connection and authenticates without sending anything, so the real
// reason a send fails can be read directly instead of inferred from a 503.
// "Connection timeout" means the network is blocking SMTP; an auth failure
// means the credentials are wrong. The two need opposite fixes.
async function verifySmtpConnection() {
    if (isBrevoConfigured()) return verifyBrevoKey();

    if (!isSmtpConfigured()) {
        return { ok: false, reason: "smtp-not-configured", missing: missingSmtpSettings() };
    }

    try {
        await createTransporter().verify();
        return { ok: true, via: "smtp" };
    } catch (error) {
        return {
            ok: false,
            via: "smtp",
            reason: error.message.split("\n")[0],
            code: error.code || null,
            command: error.command || null
        };
    }
}

function brevoFailure(error) {
    const status = error.response?.status;
    return {
        reason: error.response?.data?.message || error.message.split("\n")[0],
        code: status ? `HTTP_${status}` : (error.code || null)
    };
}

// Checks the key without sending, the HTTPS equivalent of transporter.verify().
async function verifyBrevoKey() {
    try {
        await axios.get(BREVO_ACCOUNT_URL, {
            headers: { "api-key": process.env.BREVO_API_KEY, accept: "application/json" },
            timeout: smtpTimeoutMs()
        });
        return { ok: true, via: "brevo" };
    } catch (error) {
        return { ok: false, via: "brevo", command: "account", ...brevoFailure(error) };
    }
}

async function sendViaBrevo({ to, toName, subject, text, html }) {
    const sender = parseFromAddress(getFromAddress());

    try {
        await axios.post(BREVO_SEND_URL, {
            sender,
            to: [toName ? { email: to, name: toName } : { email: to }],
            subject,
            textContent: text,
            htmlContent: html
        }, {
            headers: {
                "api-key": process.env.BREVO_API_KEY,
                accept: "application/json",
                "content-type": "application/json"
            },
            timeout: smtpTimeoutMs()
        });
        return { sent: true };
    } catch (error) {
        const { reason, code } = brevoFailure(error);
        // A 401 is a bad key; a 400 naming the sender means Brevo has not
        // verified the MAIL_FROM address yet.
        const failure = new Error(`Brevo rejected the message: ${reason}`);
        failure.code = code;
        throw failure;
    }
}

async function sendPasswordResetEmail({ to, fullName, resetLink, resetCode, expiresMinutes = 60 }) {
    if (!isEmailDeliveryConfigured()) {
        return { sent: false, reason: "smtp-not-configured" };
    }

    const safeName = escapeHtml(fullName || "משתמש");
    const safeLink = escapeHtml(resetLink);
    const safeCode = escapeHtml(resetCode);

    const message = {
        subject: "איפוס הסיסמה שלך ב-HailNow",
        text: [
            `שלום ${fullName || ""},`,
            "",
            "קיבלנו בקשה לאיפוס הסיסמה שלך ב-HailNow.",
            `אפשר לאפס את הסיסמה דרך הקישור הבא: ${resetLink}`,
            `או להזין את קוד האימות הבא: ${resetCode}`,
            "",
            `הקישור והקוד תקפים למשך ${expiresMinutes} דקות.`,
            "אם לא ביקשת איפוס סיסמה, אפשר להתעלם מהמייל הזה."
        ].join("\n"),
        html: `
            <div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6;color:#1e293b">
                <h2 style="margin:0 0 12px">איפוס סיסמה</h2>
                <p>שלום ${safeName},</p>
                <p>קיבלנו בקשה לאיפוס הסיסמה שלך ב-HailNow.</p>
                <p>
                    <a href="${safeLink}" style="display:inline-block;background:#4f46e5;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:700">
                        לחץ כאן לאיפוס הסיסמה
                    </a>
                </p>
                <p>אפשר גם להזין את קוד האימות הזה במסך איפוס הסיסמה:</p>
                <div style="font-size:28px;font-weight:800;letter-spacing:4px;background:#f1f5f9;border-radius:8px;padding:12px 16px;display:inline-block">
                    ${safeCode}
                </div>
                <p>הקישור והקוד תקפים למשך ${expiresMinutes} דקות.</p>
                <p style="color:#64748b;font-size:13px">אם לא ביקשת איפוס סיסמה, אפשר להתעלם מהמייל הזה.</p>
            </div>
        `
    };

    if (isBrevoConfigured()) {
        return sendViaBrevo({ to, toName: fullName, ...message });
    }

    await createTransporter().sendMail({ from: getFromAddress(), to, ...message });
    return { sent: true };
}

module.exports = {
    sendPasswordResetEmail,
    isSmtpConfigured,
    isBrevoConfigured,
    isEmailDeliveryConfigured,
    missingSmtpSettings,
    describePasswordResetDelivery,
    passwordResetDeliveryMode,
    normalizeSmtpPassword,
    parseFromAddress,
    verifySmtpConnection
};
