// controllers/mapsController.js

const axios = require("axios");
const Ride = require("../db/models/Ride");
const {
    calcSurge,
    calculateFare,
    getLocalHour,
    hasValidCoordinates,
    haversineKm,
    estimateDurationMinutes
} = require("../utils/pricing");
const { forbidden, getDriverProfileForUser, getPassengerProfileForUser, isAdmin } = require("../utils/authz");
const { clampNearbyDriverLimit, findNearbyAvailableDrivers } = require("../utils/driverDiscovery");

function parseLatLng(value) {
    const [lat, lng] = String(value || "").split(",").map(Number);
    if (!hasValidCoordinates(lat, lng)) return null;
    return { lat, lng };
}

function roundCoordinate(value) {
    return Math.round(Number(value) * 1000) / 1000;
}

function clampRadius(value) {
    const radius = Number(value);
    if (!Number.isFinite(radius)) return 10;
    return Math.min(25, Math.max(1, radius));
}

// GET /api/maps/distance-price
async function getDistanceAndPrice(req, res) {
    try {
        const { origins, destinations, vehicleType = "regular", rideType = "ride", passengerCount = 1 } = req.query;

        if (!origins || !destinations) {
            return res.status(400).json({ error: "origins and destinations are required" });
        }

        const pickupLocation = parseLatLng(origins);
        const destinationLocation = parseLatLng(destinations);
        if (!pickupLocation || !destinationLocation) {
            return res.status(400).json({ error: "Valid coordinate origins and destinations are required" });
        }

        let fare;
        let distanceText;
        let durationText;
        const key = process.env.GOOGLE_MAPS_API_KEY;

        if (key && key !== "place_holder" && !key.startsWith("your_") && key !== "YOUR_GOOGLE_MAPS_API_KEY_HERE") {
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

            const distanceKm = element.distance.value / 1000;
            const durationMinutes = Math.ceil(element.duration.value / 60);
            fare = calculateFare({
                pickupLocation,
                destinationLocation,
                vehicleType,
                rideType,
                passengerCount,
                distanceKm,
                durationMinutes
            });
            distanceText = element.distance.text;
            durationText = element.duration.text;
        } else {
            fare = calculateFare({ pickupLocation, destinationLocation, vehicleType, rideType, passengerCount });
            distanceText = `${fare.distanceKm} ק"מ`;
            durationText = `${fare.estimatedDurationMinutes} דקות`;
        }

        res.json({
            distanceKm: fare.distanceKm,
            durationMinutes: fare.estimatedDurationMinutes,
            price: fare.finalPrice,
            pricePerPerson: fare.pricePerPerson,
            surgeMultiplier: fare.surgeMultiplier,
            breakdown: {
                base: fare.basePrice,
                surgeBonus: Math.round(fare.finalPrice - fare.basePrice)
            },
            distanceText,
            durationText
        });

    } catch (error) {
        res.status(500).json({ error: "Price calculation failed: " + error.message });
    }
}

// GET /api/maps/nearby-drivers
async function getNearbyDrivers(req, res) {
    try {
        if (!isAdmin(req)) {
            const passenger = await getPassengerProfileForUser(req.user.userId);
            if (!passenger) return forbidden(res, "Passenger access required");
        }
        const { lat, lng, radius = 10, limit } = req.query;
        if (!hasValidCoordinates(lat, lng)) {
            return res.status(400).json({ error: "Valid lat/lng are required" });
        }

        const origin = { lat: Number(lat), lng: Number(lng) };
        const maxRadius = clampRadius(radius);
        const nearbyDrivers = await findNearbyAvailableDrivers({
            location: origin,
            radiusKm: maxRadius,
            limit: clampNearbyDriverLimit(limit),
            populateUser: true
        });

        const nearby = nearbyDrivers.map(({ driver, distanceKm }) => ({
            _id: driver._id,
            userId: driver.userId,
            ratingAverage: driver.ratingAverage,
            totalRides: driver.totalRides,
            currentLocation: {
                lat: roundCoordinate(driver.currentLocation.lat),
                lng: roundCoordinate(driver.currentLocation.lng),
                updatedAt: driver.currentLocation.updatedAt
            },
            distanceKm
        }));

        res.json(nearby);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

// GET /api/maps/demand
async function getDemandInfo(req, res) {
    try {
        const driver = !isAdmin(req) ? await getDriverProfileForUser(req.user.userId) : null;
        if (!isAdmin(req) && !driver?.isVerified) {
            return forbidden(res, "Verified driver access required");
        }

        const filter = {
            status: "searching",
            createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) },
            $or: [
                { scheduledTime: null },
                { scheduledTime: { $lte: new Date(Date.now() + 15 * 60 * 1000) } }
            ]
        };
        if (driver && !driver.acceptsCarpoolRides) filter.rideType = { $ne: "carpool" };

        const recentRides = await Ride.find(filter);

        const h = getLocalHour();
        let demand = "medium";
        let message = "ביקוש בינוני באזורך";

        if (recentRides.length > 10 || (h >= 7 && h <= 9) || (h >= 16 && h <= 19)) {
            demand = "high";
            message = "ביקוש גבוה. כדאי לצאת לדרך עכשיו.";
        } else if (recentRides.length < 2) {
            demand = "low";
            message = "ביקוש נמוך כרגע";
        }

        const demandAreas = {};
        for (const r of recentRides) {
            if (!hasValidCoordinates(r.pickupLocation?.lat, r.pickupLocation?.lng)) continue;
            const areaKey = `${Number(r.pickupLocation.lat).toFixed(2)},${Number(r.pickupLocation.lng).toFixed(2)}`;
            if (!demandAreas[areaKey]) {
                demandAreas[areaKey] = {
                    lat: Number(Number(r.pickupLocation.lat).toFixed(2)),
                    lng: Number(Number(r.pickupLocation.lng).toFixed(2)),
                    count: 0
                };
            }
            demandAreas[areaKey].count++;
        }

        const hotspots = Object.values(demandAreas).sort((a, b) => b.count - a.count);
        const requestLocations = recentRides
            .filter(r => hasValidCoordinates(r.pickupLocation?.lat, r.pickupLocation?.lng))
            .map(r => ({
                rideId: r._id,
                lat: roundCoordinate(r.pickupLocation.lat),
                lng: roundCoordinate(r.pickupLocation.lng),
                rideType: r.rideType,
                passengerCount: r.passengerCount,
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

    if (h >= 6 && h < 7) suggestions.push({ time: "06:30", reason: "לפני פקק הבוקר" });
    if (h >= 7 && h <= 9) suggestions.push({ time: "09:30", reason: "אחרי שעת העומס" });
    if (h >= 15 && h < 16) suggestions.push({ time: "15:00", reason: "לפני עומס אחר הצהריים" });
    if (h >= 16 && h <= 19) suggestions.push({ time: "20:00", reason: "אחרי שעת העומס" });

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
        if (h === 9) { cheaperSoon = true; cheaperMessage = "עוד כ-10 דקות שעת העומס צפויה להסתיים והמחיר ירד"; minutesUntilCheaper = 10; }
        if (h === 19) { cheaperSoon = true; cheaperMessage = "עוד כ-30 דקות המחיר צפוי לרדת"; minutesUntilCheaper = 30; }
        if (h === 8) { cheaperSoon = true; cheaperMessage = "עוד כ-60 דקות שעת העומס צפויה להסתיים"; minutesUntilCheaper = 60; }
        if (h === 17) { cheaperSoon = true; cheaperMessage = "עוד כ-120 דקות המחיר צפוי לרדת"; minutesUntilCheaper = 120; }
    }

    res.json({ cheaperSoon, cheaperMessage, minutesUntilCheaper, currentSurge: surge });
}

// GET /api/maps/driver-eta
async function getDriverETA(req, res) {
    try {
        const { driverLat, driverLng, passengerLat, passengerLng } = req.query;
        if (!hasValidCoordinates(driverLat, driverLng) || !hasValidCoordinates(passengerLat, passengerLng)) {
            return res.status(400).json({ error: "Valid driver and passenger coordinates are required" });
        }

        const key = process.env.GOOGLE_MAPS_API_KEY;
        if (!key || key === "place_holder" || key.startsWith("your_") || key === "YOUR_GOOGLE_MAPS_API_KEY_HERE") {
            const distKm = haversineKm(
                { lat: Number(driverLat), lng: Number(driverLng) },
                { lat: Number(passengerLat), lng: Number(passengerLng) }
            );
            const etaMin = estimateDurationMinutes(distKm);
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

        return res.status(400).json({ error: "Could not calculate ETA" });
    } catch (error) {
        res.status(500).json({ error: "ETA calculation failed" });
    }
}

module.exports = { getDistanceAndPrice, getNearbyDrivers, getDemandInfo, getBestDeparture, getPricePrediction, getDriverETA };
