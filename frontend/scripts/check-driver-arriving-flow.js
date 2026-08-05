const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const rideStatusPage = readFileSync(join(__dirname, "..", "src", "pages", "RideStatusPage.jsx"), "utf8");

assert(
    !/updateRideStep\("driver-arriving"\)/.test(rideStatusPage),
    "RideStatusPage must not show a separate driver-arriving action after ride acceptance."
);

assert(
    !/>\s*הנהג בדרך\s*</.test(rideStatusPage),
    "RideStatusPage must not render a manual 'driver is arriving' button."
);

assert(
    /isAssignedDriver\s*&&\s*\["accepted",\s*"driver_arriving"\]\.includes\(ride\.status\)/.test(rideStatusPage) &&
        /updateRideStep\("start"\)/.test(rideStatusPage),
    "Assigned drivers must still be able to start accepted or driver-arriving rides."
);

console.log("Driver arriving flow check passed: accepting a ride no longer requires a separate driver-arriving button.");
