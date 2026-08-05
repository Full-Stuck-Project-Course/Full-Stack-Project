const { readFileSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");

function read(relativePath) {
    return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const passengerModel = read("db/models/PassengerProfile.js");
assert(
    !/\bloyaltyPoints\s*:/.test(passengerModel),
    "PassengerProfile must not define loyaltyPoints; User.loyaltyPoints is the source of truth."
);

const rideController = read("controllers/rideController.js");
assert(
    !/redeemedPassengerProfileId/.test(rideController),
    "Ride redemption must not track or synchronize PassengerProfile loyalty points."
);
assert(
    !/PassengerProfile\.findByIdAndUpdate\([^)]*loyaltyPoints/s.test(rideController),
    "Ride redemption must not write loyaltyPoints to PassengerProfile."
);

const ratingController = read("controllers/ratingController.js");
assert(
    !/PassengerProfile\.findByIdAndUpdate\([^)]*loyaltyPoints/s.test(ratingController),
    "Rating rewards must not write loyaltyPoints to PassengerProfile."
);
assert(
    !/passengerProfile\.loyaltyPoints/.test(ratingController),
    "Rating rewards must not read loyaltyPoints from PassengerProfile."
);

console.log("Loyalty source check passed: User.loyaltyPoints is the only persisted source.");
