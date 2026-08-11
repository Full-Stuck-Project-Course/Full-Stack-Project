const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const rideStatusPage = readFileSync(join(__dirname, "..", "src", "pages", "RideStatusPage.jsx"), "utf8");

assert(
    /function\s+getRideParticipantInfo\s*\(\s*ride\s*\)/.test(rideStatusPage),
    "RideStatusPage must build participant display data in one place."
);

assert(
    rideStatusPage.includes("פרטי המשתתפים") &&
        rideStatusPage.includes("פרטי הנוסע") &&
        rideStatusPage.includes("פרטי הנהג"),
    "RideStatusPage must show both passenger and driver sections."
);

assert(
    rideStatusPage.includes("ride?.passengerId?.userId?.fullName") &&
        rideStatusPage.includes("ride?.driverId?.userId?.fullName") &&
        rideStatusPage.includes("carpoolPassengers.map") &&
        rideStatusPage.includes("passenger?.userId?.fullName"),
    "RideStatusPage must show populated passenger, carpool passenger, and driver names when available."
);

assert(
    rideStatusPage.includes("isRidePassengerUser") &&
        rideStatusPage.includes("carpoolPassengerCount(ride)") &&
        rideStatusPage.includes("carpoolPassengers.length > 0"),
    "RideStatusPage must treat approved carpool passengers as ride participants for display and actions."
);

assert(
    rideStatusPage.includes("completionPassengerRows") &&
        rideStatusPage.includes("canPayAfterOwnCarpoolCompletion") &&
        rideStatusPage.includes("passengerCompletedAt"),
    "RideStatusPage must show per-passenger carpool completion state and payment access after the current passenger confirms."
);

assert(
    rideStatusPage.includes("טרם שובץ נהג") &&
        rideStatusPage.includes("נעדכן כשהנהג יקבל את הנסיעה"),
    "RideStatusPage must show a fallback when the ride has no assigned driver."
);

assert(
    !/\/\*\s*Driver info\s*\*\//.test(rideStatusPage),
    "RideStatusPage must not keep the old driver-only information block."
);

console.log("Ride participants display check passed: ride status shows passenger and driver with fallback.");
