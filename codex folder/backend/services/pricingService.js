const vehicleMultipliers = {
    regular: 1,
    comfort: 1.18,
    luxury: 1.55,
    van: 1.35
};

const trafficMultipliers = {
    low: 1,
    medium: 1.15,
    high: 1.45
};

function distanceKm(a, b) {
    const earthRadiusKm = 6371;
    const dLat = toRad(Number(b.lat) - Number(a.lat));
    const dLng = toRad(Number(b.lng) - Number(a.lng));
    const lat1 = toRad(Number(a.lat));
    const lat2 = toRad(Number(b.lat));
    const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(value) {
    return (value * Math.PI) / 180;
}

async function googleDistance(origin, destination) {
    if (!process.env.GOOGLE_MAPS_API_KEY) return null;

    const origins = `${origin.lat},${origin.lng}`;
    const destinations = `${destination.lat},${destination.lng}`;
    const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
    url.searchParams.set("origins", origins);
    url.searchParams.set("destinations", destinations);
    url.searchParams.set("mode", "driving");
    url.searchParams.set("departure_time", "now");
    url.searchParams.set("traffic_model", "best_guess");
    url.searchParams.set("key", process.env.GOOGLE_MAPS_API_KEY);

    try {
        const response = await fetch(url);
        const data = await response.json();
        const element = data.rows?.[0]?.elements?.[0];
        if (!element || element.status !== "OK") return null;

        return {
            distanceKm: element.distance.value / 1000,
            durationMinutes: Math.round((element.duration_in_traffic?.value || element.duration.value) / 60),
            source: "google_maps"
        };
    } catch {
        return null;
    }
}

function calculateQuote({
    driverLocation,
    pickupLocation,
    destinationLocation,
    passengerCount = 1,
    paymentSplitCount = 1,
    stopCount = 0,
    rideType = "ride",
    trafficLevel = "medium",
    vehicleType = "regular",
    tripDistance,
    driverDistance
}) {
    const tripKm = tripDistance?.distanceKm || distanceKm(pickupLocation, destinationLocation);
    const driverKm = driverDistance?.distanceKm || distanceKm(driverLocation || pickupLocation, pickupLocation);
    const durationMinutes = tripDistance?.durationMinutes || Math.max(8, Math.round(tripKm * 2.4));
    const carMultiplier = vehicleMultipliers[vehicleType] || 1;
    const trafficMultiplier = trafficMultipliers[trafficLevel] || 1;
    const carpoolDiscount = rideType === "carpool" ? 0.78 : 1;
    const stopFee = stopCount * 7;
    const base = 12 + tripKm * 4.2 + durationMinutes * 0.38 + driverKm * 1.3 + stopFee + 5;
    const finalPrice = Math.max(18, Math.round(base * carMultiplier * trafficMultiplier * carpoolDiscount));
    const splitCount = Math.max(1, Number(paymentSplitCount || passengerCount || 1));

    return {
        distanceKm: Number(tripKm.toFixed(1)),
        driverToPickupKm: Number(driverKm.toFixed(1)),
        estimatedDurationMinutes: durationMinutes,
        basePrice: Math.round(base),
        surgeMultiplier: trafficMultiplier,
        finalPrice,
        perPassengerPrice: Math.round(finalPrice / splitCount),
        cancellationFee: Math.round(finalPrice * 0.12),
        loyaltyPoints: Math.max(5, Math.round(finalPrice / 3)),
        bestDepartureTip: durationMinutes > 28
            ? "Leave 15 minutes earlier based on likely traffic."
            : "Current departure time looks good."
    };
}

async function estimateRidePrice(input) {
    const [tripDistance, driverDistance] = await Promise.all([
        googleDistance(input.pickupLocation, input.destinationLocation),
        input.driverLocation ? googleDistance(input.driverLocation, input.pickupLocation) : Promise.resolve(null)
    ]);

    return {
        ...calculateQuote({ ...input, tripDistance, driverDistance }),
        distanceSource: tripDistance?.source || "local_haversine"
    };
}

module.exports = {
    estimateRidePrice,
    distanceKm
};
