const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
const rateLimitSource = fs.readFileSync(path.join(root, "middleware", "rateLimit.js"), "utf8");
const packageJson = require(path.join(root, "package.json"));

function assert(condition, message) {
    if (!condition) {
        console.error(message);
        process.exit(1);
    }
}

assert(
    packageJson.dependencies?.["@socket.io/redis-adapter"] && packageJson.dependencies?.redis,
    "Socket.IO scaling requires @socket.io/redis-adapter and redis dependencies."
);
assert(
    serverSource.includes("configureSocketIoAdapter"),
    "server.js must configure the Socket.IO Redis adapter hook."
);
assert(
    serverSource.includes("startClusterSafeInterval"),
    "server.js must schedule recurring jobs through cluster-safe leases."
);
assert(
    !/setInterval\s*\(\s*autoCancelStaleRides/.test(serverSource) &&
        !/setInterval\s*\(\s*notifyNearbyDrivers/.test(serverSource),
    "Recurring jobs must not be scheduled with direct setInterval task handlers."
);
assert(
    rateLimitSource.includes("pruneExpired") && rateLimitSource.includes("RATE_LIMIT_MAX_KEYS"),
    "rateLimit.js must evict expired entries and cap in-memory key growth."
);

console.log("Single-instance safety check passed: jobs, Socket.IO, and rate limiting are scale-aware.");
