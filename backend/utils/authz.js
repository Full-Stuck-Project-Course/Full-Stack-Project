const PassengerProfile = require("../db/models/PassengerProfile");
const DriverProfile = require("../db/models/DriverProfile");

function sameId(a, b) {
    const left = a?._id || a;
    const right = b?._id || b;
    return left?.toString() === right?.toString();
}

function isAdmin(req) {
    return req.user?.role === "admin";
}

async function getPassengerProfileForUser(userId) {
    return PassengerProfile.findOne({ userId });
}

async function getDriverProfileForUser(userId) {
    return DriverProfile.findOne({ userId });
}

async function canAccessPassenger(req, passengerId) {
    if (isAdmin(req)) return true;
    const passenger = await getPassengerProfileForUser(req.user.userId);
    return passenger && sameId(passenger._id, passengerId);
}

async function canAccessDriver(req, driverId) {
    if (isAdmin(req)) return true;
    const driver = await getDriverProfileForUser(req.user.userId);
    return driver && sameId(driver._id, driverId);
}

function forbidden(res, message = "Access denied") {
    return res.status(403).json({ error: message });
}

module.exports = {
    sameId,
    isAdmin,
    getPassengerProfileForUser,
    getDriverProfileForUser,
    canAccessPassenger,
    canAccessDriver,
    forbidden
};
