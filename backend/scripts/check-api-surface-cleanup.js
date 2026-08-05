const { readFileSync, existsSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const root = join(__dirname, "..");
const routes = readFileSync(join(root, "routes", "index.js"), "utf8");

assert(
    !routes.includes('"/translate"') &&
        !routes.includes('"/translate/batch"') &&
        !routes.includes("translateController"),
    "Unused translate API surface must stay removed from backend routes."
);

assert(
    !existsSync(join(root, "controllers", "translateController.js")),
    "translateController.js must not exist when no UI consumes translation."
);

assert(
    routes.includes('"/payments/ride/:rideId/simulate"'),
    "Payment bookkeeping must keep the passenger payment simulation endpoint."
);

console.log("API surface cleanup check passed: translate endpoints removed and payment simulation remains wired.");
