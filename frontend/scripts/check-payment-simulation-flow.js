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

console.log("Payment simulation flow check passed.");
