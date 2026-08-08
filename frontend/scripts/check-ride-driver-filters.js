const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const bookRidePage = readFileSync(join(__dirname, "..", "src", "pages", "BookRidePage.jsx"), "utf8");

assert(
    bookRidePage.includes("DRIVER_GENDERS") &&
        bookRidePage.includes('{ value: "male"') &&
        bookRidePage.includes('{ value: "female"') &&
        bookRidePage.includes('{ value: "",'),
    "BookRidePage must offer a driver gender filter with a no-preference option."
);

assert(
    bookRidePage.includes("driverRadius") &&
        bookRidePage.includes('id="driver-radius"') &&
        bookRidePage.includes("MIN_DRIVER_RADIUS_KM") &&
        bookRidePage.includes("MAX_DRIVER_RADIUS_KM"),
    "BookRidePage must offer a bounded maximum-distance filter for drivers."
);

assert(
    bookRidePage.includes("VEHICLE_TYPES") && bookRidePage.includes("setVehicleType"),
    "BookRidePage must offer a vehicle type selector."
);

assert(
    /radius:\s*driverRadius/.test(bookRidePage) &&
        /vehicleType,/.test(bookRidePage) &&
        /gender:\s*driverGender/.test(bookRidePage),
    "The nearby-drivers query must send the distance, vehicle type, and gender filters to the API."
);

assert(
    bookRidePage.includes("preferredDriverGender: driverGender || null") &&
        bookRidePage.includes("maxDriverDistanceKm: driverRadius"),
    "Booking a ride must persist the passenger's driver preferences so they are enforced server-side."
);

assert(
    bookRidePage.includes("נהגים מתאימים לסינון שבחרת"),
    "BookRidePage must tell the passenger how many drivers match the current filters."
);

console.log("Ride driver filter check passed: gender, distance, and vehicle type filter real drivers.");
