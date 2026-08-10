// server.js

require("dotenv").config();
const http   = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const { getSessionUserFromToken } = require("./utils/authSession");
const { validateJwtSecretForStartup } = require("./utils/jwtConfig");
const app    = require("./app");
const connectMongo = require("./db/mongo");
const Ride = require("./db/models/Ride");
const CarpoolRequest = require("./db/models/CarpoolRequest");
const Notification = require("./db/models/Notification");
const PassengerProfile = require("./db/models/PassengerProfile");
const DriverProfile = require("./db/models/DriverProfile");
const { sameId } = require("./utils/authz");
const { hasValidCoordinates } = require("./utils/pricing");
const { configuredOrigins, isAllowedOrigin } = require("./utils/corsOrigins");
const { findNearbyAvailableDrivers } = require("./utils/driverDiscovery");
const { expiredCarpoolRequestFilter, expiredRideFilter } = require("./utils/bookingExpiry");
const {
    getDriverDisconnectGraceMs,
    staleAvailableDriverFilter
} = require("./utils/driverPresence");
const { configureSocketIoAdapter } = require("./utils/socketScaling");
const {
    createInstanceId,
    shouldRunScheduledTasks,
    startClusterSafeInterval
} = require("./utils/distributedLease");

validateJwtSecretForStartup();

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

io.use(async (socket, next) => {
    try {
        const authHeader = socket.handshake.headers?.authorization || "";
        const token = socket.handshake.auth?.token ||
            (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null);
        if (!token) return next(new Error("Authentication required"));
        socket.user = await getSessionUserFromToken(token);
        next();
    } catch (error) {
        next(new Error(error.statusCode === 403 ? error.message : "Invalid or expired token"));
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

async function getDriverForSocket(socket, driverId) {
    if (!isValidObjectId(driverId)) return null;
    if (socket.user.role === "admin") return DriverProfile.findById(driverId);

    const driver = await DriverProfile.findOne({ userId: socket.user.userId });
    return driver && sameId(driver._id, driverId) ? driver : null;
}

async function touchDriverActivity(driverId, date = new Date()) {
    return DriverProfile.findByIdAndUpdate(
        driverId,
        { $set: { lastActiveAt: date } },
        { new: true }
    );
}

function rememberDriverSocket(socket, driver) {
    socket.data.driverId = String(driver._id);
    socket.data.driverUserId = String(driver.userId?._id || driver.userId);
}

async function hasDriverOwnerSocket(driverId, driverUserId) {
    const sockets = await io.in(`driver:${driverId}`).fetchSockets();
    return sockets.some(activeSocket => (
        String(activeSocket.data?.driverId || "") === String(driverId) &&
        String(activeSocket.data?.userId || "") === String(driverUserId)
    ));
}

async function getConnectedDriverIds() {
    const sockets = await io.fetchSockets();
    return [...new Set(
        sockets
            .map(socket => socket.data?.driverId)
            .filter(Boolean)
            .map(String)
    )];
}

function scheduleDriverOfflineIfDisconnected(driverId, driverUserId) {
    const timer = setTimeout(async () => {
        try {
            if (await hasDriverOwnerSocket(driverId, driverUserId)) return;
            await DriverProfile.findOneAndUpdate(
                { _id: driverId, status: "available" },
                { $set: { status: "offline" } }
            );
        } catch (error) {
            console.error("Could not mark disconnected driver offline:", error.message);
        }
    }, getDriverDisconnectGraceMs());
    timer.unref?.();
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
        const driver = await getDriverForSocket(socket, driverId);
        if (!driver) return socketError(socket, isValidObjectId(driverId) ? "Access denied" : "Invalid driver ID");

        socket.join(`driver:${driverId}`);
        if (sameId(driver.userId, socket.user.userId)) {
            rememberDriverSocket(socket, driver);
            await touchDriverActivity(driver._id);
        }
    }));

    socket.on("driver-heartbeat", safeSocketHandler(socket, async ({ driverId } = {}) => {
        if (!isValidObjectId(driverId)) return socketError(socket, "Invalid driver ID");

        const driver = await DriverProfile.findOne({ userId: socket.user.userId });
        if (!driver || !sameId(driver._id, driverId)) return socketError(socket, "Access denied");

        socket.join(`driver:${driver._id}`);
        rememberDriverSocket(socket, driver);
        await touchDriverActivity(driver._id);
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

    socket.on("disconnect", () => {
        if (socket.data.driverId && socket.data.driverUserId) {
            scheduleDriverOfflineIfDisconnected(socket.data.driverId, socket.data.driverUserId);
        }
    });
});

// Cancel rides no driver approved within 30 minutes of the time the passenger
// asked to travel. A scheduled ride is measured from its scheduled time, so
// booking next week's ride today does not make it stale today.
async function autoCancelStaleRides(date = new Date()) {
    try {
        const staleRides = await Ride.find(expiredRideFilter(date));

        for (const ride of staleRides) {
            ride.status = "cancelled";
            ride.cancelledBy = "system";
            ride.cancelledAt = new Date();
            ride.cancellationReason = "בוטלה אוטומטית - נהג לא אישר את הנסיעה תוך 30 דקות מהמועד המבוקש";
            await ride.save();

            await settleCarpoolSeatsForCancelledRide(ride);

            const passenger = await PassengerProfile.findById(ride.passengerId);
            if (passenger) {
                await Notification.create({
                    userId: passenger.userId,
                    type: "ride_cancelled",
                    title: "הנסיעה בוטלה",
                    body: "הנסיעה בוטלה אוטומטית כי אף נהג לא אישר אותה תוך 30 דקות מהמועד המבוקש. אפשר להזמין נסיעה חדשה.",
                    rideId: ride._id
                });
            }

            io.to(`ride:${ride._id}`).emit("ride-cancelled", {
                rideId: ride._id,
                reason: "auto_timeout"
            });
        }

        if (staleRides.length > 0) {
            console.log(`🕐 Auto-cancelled ${staleRides.length} stale rides`);
        }
        return staleRides;
    } catch (err) {
        console.error("Auto-cancel error:", err.message);
        return [];
    }
}

// A cancelled carpool ride must release the riders who joined it, or they keep
// holding their one active booking.
async function settleCarpoolSeatsForCancelledRide(ride) {
    if (ride.rideType !== "carpool") return;
    try {
        await CarpoolRequest.updateMany(
            { rideId: ride._id, status: { $in: ["matched", "confirmed"] } },
            { status: "cancelled" }
        );
    } catch (err) {
        console.error("Could not release carpool seats:", err.message);
    }
}

// The same 30-minute rule for carpool passengers still waiting in the queue.
// Once a driver has approved one it belongs to a ride and expires with it.
async function autoCancelStaleCarpoolRequests(date = new Date()) {
    try {
        const staleRequests = await CarpoolRequest.find(expiredCarpoolRequestFilter(date));

        for (const request of staleRequests) {
            const cancelled = await CarpoolRequest.findOneAndUpdate(
                { _id: request._id, status: "pending" },
                { status: "cancelled" },
                { new: true }
            );
            if (!cancelled) continue;

            const passenger = await PassengerProfile.findById(request.passengerId);
            if (!passenger) continue;

            await Notification.create({
                userId: passenger.userId,
                type: "ride_cancelled",
                title: "בקשת הקרפול בוטלה",
                body: "בקשת הקרפול בוטלה אוטומטית כי אף נהג לא אישר אותה תוך 30 דקות מהמועד המבוקש. אפשר לשלוח בקשה חדשה.",
                rideId: null
            });
        }

        if (staleRequests.length > 0) {
            console.log(`🕐 Auto-cancelled ${staleRequests.length} stale carpool requests`);
        }
        return staleRequests;
    } catch (err) {
        console.error("Carpool auto-cancel error:", err.message);
        return [];
    }
}

// Notify nearby drivers about new ride requests
async function notifyNearbyDrivers() {
    try {
        const recentRides = await Ride.find({
            status: "searching",
            createdAt: { $gte: new Date(Date.now() - 20 * 1000) },
            $or: [
                { scheduledTime: null },
                { scheduledTime: { $lte: new Date(Date.now() + 15 * 60 * 1000) } }
            ]
        });

        if (recentRides.length === 0) return;

        for (const ride of recentRides) {
            if (!hasValidCoordinates(ride.pickupLocation?.lat, ride.pickupLocation?.lng)) continue;
            // Honour the passenger's matching preferences so drivers are not
            // offered rides that acceptRide would refuse.
            const nearbyDrivers = await findNearbyAvailableDrivers({
                location: ride.pickupLocation,
                radiusKm: ride.maxDriverDistanceKm || 5,
                carpoolOnly: ride.rideType === "carpool",
                gender: ride.preferredDriverGender,
                vehicleType: ride.vehicleType,
                minRating: ride.minDriverRating,
                allowances: ride.requiredAllowances,
                limit: process.env.NEARBY_DRIVER_NOTIFY_LIMIT || 100
            });

            for (const { driver, distanceKm } of nearbyDrivers) {
                io.to(`driver:${driver._id}`).emit("nearby-ride-request", {
                    rideId: ride._id,
                    pickup: ride.pickupLocation,
                    destination: ride.destinationLocation,
                    rideType: ride.rideType,
                    passengerCount: ride.passengerCount,
                    distanceFromDriver: distanceKm,
                    finalPrice: ride.finalPrice
                });
            }
        }
    } catch (err) {
        console.error("Notify drivers error:", err.message);
    }
}

async function markStaleAvailableDriversOffline(date = new Date()) {
    try {
        const filter = staleAvailableDriverFilter(date);
        const connectedDriverIds = await getConnectedDriverIds();
        if (connectedDriverIds.length > 0) {
            filter._id = { $nin: connectedDriverIds };
        }

        const result = await DriverProfile.updateMany(
            filter,
            { $set: { status: "offline" } }
        );
        if (result.modifiedCount > 0) {
            console.log(`Marked ${result.modifiedCount} stale available drivers offline`);
        }
        return result;
    } catch (err) {
        console.error("Stale driver cleanup error:", err.message);
        return null;
    }
}

function startScheduledTasks() {
    if (!shouldRunScheduledTasks(process.env)) {
        console.log("Scheduled background tasks disabled by ENABLE_SCHEDULED_TASKS=false");
        return [];
    }

    const ownerId = createInstanceId(process.env);
    return [
        // Once a minute, so "30 minutes" is not rounded up by the sweep.
        startClusterSafeInterval({
            lockName: "auto-cancel-stale-rides",
            intervalMs: 60 * 1000,
            leaseTtlMs: 5 * 60 * 1000,
            task: autoCancelStaleRides,
            ownerId
        }),
        startClusterSafeInterval({
            lockName: "auto-cancel-stale-carpool-requests",
            intervalMs: 60 * 1000,
            leaseTtlMs: 5 * 60 * 1000,
            task: autoCancelStaleCarpoolRequests,
            ownerId
        }),
        startClusterSafeInterval({
            lockName: "notify-nearby-drivers",
            intervalMs: 20 * 1000,
            leaseTtlMs: 60 * 1000,
            task: notifyNearbyDrivers,
            ownerId
        }),
        startClusterSafeInterval({
            lockName: "mark-stale-available-drivers-offline",
            intervalMs: 60 * 1000,
            leaseTtlMs: 2 * 60 * 1000,
            task: markStaleAvailableDriversOffline,
            ownerId
        })
    ];
}

function formatListenError(error, port) {
    if (error?.code === "EADDRINUSE") {
        return `Port ${port} is already in use. Close the existing backend with stop.bat, or run this backend with a different PORT.`;
    }
    return error?.message || String(error);
}

function listen(serverInstance, port) {
    return new Promise((resolve, reject) => {
        function cleanup() {
            serverInstance.off("error", onError);
            serverInstance.off("listening", onListening);
        }

        function onError(error) {
            cleanup();
            reject(error);
        }

        function onListening() {
            cleanup();
            resolve();
        }

        serverInstance.once("error", onError);
        serverInstance.once("listening", onListening);
        serverInstance.listen(port);
    });
}

async function startServer() {
    await connectMongo();
    await configureSocketIoAdapter(io, { env: process.env, logger: console });

    await listen(server, PORT);
    console.log(`HailNow server running on port ${PORT}`);
    console.log(`Allowed origins: ${configuredOrigins().join(", ")}`);

    startScheduledTasks();
}

if (require.main === module) {
    startServer().catch(error => {
        console.error("Server startup failed:", formatListenError(error, PORT));
        process.exit(1);
    });
}

module.exports = {
    autoCancelStaleCarpoolRequests,
    autoCancelStaleRides,
    io,
    markStaleAvailableDriversOffline,
    notifyNearbyDrivers,
    server,
    formatListenError,
    listen,
    startScheduledTasks,
    startServer
};
