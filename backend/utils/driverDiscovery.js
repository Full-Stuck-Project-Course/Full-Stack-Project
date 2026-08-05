const DriverProfile = require("../db/models/DriverProfile");
const { nearGeoLocationFilter } = require("./geoLocation");
const { haversineKm } = require("./pricing");

const DEFAULT_NEARBY_DRIVER_LIMIT = 50;
const MAX_NEARBY_DRIVER_LIMIT = 100;

function clampNearbyDriverLimit(value) {
    const limit = Number.parseInt(value, 10);
    if (!Number.isFinite(limit)) return DEFAULT_NEARBY_DRIVER_LIMIT;
    return Math.min(MAX_NEARBY_DRIVER_LIMIT, Math.max(1, limit));
}

async function findNearbyAvailableDrivers({
    location,
    radiusKm = 5,
    limit = DEFAULT_NEARBY_DRIVER_LIMIT,
    carpoolOnly = false,
    populateUser = false
}) {
    const nearFilter = nearGeoLocationFilter(location, radiusKm);
    if (!nearFilter) return [];

    const filter = {
        status: "available",
        isVerified: true,
        geoLocation: nearFilter
    };
    if (carpoolOnly) filter.acceptsCarpoolRides = true;

    let query = DriverProfile.find(filter).limit(clampNearbyDriverLimit(limit));
    if (populateUser) query = query.populate("userId", "fullName");

    const drivers = await query;
    return drivers.map(driver => ({
        driver,
        distanceKm: Math.round(haversineKm(location, driver.currentLocation) * 10) / 10
    }));
}

module.exports = {
    clampNearbyDriverLimit,
    findNearbyAvailableDrivers
};
