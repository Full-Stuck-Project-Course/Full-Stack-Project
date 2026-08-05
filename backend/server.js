// server.js

require("dotenv").config();
const http   = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app    = require("./app");
const connectMongo = require("./db/mongo");
const Ride = require("./db/models/Ride");
const PassengerProfile = require("./db/models/PassengerProfile");
const DriverProfile = require("./db/models/DriverProfile");
const { sameId } = require("./utils/authz");
const { hasValidCoordinates, haversineKm } = require("./utils/pricing");
const { configuredOrigins, isAllowedOrigin } = require("./utils/corsOrigins");

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin(origin, callback) {
            return callback(null, isAllowedOrigin(origin));
        },
        methods: ["GET", "POST"]
    }
});

app.set("io", io);

const SOCKET_RATE_LIMIT = {
    windowMs: Number(process.env.SOCKET_RATE_WINDOW_MS || 10_000),
    max: Number(process.env.SOCKET_RATE_MAX_EVENTS || 80)
};

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

function isValidObjectId(id) {
    return mongoose.Types.ObjectId.isValid(id);
}

function safeSocketHandler(socket, handler) {
    return async (...args) => {
        try {
            const now = Date.now();
            const rate = socket.data.rateLimit || { startedAt: now, count: 0 };
            if (now - rate.startedAt > SOCKET_RATE_LIMIT.windowMs) {
                rate.startedAt = now;
                rate.count = 0;
            }
            rate.count += 1;
            socket.data.rateLimit = rate;
            if (rate.count > SOCKET_RATE_LIMIT.max) {
                return socketError(socket, "Too many socket events");
            }
            await handler(...args);
        } catch (error) {
            socketError(socket, error.message || "Socket request failed");
        }
    };
}

io.on("connection", (socket) => {
    socket.data.userId = String(socket.user.userId);
    socket.data.role = socket.user.role;
    socket.join(`user:${socket.data.userId}`);

    if (socket.user.role === "admin") {
        socket.join("admins");
    }

    socket.on("join-ride", safeSocketHandler(socket, async (rideId) => {
        if (!isValidObjectId(rideId)) return socketError(socket, "Invalid ride ID");
        const { allowed } = await canAccessRide(socket, rideId);
        if (!allowed) return socketError(socket, "Access denied");
        socket.join(`ride:${rideId}`);
    }));

    socket.on("driver-location", safeSocketHandler(socket, async ({ rideId, lat, lng }) => {
        if (!isValidObjectId(rideId)) return socketError(socket, "Invalid ride ID");
        if (!hasValidCoordinates(lat, lng)) return socketError(socket, "Invalid driver location");
        const { allowed, ride, driver } = await canAccessRide(socket, rideId);
        if (!allowed || (socket.user.role !== "admin" && (!driver || !sameId(driver._id, ride.driverId)))) {
            return socketError(socket, "Access denied");
        }
        io.to(`ride:${rideId}`).emit("location-update", { lat: Number(lat), lng: Number(lng), timestamp: new Date() });
    }));

    socket.on("chat-message", safeSocketHandler(socket, async ({ rideId, message, senderName }) => {
        if (!isValidObjectId(rideId)) return socketError(socket, "Invalid ride ID");
        const cleanMessage = String(message || "").trim().slice(0, 1000);
        if (!cleanMessage) return socketError(socket, "Message is required");
        const { allowed } = await canAccessRide(socket, rideId);
        if (!allowed) return socketError(socket, "Access denied");
        io.to(`ride:${rideId}`).emit("new-message", {
            message: cleanMessage,
            sender: socket.user.userId,
            senderName: String(senderName || "משתמש").slice(0, 80),
            timestamp: new Date()
        });
    }));

    socket.on("join-driver", safeSocketHandler(socket, async (driverId) => {
        if (!isValidObjectId(driverId)) return socketError(socket, "Invalid driver ID");
        if (socket.user.role !== "admin") {
            const driver = await DriverProfile.findOne({ userId: socket.user.userId });
            if (!driver || !sameId(driver._id, driverId)) return socketError(socket, "Access denied");
        }
        socket.join(`driver:${driverId}`);
    }));

    socket.on("sos", safeSocketHandler(socket, async (payload = {}, acknowledge) => {
        const ack = typeof acknowledge === "function" ? acknowledge : null;
        const reject = (message) => {
            if (ack) ack({ ok: false, error: message });
            return socketError(socket, message);
        };
        const { rideId, lat, lng } = payload;

        if (!isValidObjectId(rideId)) return reject("Invalid ride ID");
        if (!hasValidCoordinates(lat, lng)) return reject("Invalid SOS location");
        const { allowed, ride } = await canAccessRide(socket, rideId);
        if (!allowed) return reject("Access denied");

        const senderUserId = socket.data.userId;
        const [passengerProfile, driverProfile] = await Promise.all([
            PassengerProfile.findById(ride.passengerId).select("userId"),
            ride.driverId ? DriverProfile.findById(ride.driverId).select("userId") : null
        ]);

        const alert = {
            rideId,
            lat: Number(lat),
            lng: Number(lng),
            userId: senderUserId,
            timestamp: new Date()
        };
        const targetRooms = new Set([`ride:${rideId}`, "admins"]);
        if (ride.driverId) targetRooms.add(`driver:${ride.driverId}`);
        if (passengerProfile?.userId) targetRooms.add(`user:${passengerProfile.userId}`);
        if (driverProfile?.userId) targetRooms.add(`user:${driverProfile.userId}`);

        let targetQuery = io;
        for (const room of targetRooms) {
            targetQuery = targetQuery.to(room);
        }
        const recipients = (await targetQuery.fetchSockets())
            .filter(targetSocket => (
                targetSocket.id !== socket.id &&
                String(targetSocket.data?.userId || "") !== senderUserId
            ));

        recipients.forEach(targetSocket => targetSocket.emit("sos-alert", alert));
        if (ack) ack({ ok: true, recipientCount: recipients.length });
        console.warn("SOS ALERT from ride:", rideId, "at", lat, lng, "recipients:", recipients.length);
    }));

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
            ride.cancelledAt = new Date();
            ride.cancellationReason = "בוטלה אוטומטית - לא נמצא נהג תוך 30 דקות";
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
            if (!hasValidCoordinates(ride.pickupLocation?.lat, ride.pickupLocation?.lng)) continue;
            for (const driver of availableDrivers) {
                if (ride.rideType === "carpool" && !driver.acceptsCarpoolRides) continue;
                if (!hasValidCoordinates(driver.currentLocation?.lat, driver.currentLocation?.lng)) continue;
                const distKm = haversineKm(driver.currentLocation, ride.pickupLocation);

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
        console.log(`HailNow server running on port ${PORT}`);
        console.log(`Allowed origins: ${configuredOrigins().join(", ")}`);
    });

    // Run auto-cancel every 5 minutes
    setInterval(autoCancelStaleRides, 5 * 60 * 1000);
    // Check for new rides to notify drivers every 20 seconds
    setInterval(notifyNearbyDrivers, 20 * 1000);
});
