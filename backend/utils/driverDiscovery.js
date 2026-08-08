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

const MIN_DRIVER_RATING = 1;
const MAX_DRIVER_RATING = 5;

function normalizeMinRating(value) {
    const rating = Number(value);
    if (!Number.isFinite(rating) || rating <= MIN_DRIVER_RATING) return null;
    return Math.min(MAX_DRIVER_RATING, rating);
}

// What the passenger needs to bring or do, mapped onto the driver's own
// "no pets / no smoking / no food" settings from the driver dashboard. Only a
// true value constrains anything: "I don't need to bring a pet" must not
// exclude drivers who happen to allow pets.
const ALLOWANCE_TO_DRIVER_RULE = {
    pets: "vehicleConditions.noPets",
    smoking: "vehicleConditions.noSmoking",
    food: "vehicleConditions.noFood"
};

function normalizeAllowances(value = {}) {
    const requested = {};
    for (const key of Object.keys(ALLOWANCE_TO_DRIVER_RULE)) {
        if (value?.[key] === true || value?.[key] === "true") requested[key] = true;
    }
    return requested;
}

function allowanceFilter(allowances) {
    const filter = {};
    for (const [key, field] of Object.entries(ALLOWANCE_TO_DRIVER_RULE)) {
        // A driver qualifies when the matching restriction is off. Drivers saved
        // before the field existed have no value at all, so treat missing as
        // unrestricted rather than excluding them.
        if (allowances[key]) filter[field] = { $ne: true };
    }
    return filter;
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
    vehicleType = null,
    minRating = null,
    allowances = {}
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

    const requestedRating = normalizeMinRating(minRating);
    if (requestedRating) filter.ratingAverage = { $gte: requestedRating };

    Object.assign(filter, allowanceFilter(normalizeAllowances(allowances)));

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
    ALLOWANCE_TO_DRIVER_RULE,
    allowanceFilter,
    clampNearbyDriverLimit,
    findNearbyAvailableDrivers,
    normalizeAllowances,
    normalizeDriverGender,
    normalizeMinRating,
    normalizeVehicleType
};
