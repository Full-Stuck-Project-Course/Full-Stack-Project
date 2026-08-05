const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const bookRidePage = readFileSync(join(__dirname, "..", "src", "pages", "BookRidePage.jsx"), "utf8");

assert(
    bookRidePage.includes("export function getMaxRedeemablePoints") &&
        bookRidePage.includes("Math.ceil((Number(ridePrice) || 0) / LOYALTY_POINT_VALUE_ILS)") &&
        bookRidePage.includes("return Math.min(points, priceCap);"),
    "BookRidePage must cap redeemable loyalty points at the ride price value in points."
);

assert(
    bookRidePage.includes('type="range"') &&
        bookRidePage.includes("max={maxRedeemablePoints}") &&
        bookRidePage.includes("value={activePointsToUse}") &&
        bookRidePage.includes("setPointsToUse(Math.min(Number(e.target.value), maxRedeemablePoints))"),
    "BookRidePage must expose a slider that controls the selected loyalty points."
);

assert(
    bookRidePage.includes("pointsToRedeem: redeemPoints ? activePointsToUse : 0"),
    "Ride creation must submit the capped slider value."
);

assert(
    bookRidePage.includes("עד {maxRedeemablePoints} נקודות") &&
        !bookRidePage.includes("({userPoints} נקודות"),
    "BookRidePage must show the maximum redeemable points, not all available loyalty points."
);

console.log("Loyalty redemption slider check passed.");
