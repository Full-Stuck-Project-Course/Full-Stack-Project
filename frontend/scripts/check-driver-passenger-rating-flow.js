const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const root = join(__dirname, "..", "src");
const ratingPage = readFileSync(join(root, "pages", "RatingPage.jsx"), "utf8");
const rideStatusPage = readFileSync(join(root, "pages", "RideStatusPage.jsx"), "utf8");
const driverDashboard = readFileSync(join(root, "pages", "DriverDashboard.jsx"), "utf8");

assert(
    ratingPage.includes('DRIVER_TO_PASSENGER: "driver_to_passenger"'),
    "RatingPage must define the driver-to-passenger rating direction."
);

assert(
    /direction,\s*\n\s*rating: stars/.test(ratingPage),
    "RatingPage must submit the selected rating direction to /ratings."
);

assert(
    /isDriverRatingPassenger\s*\?\s*ride\?\.passengerId\s*:\s*ride\?\.driverId/.test(ratingPage),
    "RatingPage must show the passenger as the target when the driver rates."
);

assert(
    /!isDriverRatingPassenger\s*&&\s*\(/.test(ratingPage) && ratingPage.includes("rewardText"),
    "Passenger loyalty reward UI must stay hidden for driver-to-passenger ratings."
);

assert(
    rideStatusPage.includes("direction=driver_to_passenger"),
    "RideStatusPage must route assigned drivers to the passenger-rating flow."
);

assert(
    driverDashboard.includes("completedRides") && driverDashboard.includes("direction=driver_to_passenger"),
    "DriverDashboard must expose completed rides with a passenger-rating action."
);

console.log("Driver passenger-rating flow check passed: drivers can rate passengers after completed rides.");
