function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 100 } = {}) {
    const hits = new Map();

    return (req, res, next) => {
        const key = `${req.ip || req.socket?.remoteAddress || "unknown"}:${req.originalUrl.split("?")[0]}`;
        const now = Date.now();
        const current = hits.get(key) || { count: 0, resetAt: now + windowMs };

        if (current.resetAt <= now) {
            current.count = 0;
            current.resetAt = now + windowMs;
        }

        current.count += 1;
        hits.set(key, current);

        if (current.count > max) {
            res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
            return res.status(429).json({ error: "Too many requests. Please try again later." });
        }

        next();
    };
}

module.exports = createRateLimiter;
