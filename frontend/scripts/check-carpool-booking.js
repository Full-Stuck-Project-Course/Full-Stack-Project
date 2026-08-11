const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const bookRidePage = readFileSync(join(__dirname, "..", "src", "pages", "BookRidePage.jsx"), "utf8");
const handleSubmitStart = bookRidePage.indexOf("const handleSubmit = async");
const handleSubmit = bookRidePage.slice(handleSubmitStart);
const branchStart = handleSubmit.indexOf('if (rideType === "carpool")');
const carpoolPost = handleSubmit.indexOf('api.post("/carpool"', branchStart);
const ridesPost = handleSubmit.indexOf('api.post("/rides"', branchStart);
const carpoolReturn = handleSubmit.indexOf("return;", carpoolPost);

assert(handleSubmitStart >= 0, "BookRidePage must define handleSubmit.");
assert(branchStart >= 0, "BookRidePage submit flow must branch when rideType is carpool.");
assert(carpoolPost > branchStart, "Carpool bookings must be submitted to /carpool.");
assert(ridesPost > carpoolPost, "Regular ride creation should remain after the carpool branch.");
assert(carpoolReturn > carpoolPost && carpoolReturn < ridesPost, "Carpool submit must return before falling through to /rides.");
assert(/requestedTime:\s*toScheduledInstant\(scheduledTime\)\s*\|\|\s*new Date\(\)\.toISOString\(\)/.test(handleSubmit), "Carpool requests must send requestedTime as an absolute instant.");
assert(/vehicleType/.test(handleSubmit.slice(carpoolPost, carpoolReturn)), "Carpool requests must include the quoted vehicleType.");
assert(/seatsNeeded:\s*passengerCount/.test(handleSubmit), "Carpool requests must send seatsNeeded from passengerCount.");
assert(/pricePerSeat:\s*Number\.isFinite\(pricePerSeat\)\s*\?\s*pricePerSeat\s*:\s*0/.test(handleSubmit), "Carpool requests must send a safe pricePerSeat.");
assert(/userPoints\s*>\s*0\s*&&\s*rideType\s*!==\s*"carpool"/.test(bookRidePage), "Point redemption controls must not appear for pending carpool requests.");

console.log("Carpool booking check passed: BookRidePage submits carpool requests to /carpool before /rides.");
