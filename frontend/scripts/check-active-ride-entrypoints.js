const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const pages = join(__dirname, "..", "src", "pages");
const homePage = readFileSync(join(pages, "HomePage.jsx"), "utf8");
const driverDashboard = readFileSync(join(pages, "DriverDashboard.jsx"), "utf8");

assert(
    homePage.includes('import { extractItems } from "../api/pagination";') &&
        /const\s+\[activeRides,\s*setActiveRides\]\s*=\s*useState\(\[\]\)/.test(homePage),
    "HomePage must keep active ride state from the rides API."
);

assert(
    /api\.get\("\/rides",\s*\{\s*params:\s*\{\s*limit:\s*20\s*\}\s*\}\)/.test(homePage) &&
        /ACTIVE_RIDE_STATUSES\.includes\(ride\.status\)/.test(homePage),
    "HomePage must load and filter active rides."
);

assert(
    homePage.includes("חזור לנסיעה") &&
        homePage.includes("navigate(`/ride/${ride._id}`)"),
    "HomePage must show a direct return button for active rides."
);

assert(
    /const\s+\[activeRides,\s*setActiveRides\]\s*=\s*useState\(\[\]\)/.test(driverDashboard) &&
        /const\s+activeDriverRides\s*=\s*ownRides\.filter\(ride\s*=>\s*ACTIVE_RIDE_STATUSES\.includes\(ride\.status\)\)/.test(driverDashboard),
    "DriverDashboard must derive active driver rides from the driver's ride list."
);

assert(
    driverDashboard.includes("setActiveRides(activeDriverRides)") &&
        driverDashboard.includes("חזור לנסיעה") &&
        driverDashboard.includes("navigate(`/ride/${ride._id}`)"),
    "DriverDashboard must render a direct return button for active rides."
);

console.log("Active ride entrypoint check passed: active rides are visible from home and driver dashboard.");
