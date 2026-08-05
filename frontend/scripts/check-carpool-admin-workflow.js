const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const adminPanel = readFileSync(join(__dirname, "..", "src", "pages", "AdminPanel.jsx"), "utf8");
const passengerDashboard = readFileSync(join(__dirname, "..", "src", "pages", "PassengerDashboard.jsx"), "utf8");

assert(
    /\{\s*key:\s*"carpool",\s*label:\s*"קרפול"\s*\}/.test(adminPanel),
    "AdminPanel must expose a carpool management tab."
);

assert(
    /carpoolRequests:\s*\[\]/.test(adminPanel) &&
    /api\.get\("\/carpool"\)/.test(adminPanel),
    "AdminPanel must load carpool requests from /carpool."
);

assert(
    /const\s+carpoolRideOptions\s*=\s*useMemo/.test(adminPanel) &&
    /ride\.rideType\s*===\s*"carpool"/.test(adminPanel) &&
    /!\["completed",\s*"cancelled"\]\.includes\(ride\.status\)/.test(adminPanel),
    "AdminPanel must offer active carpool rides as matching targets."
);

assert(
    adminPanel.includes('api.put(`/carpool/${request._id}/match`, { rideId })') &&
    /disabled=\{saving\s*\|\|\s*!canMatch\s*\|\|\s*!current\.rideId\}/.test(adminPanel),
    "AdminPanel must match pending carpool requests with an explicit rideId."
);

assert(
    adminPanel.includes('api.put(`/carpool/${request._id}/cancel`)') &&
    /const\s+canCancel\s*=\s*\["pending",\s*"matched"\]\.includes\(request\.status\)/.test(adminPanel),
    "AdminPanel must allow cancelling pending or matched carpool requests."
);

assert(
    /const\s+\[carpoolRequests,\s*setCarpoolRequests\]\s*=\s*useState\(\[\]\)/.test(passengerDashboard) &&
    /api\.get\("\/carpool"\)/.test(passengerDashboard) &&
    /request\.passengerId\?\._id\s*\|\|\s*request\.passengerId/.test(passengerDashboard),
    "PassengerDashboard must load and filter the passenger's own carpool requests."
);

assert(
    /const\s+carpoolStatusText\s*=/.test(passengerDashboard) &&
    passengerDashboard.includes('navigate(`/ride/${rideId}`)'),
    "PassengerDashboard must show carpool status and open a matched ride."
);

assert(
    passengerDashboard.includes('api.put(`/carpool/${requestId}/cancel`)') &&
    /\["pending",\s*"matched"\]\.includes\(request\.status\)/.test(passengerDashboard),
    "PassengerDashboard must let passengers cancel open carpool requests."
);

console.log("Carpool workflow check passed: admins can match/approve requests and passengers can track matched carpools.");
