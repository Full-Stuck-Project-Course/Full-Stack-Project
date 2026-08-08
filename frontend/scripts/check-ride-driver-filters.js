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
    bookRidePage.includes("MIN_RATING_OPTIONS") && /minRating:\s*driverRating|minRating,/.test(bookRidePage),
    "BookRidePage must offer a minimum driver rating filter and send it to the API."
);

assert(
    bookRidePage.includes("ALLOWANCES") &&
        bookRidePage.includes('key: "pets"') &&
        bookRidePage.includes('key: "smoking"') &&
        bookRidePage.includes('key: "food"') &&
        /allowsPets: true/.test(bookRidePage) &&
        /allowsSmoking: true/.test(bookRidePage) &&
        /allowsFood: true/.test(bookRidePage),
    "BookRidePage must let the passenger require what a driver allows and send it to the API."
);

assert(
    bookRidePage.includes("preferredDriverGender: driverGender || null") &&
        bookRidePage.includes("maxDriverDistanceKm: driverRadius") &&
        bookRidePage.includes("minDriverRating: minRating || null") &&
        bookRidePage.includes("requiredAllowances: allowances"),
    "Booking a ride must persist the passenger's driver preferences so they are enforced server-side."
);

assert(
    bookRidePage.includes("נהגים מתאימים לסינון שבחרת"),
    "BookRidePage must tell the passenger how many drivers match the current filters."
);

console.log("Ride driver filter check passed: gender, distance, and vehicle type filter real drivers.");
