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
const rideModel = read("db/models/Ride.js");
assert(
    !/\bloyaltyPoints\s*:/.test(passengerModel),
    "PassengerProfile must not define loyaltyPoints; User.loyaltyPoints is the source of truth."
);
assert(
    /loyaltyPointsRedeemed\s*:/.test(rideModel) &&
        /loyaltyRedemptionUserId\s*:/.test(rideModel) &&
        /loyaltyPointsRefunded\s*:/.test(rideModel),
    "Ride must store loyalty redemption metadata so cancelled rides can refund points exactly once."
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
assert(
    /mongoose\.startSession\(\)/.test(rideController) &&
        /withTransaction\s*\(/.test(rideController) &&
        /User\.findOneAndUpdate\([\s\S]*session[\s\S]*Ride\.create\(\[\{[\s\S]*\}\],\s*\{\s*session\s*\}/.test(rideController),
    "Ride redemption must update User.loyaltyPoints and create the ride in one MongoDB transaction."
);
assert(
    /getMaxRedeemableLoyaltyPoints/.test(rideController) &&
        /Math\.ceil\(positiveNumber\(ridePrice\)\s*\/\s*LOYALTY_POINT_VALUE_ILS\)/.test(rideController) &&
        !/originalFinalPrice\s*\*\s*10/.test(rideController),
    "Ride redemption must cap usable loyalty points at the ride price value in points."
);
assert(
    /refundRedeemedLoyaltyPoints/.test(rideController) &&
        /loyaltyPointsRefunded:\s*true/.test(rideController) &&
        /User\.findByIdAndUpdate\([\s\S]*\$inc:\s*\{\s*loyaltyPoints:\s*positiveNumber\(markedRide\.loyaltyPointsRedeemed\)/.test(rideController),
    "Cancelling a ride must mark redeemed points as refunded and return them to User.loyaltyPoints."
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
