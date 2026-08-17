require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

// Reports why password reset mail is not going out, without needing the server
// log. Run it where the problem is: on your machine it checks the credentials,
// on the deployed host it also checks whether that network allows SMTP at all.
//
//   npm run check:smtp           connect and authenticate only
//   npm run check:smtp -- --send also send a real test message to SMTP_USER

const {
    describePasswordResetDelivery,
    verifySmtpConnection,
    sendPasswordResetEmail
} = require("../utils/email");

const ADVICE = {
    HTTP_401: "Brevo rejected the API key. Copy it again from Brevo > SMTP & API > API Keys, and set it as BREVO_API_KEY.",
    HTTP_400: "Brevo refused the request. The usual cause is MAIL_FROM using an address Brevo has not verified — add it under Senders, Domains & Dedicated IPs > Senders, and confirm the mail Brevo sends you.",
    ETIMEDOUT: "The mail server never answered. This network is almost certainly blocking outbound SMTP — common on free hosting tiers. Set BREVO_API_KEY to send over HTTPS instead, which this environment does allow.",
    ECONNECTION: "Could not open the connection. Check SMTP_HOST and SMTP_PORT, and whether this network allows outbound SMTP.",
    EAUTH: "The mail server rejected the credentials. With Gmail, SMTP_PASS must be a 16-character App Password (not the account password) and SMTP_USER must be the full address that generated it.",
    ESOCKET: "The socket failed. A common cause is SMTP_SECURE=true on port 587 — it must be false there, and true only on 465.",
    EDNS: "The host name did not resolve. Check SMTP_HOST for a typo."
};

(async () => {
    console.log(describePasswordResetDelivery());

    const result = await verifySmtpConnection();

    if (result.ok) {
        console.log(result.via === "brevo"
            ? "Brevo API key accepted."
            : "SMTP connection and login succeeded.");
    } else if (result.reason === "smtp-not-configured") {
        console.error(`Not configured. Missing: ${result.missing.join(", ") || "(sender address)"}`);
        process.exitCode = 1;
        return;
    } else {
        console.error(`SMTP check failed: ${result.reason}`);
        if (result.code) console.error(`  code: ${result.code}${result.command ? `, during: ${result.command}` : ""}`);
        const advice = ADVICE[result.code] || (/timeout|greeting/i.test(result.reason) ? ADVICE.ETIMEDOUT : null);
        if (advice) console.error(`  ${advice}`);
        process.exitCode = 1;
        return;
    }

    if (!process.argv.includes("--send")) {
        console.log("Run with --send to also deliver a real test message.");
        return;
    }

    const { parseFromAddress } = require("../utils/email");
    const to = process.env.SMTP_USER || parseFromAddress(process.env.MAIL_FROM || process.env.SMTP_FROM).email;
    if (!to) {
        console.error("Cannot send a test message: set SMTP_USER or MAIL_FROM to the address to send it to.");
        process.exitCode = 1;
        return;
    }

    try {
        const delivery = await sendPasswordResetEmail({
            to,
            fullName: "SMTP check",
            resetLink: `${process.env.CLIENT_BASE_URL || "http://localhost:3000"}/reset-password?token=smtp-check`,
            resetCode: "000000"
        });
        console.log(delivery.sent ? `Test message sent to ${to}. Check that inbox.` : `Not sent: ${delivery.reason}`);
        if (!delivery.sent) process.exitCode = 1;
    } catch (error) {
        console.error(`Sending the test message failed: ${error.message.split("\n")[0]}`);
        process.exitCode = 1;
    }
})();
