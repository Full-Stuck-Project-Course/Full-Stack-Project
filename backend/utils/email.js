const nodemailer = require("nodemailer");

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

function getFromAddress() {
    return process.env.MAIL_FROM || process.env.SMTP_FROM || "HailNow <no-reply@hailnow.local>";
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
    const missing = [];
    if (!process.env.SMTP_HOST) missing.push("SMTP_HOST");
    if (!process.env.SMTP_PORT) missing.push("SMTP_PORT");
    if (process.env.SMTP_PASS && !process.env.SMTP_USER) missing.push("SMTP_USER (required because SMTP_PASS is set)");
    if (process.env.SMTP_USER && !process.env.SMTP_PASS) missing.push("SMTP_PASS (required because SMTP_USER is set)");
    return missing;
}

// One line for the startup log, so a misconfigured deployment is visible
// before a user ever asks for a reset link.
function describePasswordResetDelivery() {
    if (process.env.RESET_EMAIL_WEBHOOK_URL) return "Password reset delivery: webhook (RESET_EMAIL_WEBHOOK_URL)";
    if (isSmtpConfigured()) return `Password reset delivery: SMTP via ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`;

    const missing = missingSmtpSettings();
    return "Password reset delivery: DISABLED — " + (missing.length
        ? `missing ${missing.join(", ")}`
        : "set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS, or RESET_EMAIL_WEBHOOK_URL");
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

async function sendPasswordResetEmail({ to, fullName, resetLink, resetCode, expiresMinutes = 60 }) {
    if (!isSmtpConfigured()) {
        return { sent: false, reason: "smtp-not-configured" };
    }

    const safeName = escapeHtml(fullName || "משתמש");
    const safeLink = escapeHtml(resetLink);
    const safeCode = escapeHtml(resetCode);

    const transporter = createTransporter();
    await transporter.sendMail({
        from: getFromAddress(),
        to,
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
    });

    return { sent: true };
}

module.exports = {
    sendPasswordResetEmail,
    isSmtpConfigured,
    missingSmtpSettings,
    describePasswordResetDelivery,
    normalizeSmtpPassword
};
