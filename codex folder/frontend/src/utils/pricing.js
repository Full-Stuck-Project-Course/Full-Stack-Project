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

export const sampleDrivers = [
    {
        id: "driver-1",
        name: "דניאל כהן",
        gender: "female",
        rating: 4.95,
        vehicleType: "comfort",
        vehicle: "Toyota Corolla",
        licensePlate: "302-45-601",
        languages: ["he", "en"],
        music: "ישראלי רגוע",
        hobby: "טיולים",
        location: { lat: 32.0809, lng: 34.7806 }
    },
    {
        id: "driver-2",
        name: "Noam Levi",
        gender: "male",
        rating: 4.82,
        vehicleType: "regular",
        vehicle: "Hyundai i20",
        licensePlate: "118-92-300",
        languages: ["he"],
        music: "פופ",
        hobby: "כדורגל",
        location: { lat: 32.0715, lng: 34.7894 }
    },
    {
        id: "driver-3",
        name: "Maya Green",
        gender: "female",
        rating: 4.99,
        vehicleType: "luxury",
        vehicle: "Tesla Model 3",
        licensePlate: "555-33-910",
        languages: ["en", "he"],
        music: "Jazz",
        hobby: "צילום",
        location: { lat: 32.0912, lng: 34.7701 }
    },
    {
        id: "driver-4",
        name: "איתי מזרחי",
        gender: "male",
        rating: 4.71,
        vehicleType: "van",
        vehicle: "Kia Carnival",
        licensePlate: "782-64-101",
        languages: ["he", "en"],
        music: "רוק קלאסי",
        hobby: "בישול",
        location: { lat: 32.0609, lng: 34.7728 }
    }
];

export function distanceKm(a, b) {
    const earthRadiusKm = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

    return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(value) {
    return (value * Math.PI) / 180;
}

export function sortDrivers(drivers, pickup, preference = "closest") {
    const withDistance = drivers.map(driver => ({
        ...driver,
        distanceToPickupKm: distanceKm(driver.location, pickup)
    }));

    return withDistance.sort((a, b) => {
        if (preference === "highest_rated") {
            return b.rating - a.rating || a.distanceToPickupKm - b.distanceToPickupKm;
        }
        return a.distanceToPickupKm - b.distanceToPickupKm || b.rating - a.rating;
    });
}

export function estimateRidePrice({
    driver,
    pickup,
    destination,
    passengerCount = 1,
    splitCount = 1,
    stopCount = 0,
    rideType = "ride",
    trafficLevel = "medium",
    vehicleType,
    googleTrip,
    googleDriverToPickup
}) {
    const tripKm = googleTrip?.distanceKm || distanceKm(pickup, destination);
    const driverKm = googleDriverToPickup?.distanceKm || distanceKm(driver.location, pickup);
    const durationMinutes = googleTrip?.durationMinutes || Math.max(8, Math.round(tripKm * 2.4));
    const vehicle = vehicleType || driver.vehicleType || "regular";
    const carMultiplier = vehicleMultipliers[vehicle] || 1;
    const trafficMultiplier = trafficMultipliers[trafficLevel] || 1;
    const carpoolDiscount = rideType === "carpool" ? 0.78 : 1;
    const stopFee = stopCount * 7;
    const serviceFee = 5;
    const driverPickupFee = driverKm * 1.3;
    const base = 12 + tripKm * 4.2 + durationMinutes * 0.38 + driverPickupFee + stopFee + serviceFee;
    const total = Math.max(18, base * carMultiplier * trafficMultiplier * carpoolDiscount);
    const roundedTotal = Math.round(total);
    const perPassenger = Math.max(1, Math.round(roundedTotal / Math.max(1, splitCount || passengerCount)));

    return {
        tripKm: Number(tripKm.toFixed(1)),
        driverKm: Number(driverKm.toFixed(1)),
        durationMinutes,
        trafficMultiplier,
        carMultiplier,
        total: roundedTotal,
        perPassenger,
        cancellationFee: Math.round(roundedTotal * 0.12),
        points: Math.max(5, Math.round(roundedTotal / 3)),
        bestDeparture: durationMinutes > 28 ? "כדאי לצאת 15 דקות מוקדם יותר לפי עומס צפוי" : "אפשר לצאת בזמן שתכננת"
    };
}

export function demandAlerts() {
    return [
        { area: "תחנת רכבת מרכז", level: "high", distanceKm: 1.1, message: "ביקוש גבוה, 8 בקשות ב-10 דקות" },
        { area: "נמל תל אביב", level: "medium", distanceKm: 2.8, message: "ביקוש בינוני, תעריף רגיל" },
        { area: "רמת החייל", level: "low", distanceKm: 5.4, message: "ביקוש נמוך, מומלץ להתקרב למרכז" }
    ];
}
