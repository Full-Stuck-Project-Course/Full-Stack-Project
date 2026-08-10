const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const app = readFileSync(join(__dirname, "..", "src", "App.jsx"), "utf8");
const rideStatusPage = readFileSync(join(__dirname, "..", "src", "pages", "RideStatusPage.jsx"), "utf8");
const paymentPage = readFileSync(join(__dirname, "..", "src", "pages", "PaymentSimulationPage.jsx"), "utf8");
const profilePage = readFileSync(join(__dirname, "..", "src", "pages", "ProfilePage.jsx"), "utf8");
const bookRidePage = readFileSync(join(__dirname, "..", "src", "pages", "BookRidePage.jsx"), "utf8");
const passengerDashboard = readFileSync(join(__dirname, "..", "src", "pages", "PassengerDashboard.jsx"), "utf8");

assert(
    app.includes("PaymentSimulationPage") && app.includes('path="/payment/:id"'),
    "App must expose the passenger payment simulation route."
);

assert(
    rideStatusPage.includes("`/payment/${id}`") &&
        rideStatusPage.includes("driver_to_passenger") &&
        !rideStatusPage.includes("`/rate/${id}?direction=passenger_to_driver` :"),
    "Completed passenger rides must go to payment simulation before passenger rating."
);

assert(
    paymentPage.includes("export function formatCardNumber") &&
        paymentPage.includes('replace(/(.{4})/g, "$1 ")') &&
        paymentPage.includes('type="month"'),
    "PaymentSimulationPage must format card numbers and use a month picker for expiry."
);

assert(
    paymentPage.includes("PHASES.verifying") &&
        paymentPage.includes("PHASES.processing") &&
        paymentPage.includes("PHASES.approved") &&
        paymentPage.includes("window.setTimeout"),
    "PaymentSimulationPage must show a simulated verification/processing/approval flow."
);

assert(
    paymentPage.includes("`/payments/ride/${id}/simulate`") &&
        paymentPage.includes("cardLast4") &&
        !paymentPage.includes("fetch("),
    "PaymentSimulationPage must approve payment through the API bookkeeping endpoint."
);

assert(
    paymentPage.includes("useSavedPaymentMethod") &&
        paymentPage.includes("savePaymentMethod") &&
        paymentPage.includes("defaultPaymentMethod"),
    "PaymentSimulationPage must support passenger profile payment methods."
);

assert(
    profilePage.includes("defaultPaymentMethod") &&
        profilePage.includes("שמור אמצעי תשלום") &&
        profilePage.includes("מספר מלא ו-CVV לא נשמרים"),
    "ProfilePage must let passengers manage a saved payment method without retaining full card data."
);

assert(
    bookRidePage.includes("/payments/unresolved") &&
        bookRidePage.includes("PENDING_PAYMENT_REQUIRED") &&
        bookRidePage.includes("pendingPayment") &&
        bookRidePage.includes("Boolean(pendingPayment)"),
    "BookRidePage must block new bookings while the passenger has an unresolved payment."
);

assert(
    passengerDashboard.includes("/payments/unresolved") &&
        passengerDashboard.includes("pendingPayment") &&
        passengerDashboard.includes("paymentRideId(pendingPayment)"),
    "PassengerDashboard must show a shortcut back to unresolved payment."
);

console.log("Payment simulation flow check passed.");
