// app.js

const express = require("express");
const cors = require("cors");
const path = require("path");
const routes = require("./routes");
const errorHandler = require("./middleware/errorHandler");
const { isAllowedOrigin } = require("./utils/corsOrigins");

const app = express();

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
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
app.use("/uploads/profiles", express.static(path.join(__dirname, "uploads", "profiles")));
app.use("/public", express.static(path.join(__dirname, "public")));

app.use("/api", routes);

app.get("/", (req, res) => res.json({ message: "HailNow API is running" }));

app.use(errorHandler);

module.exports = app;
