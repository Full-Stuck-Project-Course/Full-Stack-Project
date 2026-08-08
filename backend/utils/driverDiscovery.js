const DriverProfile = require("../db/models/DriverProfile");
const Vehicle = require("../db/models/Vehicle");
const { nearGeoLocationFilter } = require("./geoLocation");
const { haversineKm } = require("./pricing");

const DEFAULT_NEARBY_DRIVER_LIMIT = 50;
const MAX_NEARBY_DRIVER_LIMIT = 100;
const DRIVER_GENDERS = new Set(["male", "female"]);
const VEHICLE_TYPES = new Set(["regular", "comfort", "luxury", "van"]);

function clampNearbyDriverLimit(value) {
    const limit = Number.parseInt(value, 10);
    if (!Number.isFinite(limit)) return DEFAULT_NEARBY_DRIVER_LIMIT;
    return Math.min(MAX_NEARBY_DRIVER_LIMIT, Math.max(1, limit));
}

// Passenger preferences are optional; anything unrecognised means "no preference"
// rather than an error, so a stale or hand-edited query cannot hide every driver.
function normalizeDriverGender(value) {
    const gender = String(value || "").trim().toLowerCase();
    return DRIVER_GENDERS.has(gender) ? gender : null;
}

function normalizeVehicleType(value) {
    const vehicleType = String(value || "").trim().toLowerCase();
    return VEHICLE_TYPES.has(vehicleType) ? vehicleType : null;
}

// Vehicle type lives on Vehicle, not DriverProfile, so it has to be resolved to a
// set of driver ids before the geospatial query runs.
async function driverIdsWithVehicleType(vehicleType) {
    const vehicles = await Vehicle.find({ vehicleType, isActive: true }).select("driverId");
    return vehicles.map(vehicle => vehicle.driverId);
}

async function findNearbyAvailableDrivers({
    location,
    radiusKm = 5,
    limit = DEFAULT_NEARBY_DRIVER_LIMIT,
    carpoolOnly = false,
    populateUser = false,
    gender = null,
    vehicleType = null
}) {
    const nearFilter = nearGeoLocationFilter(location, radiusKm);
    if (!nearFilter) return [];

    const filter = {
        status: "available",
        isVerified: true,
        geoLocation: nearFilter
    };
    if (carpoolOnly) filter.acceptsCarpoolRides = true;

    const requestedGender = normalizeDriverGender(gender);
    if (requestedGender) filter.gender = requestedGender;

    const requestedVehicleType = normalizeVehicleType(vehicleType);
    if (requestedVehicleType) {
        const driverIds = await driverIdsWithVehicleType(requestedVehicleType);
        if (driverIds.length === 0) return [];
        filter._id = { $in: driverIds };
    }

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
    findNearbyAvailableDrivers,
    normalizeDriverGender,
    normalizeVehicleType
};
