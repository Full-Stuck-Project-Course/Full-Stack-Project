// app.js

const express = require("express");
const cors = require("cors");
const path = require("path");
const routes = require("./routes");
const uploadController = require("./controllers/uploadController");
const errorHandler = require("./middleware/errorHandler");
const { isAllowedOrigin } = require("./utils/corsOrigins");

const app = express();

// Hosted behind the platform's TLS terminator, so req.protocol and req.ip come
// from X-Forwarded-*. Without this, reset links are built as http:// and every
// visitor shares the proxy's IP in the rate limiter.
app.set("trust proxy", 1);

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    next();
});

app.use(cors({
    origin(origin, callback) {
        return callback(null, isAllowedOrigin(origin));
    },
    credentials: true
}));
app.use(express.json());

// Profile images are public; identity, license, and vehicle documents require authenticated routes.
// Uploads live in MongoDB rather than on disk, because the hosting tier is ephemeral.
app.get("/uploads/profiles/:filename", uploadController.getProfileImage);

app.get("/api/health", (req, res) => res.json({ status: "ok", uptime: process.uptime() }));

app.use("/api", routes);

// The built React app is served by this same process in production.
const frontendDist = path.join(__dirname, "..", "frontend", "dist");
app.use(express.static(frontendDist));

// Client-side routing uses pushState, so unknown non-API paths return index.html.
app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/uploads")) return next();
    res.sendFile(path.join(frontendDist, "index.html"));
});

app.use(errorHandler);

module.exports = app;
