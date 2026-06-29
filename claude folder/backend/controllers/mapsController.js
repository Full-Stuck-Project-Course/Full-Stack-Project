// controllers/mapsController.js

const axios = require("axios");

const VEHICLE_RATES = {
    regular: { perKm: 2.8, perMin: 0.5, minimum: 15, label: "רגיל"     },
    comfort:  { perKm: 4.0, perMin: 0.7, minimum: 22, label: "קומפורט" },
    luxury:   { perKm: 6.5, perMin: 1.2, minimum: 40, label: "יוקרה"   },
    van:      { perKm: 5.0, perMin: 0.9, minimum: 30, label: "מיניוואן" }
};

function getLocalHour(date = new Date()) {
    const timeZone = process.env.APP_TIME_ZONE || "Asia/Jerusalem";
    return Number(new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "2-digit",
        hour12: false
    }).format(date));
}

function calcSurge() {
    const h = getLocalHour();
    if ((h >= 7 && h <= 9) || (h >= 16 && h <= 19)) return 1.5;
    if (h >= 23 || h <= 5) return 1.2;
    return 1.0;
}

// GET /api/maps/distance-price
async function getDistanceAndPrice(req, res) {
    try {
        const { origins, destinations, vehicleType = "regular", rideType = "ride", passengerCount = 1 } = req.query;

        if (!origins || !destinations) {
            return res.status(400).json({ error: "origins and destinations are required" });
        }

        const key = process.env.GOOGLE_MAPS_API_KEY;
        if (!key || key === "place_holder" || key.startsWith("your_")) {
            // Fallback: estimate based on straight-line distance if no key configured
            return res.status(200).json({
                distanceKm: 10,
                durationMinutes: 20,
                price: 55,
                surgeMultiplier: 1.0,
                breakdown: { base: 55, surge: 0 },
                note: "Google Maps API key not configured — using estimated values"
            });
        }

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
            return res.status(400).json({ error: "Google Maps API error: " + data.status });
        }

        const element = data.rows[0]?.elements[0];
        if (!element || element.status !== "OK") {
            return res.status(400).json({ error: "No route found between locations" });
        }

        const distanceKm      = element.distance.value / 1000;
        const durationMinutes = Math.ceil(element.duration.value / 60);

        const rate = VEHICLE_RATES[vehicleType] || VEHICLE_RATES.regular;
        const surge = calcSurge();

        let base = Math.max(
            rate.minimum,
            distanceKm * rate.perKm + durationMinutes * rate.perMin
        );

        // Carpool discount
        if (rideType === "carpool") base *= 0.65;

        const total = Math.ceil(base * surge);

        // Split payment info
        const perPerson = rideType === "carpool" ? Math.ceil(total / Math.max(1, Number(passengerCount))) : total;

        res.json({
            distanceKm:      Math.round(distanceKm * 10) / 10,
            durationMinutes,
            price:           total,
            pricePerPerson:  perPerson,
            surgeMultiplier: surge,
            breakdown: {
                base: Math.round(base),
                surgeBonus: Math.round(total - base)
            },
            distanceText:  element.distance.text,
            durationText:  element.duration.text
        });

    } catch (error) {
        res.status(500).json({ error: "Price calculation failed: " + error.message });
    }
}

// GET /api/maps/nearby-drivers
async function getNearbyDrivers(req, res) {
    try {
        const DriverProfile = require("../db/models/DriverProfile");
        const User = require("../db/models/User");

        const { lat, lng, radius = 10 } = req.query;

        const drivers = await DriverProfile.find({ status: "available", isVerified: true })
            .populate("userId", "fullName profileImage preferredLanguage");

        const nearby = drivers
            .filter(d => d.currentLocation?.lat && d.currentLocation?.lng)
            .map(d => {
                const dlat = d.currentLocation.lat - Number(lat);
                const dlng = d.currentLocation.lng - Number(lng);
                const dist = Math.sqrt(dlat * dlat + dlng * dlng) * 111;
                return { ...d.toObject(), distanceKm: Math.round(dist * 10) / 10 };
            })
            .filter(d => d.distanceKm <= Number(radius))
            .sort((a, b) => a.distanceKm - b.distanceKm);

        res.json(nearby);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// GET /api/maps/demand
async function getDemandInfo(req, res) {
    try {
        const Ride = require("../db/models/Ride");
        const { lat, lng } = req.query;

        const recentRides = await Ride.find({
            status: "searching",
            createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
            $or: [
                { scheduledTime: null },
                { scheduledTime: { $lte: new Date(Date.now() + 15 * 60 * 1000) } }
            ]
        });

        const h = getLocalHour();
        let demand = "medium";
        let message = "ביקוש בינוני באזורך";

        if (recentRides.length > 10 || (h >= 7 && h <= 9) || (h >= 16 && h <= 19)) {
            demand = "high";
            message = "ביקוש גבוה! כדאי לצאת לדרך עכשיו 🔥";
        } else if (recentRides.length < 2) {
            demand = "low";
            message = "ביקוש נמוך כרגע";
        }

        // Group requests by area for demand heatmap
        const demandAreas = {};
        for (const r of recentRides) {
            if (!r.pickupLocation?.lat) continue;
            const areaKey = `${(r.pickupLocation.lat).toFixed(2)},${(r.pickupLocation.lng).toFixed(2)}`;
            if (!demandAreas[areaKey]) demandAreas[areaKey] = { lat: r.pickupLocation.lat, lng: r.pickupLocation.lng, count: 0 };
            demandAreas[areaKey].count++;
        }

        const hotspots = Object.values(demandAreas).sort((a, b) => b.count - a.count);

        // Individual request locations for map markers
        const requestLocations = recentRides
            .filter(r => r.pickupLocation?.lat)
            .map(r => ({
                rideId: r._id,
                lat: r.pickupLocation.lat,
                lng: r.pickupLocation.lng,
                address: r.pickupLocation.address,
                destAddress: r.destinationLocation?.address,
                rideType: r.rideType,
                passengerCount: r.passengerCount,
                finalPrice: r.finalPrice,
                createdAt: r.createdAt
            }));

        res.json({
            demand,
            message,
            openRequests: recentRides.length,
            surgeMultiplier: calcSurge(),
            isRushHour: (h >= 7 && h <= 9) || (h >= 16 && h <= 19),
            hotspots,
            requestLocations
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// GET /api/maps/best-departure
async function getBestDeparture(req, res) {
    const h = getLocalHour();
    const suggestions = [];

    if (h >= 6 && h < 7)  suggestions.push({ time: "06:30", reason: "לפני פקק הבוקר" });
    if (h >= 7 && h <= 9)  suggestions.push({ time: "09:30", reason: "אחרי שעת הפקק" });
    if (h >= 15 && h < 16) suggestions.push({ time: "15:00", reason: "לפני פקק אחה\"צ" });
    if (h >= 16 && h <= 19) suggestions.push({ time: "20:00", reason: "אחרי שעת הפקק" });

    if (suggestions.length === 0) {
        suggestions.push({ time: "עכשיו", reason: "ביקוש נמוך, זמן טוב לנסוע" });
    }

    res.json({ suggestions, currentDemand: calcSurge() > 1.2 ? "high" : "normal" });
}

// GET /api/maps/price-prediction
async function getPricePrediction(req, res) {
    const surge = calcSurge();
    const h = getLocalHour();
    let cheaperSoon = false;
    let cheaperMessage = "";
    let minutesUntilCheaper = 0;

    if (surge > 1.0) {
        if (h === 9) { cheaperSoon = true; cheaperMessage = "עוד כ-10 דקות שעת הפקק תסתיים והמחיר ירד"; minutesUntilCheaper = 10; }
        if (h === 19) { cheaperSoon = true; cheaperMessage = "עוד כ-30 דקות המחיר צפוי לרדת"; minutesUntilCheaper = 30; }
        if (h === 8) { cheaperSoon = true; cheaperMessage = "עוד כ-60 דקות שעת הפקק תסתיים"; minutesUntilCheaper = 60; }
        if (h === 17) { cheaperSoon = true; cheaperMessage = "עוד כ-120 דקות המחיר צפוי לרדת"; minutesUntilCheaper = 120; }
    }

    res.json({ cheaperSoon, cheaperMessage, minutesUntilCheaper, currentSurge: surge });
}

// GET /api/maps/driver-eta
async function getDriverETA(req, res) {
    try {
        const { driverLat, driverLng, passengerLat, passengerLng } = req.query;
        const key = process.env.GOOGLE_MAPS_API_KEY;

        if (!key || key === "place_holder" || key.startsWith("your_") || key === "YOUR_GOOGLE_MAPS_API_KEY_HERE") {
            const dlat = Number(driverLat) - Number(passengerLat);
            const dlng = Number(driverLng) - Number(passengerLng);
            const distKm = Math.sqrt(dlat * dlat + dlng * dlng) * 111;
            const etaMin = Math.max(1, Math.round(distKm * 3));
            return res.json({ etaMinutes: etaMin, etaText: `כ-${etaMin} דקות`, distanceKm: Math.round(distKm * 10) / 10 });
        }

        const origins = `${driverLat},${driverLng}`;
        const destinations = `${passengerLat},${passengerLng}`;
        const { data } = await axios.get("https://maps.googleapis.com/maps/api/distancematrix/json", {
            params: { origins, destinations, key, language: "he", mode: "driving" }
        });

        const el = data.rows?.[0]?.elements?.[0];
        if (el?.status === "OK") {
            return res.json({
                etaMinutes: Math.ceil(el.duration.value / 60),
                etaText: el.duration.text,
                distanceKm: Math.round(el.distance.value / 100) / 10
            });
        }

        res.json({ etaMinutes: 10, etaText: "כ-10 דקות" });
    } catch (error) {
        res.json({ etaMinutes: 10, etaText: "כ-10 דקות" });
    }
}

module.exports = { getDistanceAndPrice, getNearbyDrivers, getDemandInfo, getBestDeparture, getPricePrediction, getDriverETA };
