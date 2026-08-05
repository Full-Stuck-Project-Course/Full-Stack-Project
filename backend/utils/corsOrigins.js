const DEFAULT_DEV_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
];

function configuredOrigins() {
    return (process.env.CORS_ORIGINS || DEFAULT_DEV_ORIGINS.join(","))
        .split(",")
        .map(origin => origin.trim())
        .filter(Boolean);
}

function isLocalDevOrigin(origin) {
    if (process.env.NODE_ENV === "production") return false;
    try {
        const url = new URL(origin);
        return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    } catch {
        return false;
    }
}

function isAllowedOrigin(origin) {
    // Requests from server-to-server clients, health checks, curl/Postman, and
    // native clients often do not include an Origin header. Authentication and
    // authorization are enforced separately, so no-Origin requests are allowed
    // intentionally rather than as a permissive browser CORS fallback.
    if (!origin) return true;
    return configuredOrigins().includes(origin) || isLocalDevOrigin(origin);
}

module.exports = {
    configuredOrigins,
    isAllowedOrigin
};
