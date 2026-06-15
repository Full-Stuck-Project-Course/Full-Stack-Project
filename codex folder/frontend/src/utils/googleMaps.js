let googleMapsPromise;

export function getGoogleMapsApiKey() {
    return process.env.REACT_APP_GOOGLE_MAPS_API_KEY || "";
}

export function loadGoogleMaps() {
    const apiKey = getGoogleMapsApiKey();
    if (!apiKey) return Promise.reject(new Error("Missing Google Maps API key"));
    if (window.google?.maps) return Promise.resolve(window.google.maps);
    if (googleMapsPromise) return googleMapsPromise;

    googleMapsPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve(window.google.maps);
        script.onerror = () => reject(new Error("Google Maps failed to load"));
        document.head.appendChild(script);
    });

    return googleMapsPromise;
}

export async function geocodeAddress(address, fallback) {
    if (!address.trim()) return fallback;

    try {
        const maps = await loadGoogleMaps();
        const geocoder = new maps.Geocoder();
        const result = await geocoder.geocode({ address });
        const location = result.results?.[0]?.geometry?.location;
        if (!location) return fallback;
        return { lat: location.lat(), lng: location.lng() };
    } catch {
        return fallback;
    }
}

export async function getDistanceMatrix(origin, destination) {
    try {
        const maps = await loadGoogleMaps();
        const service = new maps.DistanceMatrixService();
        const result = await service.getDistanceMatrix({
            origins: [origin],
            destinations: [destination],
            travelMode: maps.TravelMode.DRIVING,
            drivingOptions: {
                departureTime: new Date(),
                trafficModel: maps.TrafficModel.BEST_GUESS
            },
            unitSystem: maps.UnitSystem.METRIC
        });

        const element = result.rows?.[0]?.elements?.[0];
        if (!element || element.status !== "OK") return null;

        return {
            distanceKm: element.distance.value / 1000,
            durationMinutes: Math.round((element.duration_in_traffic?.value || element.duration.value) / 60)
        };
    } catch {
        return null;
    }
}
