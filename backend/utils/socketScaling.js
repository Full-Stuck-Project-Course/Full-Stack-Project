function isTruthy(value) {
    return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function normalizeSocketAdapterConfig(env = process.env) {
    const redisUrl = String(env.SOCKET_IO_REDIS_URL || env.REDIS_URL || "").trim();
    return {
        redisUrl,
        requireRedis: isTruthy(env.REQUIRE_SOCKET_IO_REDIS)
    };
}

async function connectClient(client) {
    if (typeof client.connect === "function") {
        await client.connect();
    }
    return client;
}

async function quitClient(client) {
    if (typeof client.quit === "function") {
        await client.quit();
        return;
    }
    if (typeof client.disconnect === "function") {
        await client.disconnect();
    }
}

async function configureSocketIoAdapter(io, {
    env = process.env,
    logger = console,
    createRedisClient,
    createRedisAdapter
} = {}) {
    const config = normalizeSocketAdapterConfig(env);

    if (!config.redisUrl) {
        if (config.requireRedis) {
            throw new Error("REQUIRE_SOCKET_IO_REDIS is enabled but SOCKET_IO_REDIS_URL/REDIS_URL is not configured");
        }

        logger.warn?.("Socket.IO Redis adapter disabled; using in-memory adapter for this process.");
        return { enabled: false, reason: "redis_url_missing" };
    }

    const redisClientFactory = createRedisClient || require("redis").createClient;
    const adapterFactory = createRedisAdapter || require("@socket.io/redis-adapter").createAdapter;

    const pubClient = redisClientFactory({ url: config.redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on?.("error", error => logger.error?.("Socket.IO Redis publisher error:", error.message));
    subClient.on?.("error", error => logger.error?.("Socket.IO Redis subscriber error:", error.message));

    await Promise.all([connectClient(pubClient), connectClient(subClient)]);
    io.adapter(adapterFactory(pubClient, subClient));
    logger.info?.("Socket.IO Redis adapter enabled.");

    return {
        enabled: true,
        pubClient,
        subClient,
        async close() {
            await Promise.allSettled([quitClient(pubClient), quitClient(subClient)]);
        }
    };
}

module.exports = {
    configureSocketIoAdapter,
    normalizeSocketAdapterConfig
};
