const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const pages = join(__dirname, "..", "src", "pages");
const bookRidePage = readFileSync(join(pages, "BookRidePage.jsx"), "utf8");
const driverDashboard = readFileSync(join(pages, "DriverDashboard.jsx"), "utf8");
const passengerDashboard = readFileSync(join(pages, "PassengerDashboard.jsx"), "utf8");
const rideStatusPage = readFileSync(join(pages, "RideStatusPage.jsx"), "utf8");

// A datetime-local value carries no timezone. Sending it raw let the server
// read it in its own zone, so every dashboard showed a shifted time.
assert(
    /export function toScheduledInstant\(/.test(bookRidePage) &&
    /picked\.toISOString\(\)/.test(bookRidePage),
    "BookRidePage must convert the picked local time into an absolute instant before sending it."
);

assert(
    /scheduledTime:\s*toScheduledInstant\(scheduledTime\)/.test(bookRidePage),
    "Rides must be booked with an absolute scheduled instant."
);

assert(
    /requestedTime:\s*toScheduledInstant\(scheduledTime\)\s*\|\|\s*new Date\(\)\.toISOString\(\)/.test(bookRidePage),
    "Carpool requests must be sent with an absolute requested instant."
);

assert(
    !/scheduledTime:\s*scheduledTime\s*\|\|\s*null/.test(bookRidePage) &&
    !/requestedTime:\s*scheduledTime\s*\|\|/.test(bookRidePage),
    "The raw datetime-local string must not be sent to the server."
);

// Every surface that shows a booking has to show the time the passenger chose.
assert(
    /ride\.scheduledTime\s*\n?\s*\?\s*`🕐 \$\{new Date\(ride\.scheduledTime\)\.toLocaleString\("he-IL"\)\}`/.test(passengerDashboard),
    "PassengerDashboard must show the scheduled date and time of an upcoming ride."
);

assert(
    /request\.requestedTime\s*&&\s*`\s*·\s*\$\{new Date\(request\.requestedTime\)\.toLocaleString\("he-IL"\)\}`/.test(passengerDashboard),
    "PassengerDashboard must show the requested date and time of a carpool request."
);

assert(
    /\["זמן מתוכנן",\s*new Date\(ride\.scheduledTime\)\.toLocaleString\("he-IL"\)\]/.test(rideStatusPage),
    "RideStatusPage must show the scheduled date and time of a booked ride."
);

assert(
    /function formatScheduledTime\(value\)/.test(driverDashboard) &&
    /day:\s*"2-digit",\s*month:\s*"2-digit",\s*hour:\s*"2-digit",\s*minute:\s*"2-digit"/.test(driverDashboard),
    "DriverDashboard must format scheduled bookings with their date, not just a time."
);

assert(
    /🕐 \{formatScheduledTime\(ride\.scheduledTime\)\}/.test(driverDashboard) &&
    /🕐 \{formatScheduledTime\(request\.requestedTime\)\}/.test(driverDashboard),
    "DriverDashboard must use that format for both rides and carpool requests."
);

console.log("Scheduled ride time check passed: the time a passenger picks is the time every dashboard shows.");
