// server.js

require("dotenv").config();
const http   = require("http");
const { Server } = require("socket.io");
const app    = require("./app");
const connectMongo = require("./db/mongo");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] }
});

app.set("io", io);

io.on("connection", (socket) => {
    socket.on("join-ride", (rideId) => {
        socket.join(`ride:${rideId}`);
    });

    socket.on("driver-location", ({ rideId, lat, lng }) => {
        io.to(`ride:${rideId}`).emit("location-update", { lat, lng, timestamp: new Date() });
    });

    socket.on("chat-message", ({ rideId, message, sender, senderName }) => {
        io.to(`ride:${rideId}`).emit("new-message", { message, sender, senderName, timestamp: new Date() });
    });

    socket.on("join-driver", (driverId) => {
        socket.join(`driver:${driverId}`);
    });

    socket.on("sos", ({ rideId, lat, lng, userId }) => {
        io.emit("sos-alert", { rideId, lat, lng, userId, timestamp: new Date() });
        console.warn("🚨 SOS ALERT from ride:", rideId, "at", lat, lng);
    });

    socket.on("disconnect", () => {});
});

// Auto-cancel rides after 30 minutes with no activity
async function autoCancelStaleRides() {
    try {
        const Ride = require("./db/models/Ride");
        const Notification = require("./db/models/Notification");
        const cutoff = new Date(Date.now() - 30 * 60 * 1000);

        const staleRides = await Ride.find({
            status: "searching",
            createdAt: { $lt: cutoff },
            $or: [
                { scheduledTime: null },
                { scheduledTime: { $lt: new Date() } }
            ]
        });

        for (const ride of staleRides) {
            ride.status = "cancelled";
            ride.cancelledBy = "system";
            ride.cancellationReason = "בוטלה אוטומטית - לא נמצא נהג תוך 30 דקות";
            ride.cancelledAt = new Date();
            await ride.save();

            await Notification.create({
                userId: ride.passengerId,
                type: "ride_cancelled",
                title: "הנסיעה בוטלה",
                body: "הנסיעה בוטלה אוטומטית כי לא נמצא נהג תוך 30 דקות. אנא נסה שוב.",
                rideId: ride._id
            });

            io.to(`ride:${ride._id}`).emit("ride-cancelled", {
                rideId: ride._id,
                reason: "auto_timeout"
            });
        }

        if (staleRides.length > 0) {
            console.log(`🕐 Auto-cancelled ${staleRides.length} stale rides`);
        }
    } catch (err) {
        console.error("Auto-cancel error:", err.message);
    }
}

// Notify nearby drivers about new ride requests
async function notifyNearbyDrivers() {
    try {
        const Ride = require("./db/models/Ride");
        const DriverProfile = require("./db/models/DriverProfile");

        const recentRides = await Ride.find({
            status: "searching",
            createdAt: { $gte: new Date(Date.now() - 20 * 1000) },
            $or: [
                { scheduledTime: null },
                { scheduledTime: { $lte: new Date(Date.now() + 15 * 60 * 1000) } }
            ]
        });

        if (recentRides.length === 0) return;

        const availableDrivers = await DriverProfile.find({ status: "available" });

        for (const ride of recentRides) {
            if (!ride.pickupLocation?.lat) continue;
            for (const driver of availableDrivers) {
                if (!driver.currentLocation?.lat) continue;
                const dlat = driver.currentLocation.lat - ride.pickupLocation.lat;
                const dlng = driver.currentLocation.lng - ride.pickupLocation.lng;
                const distKm = Math.sqrt(dlat * dlat + dlng * dlng) * 111;

                if (distKm <= 5) {
                    io.to(`driver:${driver._id}`).emit("nearby-ride-request", {
                        rideId: ride._id,
                        pickup: ride.pickupLocation,
                        destination: ride.destinationLocation,
                        rideType: ride.rideType,
                        passengerCount: ride.passengerCount,
                        distanceFromDriver: Math.round(distKm * 10) / 10,
                        finalPrice: ride.finalPrice
                    });
                }
            }
        }
    } catch (err) {
        console.error("Notify drivers error:", err.message);
    }
}

connectMongo().then(() => {
    server.listen(PORT, () => {
        console.log(`🚕 HailNow server running on port ${PORT}`);
    });

    // Run auto-cancel every 5 minutes
    setInterval(autoCancelStaleRides, 5 * 60 * 1000);
    // Check for new rides to notify drivers every 20 seconds
    setInterval(notifyNearbyDrivers, 20 * 1000);
});
