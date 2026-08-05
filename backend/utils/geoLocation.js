const { hasValidCoordinates } = require("./pricing");

function toGeoPoint(lat, lng) {
    if (!hasValidCoordinates(lat, lng)) return undefined;
    return {
        type: "Point",
        coordinates: [Number(lng), Number(lat)]
    };
}

function nearGeoLocationFilter(location, radiusKm) {
    const point = toGeoPoint(location?.lat, location?.lng);
    if (!point) return null;

    const radius = Number(radiusKm);
    const maxDistance = Math.round(Math.max(1, Number.isFinite(radius) ? radius : 5) * 1000);
    return {
        $near: {
            $geometry: point,
            $maxDistance: maxDistance
        }
    };
}

module.exports = {
    nearGeoLocationFilter,
    toGeoPoint
};
