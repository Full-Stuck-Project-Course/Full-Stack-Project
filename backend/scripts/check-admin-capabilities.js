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

const userController = read("controllers/userController.js");
const driverController = read("controllers/driverController.js");
const rideController = read("controllers/rideController.js");

assert(
    /async\s+function\s+ensurePassengerProfileForUser\s*\(/.test(userController),
    "User responses must ensure every user, including admins, has a passenger profile."
);

assert(
    /ensurePassengerProfileForUser\(user\)/.test(userController),
    "buildUserResponse must use ensurePassengerProfileForUser."
);

assert(
    !/if\s*\(\s*role\s*!==\s*"admin"\s*\)\s*\{\s*await\s+PassengerProfile\.create/s.test(userController),
    "Admins must not be excluded from passenger profile creation."
);

assert(
    /existingUser\?\.role\s*===\s*"admin"[\s\S]*newRole\s*=\s*"admin"/.test(driverController),
    "Driver registration must preserve the admin role."
);

assert(
    /PassengerProfile\.findOneAndUpdate\([\s\S]*userId:\s*req\.user\.userId[\s\S]*upsert:\s*true/.test(rideController),
    "Admin ride creation without passengerId must use the admin's own passenger profile."
);

console.log("Admin capability check passed: admins keep admin role and can act as passengers/drivers.");
