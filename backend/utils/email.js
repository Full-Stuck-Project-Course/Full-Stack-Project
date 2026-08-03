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

function isSmtpConfigured() {
    return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && getFromAddress());
}

function createTransporter() {
    const port = Number(process.env.SMTP_PORT);
    const secure = parseBoolean(process.env.SMTP_SECURE);
    const auth = process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined;

    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: secure ?? port === 465,
        auth
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
    isSmtpConfigured
};
