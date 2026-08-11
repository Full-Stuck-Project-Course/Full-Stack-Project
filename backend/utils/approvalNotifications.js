// utils/approvalNotifications.js
//
// Uploads and payments are approved automatically in this project — there is no
// human reviewer and no payment provider. These helpers tell the user that the
// approval happened, both as a stored notification and as a live socket push so
// the notification bell does not have to wait for its 30-second poll.

const DriverProfile = require("../db/models/DriverProfile");
const Notification = require("../db/models/Notification");
const PassengerProfile = require("../db/models/PassengerProfile");

const DOCUMENT_LABELS = {
    profiles: "תמונת הפרופיל",
    ids: "תעודת הזהות",
    licenses: "רישיון הנהיגה",
    "vehicle-docs": "מסמכי הרכב"
};

function socketFrom(source) {
    if (!source) return null;
    if (typeof source.to === "function") return source;
    return source.app?.get?.("io") || null;
}

// Approval notices are a side effect of work that has already succeeded, so a
// failure here must never turn that work into an error response.
async function deliver(io, documents, event, payloadFor) {
    if (documents.length === 0) return [];

    const notifications = await Notification.insertMany(documents);
    if (io) {
        for (const notification of notifications) {
            io.to(`user:${notification.userId}`).emit(event, {
                ...payloadFor(notification),
                notification
            });
        }
    }
    return notifications;
}

async function notifyDocumentApproved(source, { userId, kind }) {
    try {
        if (!userId || !DOCUMENT_LABELS[kind]) return [];

        const label = DOCUMENT_LABELS[kind];
        return await deliver(
            socketFrom(source),
            [{
                userId,
                type: "document_approved",
                title: `${label} אושרה`,
                body: `${label} נבדקה ואושרה אוטומטית. אין צורך להמתין לאישור נוסף.`
            }],
            "document-approved",
            () => ({ kind })
        );
    } catch (error) {
        console.warn(`Could not send ${kind} approval notification:`, error.message);
        return [];
    }
}

function formatAmount(amount) {
    return `₪${Number(amount || 0).toFixed(1)}`;
}

async function notifyPaymentApproved(source, { ride, payment }) {
    try {
        const paidPassengerId = payment.passengerId?._id || payment.passengerId || ride.passengerId;
        const [passenger, driver] = await Promise.all([
            PassengerProfile.findById(paidPassengerId).select("userId"),
            ride.driverId ? DriverProfile.findById(ride.driverId).select("userId") : null
        ]);

        const amount = formatAmount(payment.amount);
        const cardSuffix = payment.cardLast4 ? ` · כרטיס מסתיים ב-${payment.cardLast4}` : "";

        return await deliver(
            socketFrom(source),
            [
                passenger?.userId && {
                    userId: passenger.userId,
                    type: "payment_received",
                    title: "התשלום אושר",
                    body: `התשלום על סך ${amount} אושר אוטומטית${cardSuffix}.`,
                    rideId: ride._id
                },
                driver?.userId && {
                    userId: driver.userId,
                    type: "payment_received",
                    title: "התקבל תשלום",
                    body: `התקבל תשלום על סך ${amount} עבור הנסיעה שהושלמה.`,
                    rideId: ride._id
                }
            ].filter(Boolean),
            "payment-approved",
            () => ({
                rideId: ride._id,
                amount: payment.amount,
                transactionId: payment.transactionId
            })
        );
    } catch (error) {
        console.warn("Could not send payment notifications:", error.message);
        return [];
    }
}

module.exports = {
    DOCUMENT_LABELS,
    notifyDocumentApproved,
    notifyPaymentApproved
};
