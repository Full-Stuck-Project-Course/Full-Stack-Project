const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const pages = join(__dirname, "..", "src", "pages");
const driverDashboard = readFileSync(join(pages, "DriverDashboard.jsx"), "utf8");
const bookRidePage = readFileSync(join(pages, "BookRidePage.jsx"), "utf8");

// A carpool booking never becomes a searching ride, so the driver dashboard has
// to read the carpool queue as well as the ride queue.
assert(
    /api\.get\("\/carpool\/pending"\)/.test(driverDashboard) &&
    /const\s+\[carpoolRequests,\s*setCarpoolRequests\]\s*=\s*useState\(\[\]\)/.test(driverDashboard),
    "DriverDashboard must load waiting carpool requests from /carpool/pending."
);

assert(
    driverDashboard.includes("api.put(`/carpool/${requestId}/accept`"),
    "DriverDashboard must let a driver approve a waiting carpool passenger."
);

assert(
    /activeCarpoolRide\s*\?\s*\{\s*rideId:\s*activeCarpoolRide\._id\s*\}\s*:\s*\{\}/.test(driverDashboard),
    "Approving must join the driver's open carpool ride when there is one, and open a new ride otherwise."
);

assert(
    /const\s+canApproveCarpoolRequest\s*=\s*Boolean\(activeCarpoolRide\)[\s\S]*driver\?\.status\s*===\s*"busy"/.test(driverDashboard) &&
    /disabled=\{approvingRequestId\s*===\s*request\._id\s*\|\|\s*!canApproveCarpoolRequest\}/.test(driverDashboard),
    "A busy driver must still be able to approve another passenger for an open carpool ride."
);

assert(
    /ride\.rideType\s*===\s*"carpool"\s*&&\s*\n?\s*ACTIVE_RIDE_STATUSES\.includes\(ride\.status\)/.test(driverDashboard),
    "DriverDashboard must track the driver's own open carpool ride to add passengers to."
);

assert(
    /בקשות קרפול ממתינות \(\{carpoolRequests\.length\}\)/.test(driverDashboard) &&
    /request\.seatsNeeded/.test(driverDashboard),
    "DriverDashboard must render the waiting carpool passengers with their seat counts."
);

assert(
    /\{carpoolError\s*&&/.test(driverDashboard),
    "DriverDashboard must surface why an approval was refused."
);

// One booking at a time, explained on the page that does the booking.
assert(
    /export const ACTIVE_BOOKING_MESSAGE\s*=/.test(bookRidePage) &&
    bookRidePage.includes("לא ניתן להזמין כמה נסיעות במקביל"),
    "BookRidePage must carry the message shown when a second booking is attempted."
);

assert(
    /if\s*\(activeBooking\)\s*return\s+setError\(ACTIVE_BOOKING_MESSAGE\)/.test(bookRidePage),
    "BookRidePage must refuse to submit while a booking is already open."
);

assert(
    /err\.response\?\.data\?\.code\s*===\s*"ACTIVE_BOOKING_EXISTS"/.test(bookRidePage),
    "BookRidePage must show the message when the server refuses a second booking."
);

assert(
    /disabled=\{loading\s*\|\|\s*Boolean\(activeBooking\)[^}]*\}/.test(bookRidePage),
    "BookRidePage must disable the submit button while a booking is open."
);

assert(
    /export function findActiveBooking\(/.test(bookRidePage) &&
    /const ACTIVE_RIDE_STATUSES\s*=\s*\["searching",\s*"accepted",\s*"driver_arriving",\s*"in_progress"\]/.test(bookRidePage) &&
    /const OPEN_CARPOOL_STATUSES\s*=\s*\["pending",\s*"matched",\s*"confirmed"\]/.test(bookRidePage),
    "BookRidePage must detect an open booking using the same statuses the server blocks on."
);

console.log("Carpool driver approval check passed: drivers approve waiting passengers and a second booking is refused with a message.");
