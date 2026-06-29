// server.js

require("dotenv").config();
const http   = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const app    = require("./app");
const connectMongo = require("./db/mongo");
const Ride = require("./db/models/Ride");
const PassengerProfile = require("./db/models/PassengerProfile");
const DriverProfile = require("./db/models/DriverProfile");
const { sameId } = require("./utils/authz");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "http://localhost:3000", methods: ["GET", "POST"] }
});

app.set("io", io);

io.use((socket, next) => {
    try {
        const authHeader = socket.handshake.headers?.authorization || "";
        const token = socket.handshake.auth?.token ||
            (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null);
        if (!token) return next(new Error("Authentication required"));
        socket.user = jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch {
        next(new Error("Invalid or expired token"));
    }
});

async function getSocketProfiles(socket) {
    const [passenger, driver] = await Promise.all([
        PassengerProfile.findOne({ userId: socket.user.userId }),
        DriverProfile.findOne({ userId: socket.user.userId })
    ]);
    return { passenger, driver };
}

async function canAccessRide(socket, rideId) {
    const ride = await Ride.findById(rideId);
    if (!ride) return { allowed: false, ride: null };
    if (socket.user.role === "admin") return { allowed: true, ride };

    const { passenger, driver } = await getSocketProfiles(socket);
    const allowed = (passenger && sameId(passenger._id, ride.passengerId)) ||
        (driver && sameId(driver._id, ride.driverId));
    return { allowed, ride, passenger, driver };
}

function socketError(socket, message) {
    socket.emit("socket-error", { error: message });
}

io.on("connection", (socket) => {
    socket.on("join-ride", async (rideId) => {
        const { allowed } = await canAccessRide(socket, rideId);
        if (!allowed) return socketError(socket, "Access denied");
        socket.join(`ride:${rideId}`);
    });

    socket.on("driver-location", async ({ rideId, lat, lng }) => {
        const { allowed, ride, driver } = await canAccessRide(socket, rideId);
        if (!allowed || (socket.user.role !== "admin" && (!driver || !sameId(driver._id, ride.driverId)))) {
            return socketError(socket, "Access denied");
        }
        io.to(`ride:${rideId}`).emit("location-update", { lat, lng, timestamp: new Date() });
    });

    socket.on("chat-message", async ({ rideId, message, senderName }) => {
        const { allowed } = await canAccessRide(socket, rideId);
        if (!allowed) return socketError(socket, "Access denied");
        io.to(`ride:${rideId}`).emit("new-message", {
            message,
            sender: socket.user.userId,
            senderName,
            timestamp: new Date()
        });
    });

    socket.on("join-driver", async (driverId) => {
        if (socket.user.role !== "admin") {
            const driver = await DriverProfile.findOne({ userId: socket.user.userId });
            if (!driver || !sameId(driver._id, driverId)) return socketError(socket, "Access denied");
        }
        socket.join(`driver:${driverId}`);
    });

    socket.on("sos", async ({ rideId, lat, lng }) => {
        const { allowed } = await canAccessRide(socket, rideId);
        if (!allowed) return socketError(socket, "Access denied");
        io.emit("sos-alert", { rideId, lat, lng, userId: socket.user.userId, timestamp: new Date() });
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

            const passenger = await PassengerProfile.findById(ride.passengerId);
            if (!passenger) continue;

            await Notification.create({
                userId: passenger.userId,
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

        const availableDrivers = await DriverProfile.find({ status: "available", isVerified: true });

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
