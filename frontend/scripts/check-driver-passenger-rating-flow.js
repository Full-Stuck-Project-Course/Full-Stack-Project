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
    ratingPage.includes("ratingTargetPassenger") &&
        ratingPage.includes('searchParams.get("passengerId")') &&
        /isDriverRatingPassenger\s*\?\s*ratingTargetPassenger\(ride,\s*requestedPassengerId\)\s*:\s*ride\?\.driverId/.test(ratingPage),
    "RatingPage must show the selected passenger as the target when the driver rates."
);

assert(
    ratingPage.includes("passengerId: idOf(target?._id || target)"),
    "RatingPage must submit the selected passenger id when a driver rates a passenger."
);

assert(
    /!isDriverRatingPassenger\s*&&\s*\(/.test(ratingPage) && ratingPage.includes("rewardText"),
    "Passenger loyalty reward UI must stay hidden for driver-to-passenger ratings."
);

assert(
    rideStatusPage.includes("direction=driver_to_passenger") &&
        rideStatusPage.includes("passengerId=${passengerId}"),
    "RideStatusPage must route assigned drivers to passenger-specific rating in carpool rides."
);

assert(
    driverDashboard.includes("completedRides") &&
        driverDashboard.includes("direction=driver_to_passenger") &&
        driverDashboard.includes("passengerId=${passengerId}"),
    "DriverDashboard must expose completed rides with passenger-specific rating actions."
);

console.log("Driver passenger-rating flow check passed: drivers can rate passengers after completed rides.");
