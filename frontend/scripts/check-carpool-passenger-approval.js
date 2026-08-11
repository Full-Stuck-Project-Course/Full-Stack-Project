const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const pages = join(__dirname, "..", "src", "pages");
const bookRidePage = readFileSync(join(pages, "BookRidePage.jsx"), "utf8");

assert(
    bookRidePage.includes('import { createSocket } from "../api/socket";') &&
        /socket\.on\("carpool-request-approved"/.test(bookRidePage),
    "BookRidePage must listen for the approval event sent to the passenger."
);

assert(
    /status:\s*"confirmed"/.test(bookRidePage) &&
        /rideId:\s*rideId\s*\|\|\s*current\?\.rideId\s*\|\|\s*null/.test(bookRidePage),
    "The approval event must turn the pending carpool booking into a confirmed booking with a ride id."
);

assert(
    /function\s+activeBookingNotice\(booking\)/.test(bookRidePage) &&
        /booking\?\.type\s*===\s*"carpool"\s*&&\s*booking\.rideId/.test(bookRidePage) &&
        /activeBookingNotice\(activeBooking\)/.test(bookRidePage),
    "A confirmed carpool booking must show an approval message instead of only the duplicate-booking warning."
);

assert(
    /const\s+\[passengerId,\s*setPassengerId\]\s*=\s*useState\(null\)/.test(bookRidePage) &&
        /setInterval\(\(\)\s*=>\s*\{\s*refreshActiveBooking\(passengerId\)\.catch/.test(bookRidePage),
    "BookRidePage must poll the open carpool request so the ride id appears even if the socket event is missed."
);

assert(
    /const\s+\{\s*data\s*\}\s*=\s*await\s+api\.post\("\/carpool"/.test(bookRidePage) &&
        /requestId:\s*data\.request\?\._id\s*\|\|\s*null/.test(bookRidePage),
    "After creating a carpool request, BookRidePage must keep the returned request id."
);

console.log("Carpool passenger approval check passed: approved carpool requests surface the ride on the passenger booking page.");
