const crypto = require("crypto");

const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_MAX = 100;
const DEFAULT_MAX_KEYS = 10_000;
const DEFAULT_REDIS_PREFIX = "hailnow:rate-limit";

function toPositiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function sanitizeRedisKey(prefix, key) {
    const hash = crypto.createHash("sha256").update(String(key)).digest("hex");
    return `${prefix}:${hash}`;
}

function defaultKeyGenerator(req) {
    const path = String(req.originalUrl || req.url || "/").split("?")[0] || "/";
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    return `${ip}:${path}`;
}

function createMemoryRateLimitStore({ maxKeys = DEFAULT_MAX_KEYS, now = Date.now } = {}) {
    const hits = new Map();
    const keyLimit = toPositiveInteger(maxKeys, DEFAULT_MAX_KEYS);

    function pruneExpired(currentTime = now()) {
        let pruned = 0;
        for (const [key, hit] of hits) {
            if (hit.resetAt <= currentTime) {
                hits.delete(key);
                pruned += 1;
            }
        }
        return pruned;
    }

    function evictOverflow() {
        let evicted = 0;
        while (hits.size > keyLimit) {
            const oldestKey = hits.keys().next().value;
            hits.delete(oldestKey);
            evicted += 1;
        }
        return evicted;
    }

    async function increment(key, windowMs) {
        const currentTime = now();
        pruneExpired(currentTime);

        let hit = hits.get(key);
        if (!hit || hit.resetAt <= currentTime) {
            hit = { count: 0, resetAt: currentTime + windowMs };
        } else {
            hits.delete(key);
        }

        hit.count += 1;
        hits.set(key, hit);
        evictOverflow();

        return { count: hit.count, resetAt: hit.resetAt };
    }

    return {
        increment,
        pruneExpired,
        reset() {
            hits.clear();
        },
        size() {
            return hits.size;
        }
    };
}

async function runRedisCommand(client, command, args) {
    if (typeof client.sendCommand === "function") {
        return client.sendCommand([command, ...args.map(String)]);
    }

    const methods = {
        INCR: "incr",
        PTTL: "pTTL",
        PEXPIRE: "pExpire"
    };
    const method = methods[command];
    if (!method || typeof client[method] !== "function") {
        throw new Error(`Redis client does not support ${command}`);
    }

    return client[method](...args);
}

function createRedisRateLimitStore({
    redisUrl,
    prefix = DEFAULT_REDIS_PREFIX,
    createClient,
    logger = console,
    now = Date.now
} = {}) {
    if (!redisUrl) throw new Error("redisUrl is required");

    let client;
    let ready;

    async function getClient() {
        if (!client) {
            const redisClientFactory = createClient || require("redis").createClient;
            client = redisClientFactory({ url: redisUrl });
            client.on?.("error", error => logger.error?.("Rate-limit Redis error:", error.message));
        }

        if (!ready) {
            ready = (typeof client.connect === "function" ? client.connect() : Promise.resolve())
                .then(() => client)
                .catch(error => {
                    ready = null;
                    throw error;
                });
        }

        return ready;
    }

    return {
        async increment(key, windowMs) {
            const redis = await getClient();
            const redisKey = sanitizeRedisKey(prefix, key);
            const count = Number(await runRedisCommand(redis, "INCR", [redisKey]));
            let ttlMs = Number(await runRedisCommand(redis, "PTTL", [redisKey]));

            if (count === 1 || ttlMs < 0) {
                await runRedisCommand(redis, "PEXPIRE", [redisKey, windowMs]);
                ttlMs = windowMs;
            }

            return { count, resetAt: now() + Math.max(ttlMs, 0) };
        },
        async close() {
            if (!client) return;
            if (typeof client.quit === "function") {
                await client.quit();
            } else if (typeof client.disconnect === "function") {
                await client.disconnect();
            }
        }
    };
}

function createConfiguredRateLimitStore({ env = process.env, logger = console } = {}) {
    const mode = String(env.RATE_LIMIT_STORE || "").trim().toLowerCase();
    const redisUrl = String(env.RATE_LIMIT_REDIS_URL || env.REDIS_URL || "").trim();

    if (mode === "redis" || (redisUrl && mode !== "memory")) {
        return createRedisRateLimitStore({ redisUrl, logger });
    }

    return createMemoryRateLimitStore({
        maxKeys: toPositiveInteger(env.RATE_LIMIT_MAX_KEYS, DEFAULT_MAX_KEYS)
    });
}

function createRateLimiter({
    windowMs = DEFAULT_WINDOW_MS,
    max = DEFAULT_MAX,
    keyGenerator = defaultKeyGenerator,
    store,
    failOpen = false,
    logger = console,
    now = Date.now
} = {}) {
    const limitWindowMs = toPositiveInteger(windowMs, DEFAULT_WINDOW_MS);
    const maxHits = toPositiveInteger(max, DEFAULT_MAX);
    const limiterStore = store || createConfiguredRateLimitStore({ logger });

    const limiter = async (req, res, next) => {
        try {
            const key = keyGenerator(req);
            const hit = await limiterStore.increment(key, limitWindowMs);

            if (hit.count > maxHits) {
                const retryAfterSeconds = Math.max(1, Math.ceil((hit.resetAt - now()) / 1000));
                res.setHeader("Retry-After", retryAfterSeconds);
                return res.status(429).json({ error: "Too many requests. Please try again later." });
            }

            return next();
        } catch (error) {
            logger.error?.("Rate limiter failed:", error.message);
            if (failOpen) return next();
            return res.status(503).json({ error: "Rate limiter unavailable. Please try again later." });
        }
    };

    limiter.store = limiterStore;
    limiter.close = () => limiterStore.close?.();
    limiter.reset = () => limiterStore.reset?.();

    return limiter;
}

module.exports = createRateLimiter;
module.exports.createConfiguredRateLimitStore = createConfiguredRateLimitStore;
module.exports.createMemoryRateLimitStore = createMemoryRateLimitStore;
module.exports.createRedisRateLimitStore = createRedisRateLimitStore;
module.exports.defaultKeyGenerator = defaultKeyGenerator;
