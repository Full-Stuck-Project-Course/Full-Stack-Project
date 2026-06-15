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

// Attach io to app so controllers can emit events
app.set("io", io);

io.on("connection", (socket) => {
    // Passenger & driver join ride room for real-time updates
    socket.on("join-ride", (rideId) => {
        socket.join(`ride:${rideId}`);
    });

    // Driver broadcasts location
    socket.on("driver-location", ({ rideId, lat, lng }) => {
        io.to(`ride:${rideId}`).emit("location-update", { lat, lng, timestamp: new Date() });
    });

    // In-ride chat
    socket.on("chat-message", ({ rideId, message, sender, senderName }) => {
        io.to(`ride:${rideId}`).emit("new-message", { message, sender, senderName, timestamp: new Date() });
    });

    // Driver joins their own room for ride requests notifications
    socket.on("join-driver", (driverId) => {
        socket.join(`driver:${driverId}`);
    });

    // Emergency SOS
    socket.on("sos", ({ rideId, lat, lng, userId }) => {
        io.emit("sos-alert", { rideId, lat, lng, userId, timestamp: new Date() });
        console.warn("🚨 SOS ALERT from ride:", rideId, "at", lat, lng);
    });

    socket.on("disconnect", () => {});
});

connectMongo().then(() => {
    server.listen(PORT, () => {
        console.log(`🚕 HailNow server running on port ${PORT}`);
    });
});
