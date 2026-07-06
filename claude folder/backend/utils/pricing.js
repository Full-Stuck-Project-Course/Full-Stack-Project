const VEHICLE_RATES = {
    regular: { perKm: 2.8, perMin: 0.5, minimum: 15, label: "רגיל" },
    comfort: { perKm: 4.0, perMin: 0.7, minimum: 22, label: "קומפורט" },
    luxury: { perKm: 6.5, perMin: 1.2, minimum: 40, label: "יוקרה" },
    van: { perKm: 5.0, perMin: 0.9, minimum: 30, label: "מיניוואן" }
};

function getLocalHour(date = new Date()) {
    const timeZone = process.env.APP_TIME_ZONE || "Asia/Jerusalem";
    return Number(new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        hour12: false
    }).format(date));
}

function calcSurge(date = new Date()) {
    const h = getLocalHour(date);
    if ((h >= 7 && h <= 9) || (h >= 16 && h <= 19)) return 1.5;
    if (h >= 23 || h <= 5) return 1.2;
    return 1.0;
}

function toNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function hasValidCoordinates(lat, lng) {
    const parsedLat = toNumber(lat);
    const parsedLng = toNumber(lng);
    return parsedLat !== null &&
        parsedLng !== null &&
        parsedLat >= -90 &&
        parsedLat <= 90 &&
        parsedLng >= -180 &&
        parsedLng <= 180 &&
        !(parsedLat === 0 && parsedLng === 0);
}

function haversineKm(a, b) {
    const lat1 = toNumber(a?.lat);
    const lng1 = toNumber(a?.lng);
    const lat2 = toNumber(b?.lat);
    const lng2 = toNumber(b?.lng);
    if (!hasValidCoordinates(lat1, lng1) || !hasValidCoordinates(lat2, lng2)) {
        return null;
    }

    const earthKm = 6371;
    const toRad = (deg) => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const s1 = Math.sin(dLat / 2) ** 2;
    const s2 = Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return earthKm * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

function estimateDurationMinutes(distanceKm) {
    if (!Number.isFinite(distanceKm)) return 0;
    return Math.max(1, Math.ceil(distanceKm * 3));
}

function calculateFare({
    pickupLocation,
    destinationLocation,
    vehicleType = "regular",
    rideType = "ride",
    passengerCount = 1,
    distanceKm,
    durationMinutes,
    date = new Date()
}) {
    const computedDistance = Number.isFinite(Number(distanceKm))
        ? Number(distanceKm)
        : haversineKm(pickupLocation, destinationLocation);
    if (!Number.isFinite(computedDistance) || computedDistance <= 0) {
        throw new Error("Valid pickup and destination coordinates are required");
    }

    const computedDuration = Number.isFinite(Number(durationMinutes))
        ? Math.max(1, Math.ceil(Number(durationMinutes)))
        : estimateDurationMinutes(computedDistance);

    const rate = VEHICLE_RATES[vehicleType] || VEHICLE_RATES.regular;
    const surgeMultiplier = calcSurge(date);

    let basePrice = Math.max(
        rate.minimum,
        computedDistance * rate.perKm + computedDuration * rate.perMin
    );

    if (rideType === "carpool") basePrice *= 0.65;

    const finalPrice = Math.ceil(basePrice * surgeMultiplier);
    const count = Math.max(1, Number(passengerCount) || 1);

    return {
        distanceKm: Math.round(computedDistance * 10) / 10,
        estimatedDurationMinutes: computedDuration,
        basePrice: Math.round(basePrice),
        surgeMultiplier,
        finalPrice,
        pricePerPerson: rideType === "carpool" ? Math.ceil(finalPrice / count) : finalPrice
    };
}

module.exports = {
    VEHICLE_RATES,
    getLocalHour,
    calcSurge,
    hasValidCoordinates,
    haversineKm,
    estimateDurationMinutes,
    calculateFare
};
