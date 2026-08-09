const axios = require("axios");
const { calculateFare } = require("./pricing");

function isConfiguredGoogleMapsKey(key) {
    return Boolean(key) &&
        key !== "place_holder" &&
        !key.startsWith("your_") &&
        key !== "YOUR_GOOGLE_MAPS_API_KEY_HERE";
}

function getGoogleServerMapsApiKey(env = process.env) {
    return env.GOOGLE_SERVER_MAPS_API_KEY ||
        env.GOOGLE_MAPS_API_KEY ||
        "";
}

function coordinateParam(location) {
    return `${Number(location?.lat)},${Number(location?.lng)}`;
}

function routePricingError(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

async function getGoogleRouteMetrics({ origins, destinations, key }) {
    const { data } = await axios.get(
        "https://maps.googleapis.com/maps/api/distancematrix/json",
        {
            params: {
                origins,
                destinations,
                key,
                language: "he",
                mode: "driving"
            }
        }
    );

    if (data.status !== "OK") {
        throw routePricingError("Google Maps API error: " + data.status);
    }

    const element = data.rows[0]?.elements[0];
    if (!element || element.status !== "OK") {
        throw routePricingError("No route found between locations");
    }

    return {
        distanceKm: element.distance.value / 1000,
        durationMinutes: Math.ceil(element.duration.value / 60),
        distanceText: element.distance.text,
        durationText: element.duration.text
    };
}

async function calculateFareForRoute({
    pickupLocation,
    destinationLocation,
    origins,
    destinations,
    vehicleType = "regular",
    rideType = "ride",
    passengerCount = 1,
    env = process.env
}) {
    const key = getGoogleServerMapsApiKey(env);

    if (isConfiguredGoogleMapsKey(key)) {
        const route = await getGoogleRouteMetrics({
            origins: origins || coordinateParam(pickupLocation),
            destinations: destinations || coordinateParam(destinationLocation),
            key
        });

        return {
            source: "google",
            route,
            fare: calculateFare({
                pickupLocation,
                destinationLocation,
                vehicleType,
                rideType,
                passengerCount,
                distanceKm: route.distanceKm,
                durationMinutes: route.durationMinutes
            })
        };
    }

    return {
        source: "haversine",
        route: null,
        fare: calculateFare({
            pickupLocation,
            destinationLocation,
            vehicleType,
            rideType,
            passengerCount
        })
    };
}

module.exports = {
    calculateFareForRoute,
    getGoogleRouteMetrics,
    getGoogleServerMapsApiKey,
    isConfiguredGoogleMapsKey
};
