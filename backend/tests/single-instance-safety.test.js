const test = require("node:test");
const assert = require("node:assert/strict");

const createRateLimiter = require("../middleware/rateLimit");
const {
    createMemoryRateLimitStore,
    createRedisRateLimitStore
} = require("../middleware/rateLimit");
const {
    acquireMongoLease,
    runWithMongoLease,
    shouldRunScheduledTasks,
    startClusterSafeInterval
} = require("../utils/distributedLease");
const {
    configureSocketIoAdapter,
    normalizeSocketAdapterConfig
} = require("../utils/socketScaling");

function makeReq(ip, originalUrl = "/api/users/login") {
    return {
        ip,
        originalUrl,
        socket: { remoteAddress: ip }
    };
}

function makeRes() {
    return {
        statusCode: 200,
        body: undefined,
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

async function callLimiter(limiter, req) {
    const res = makeRes();
    let nextCalls = 0;
    await limiter(req, res, () => {
        nextCalls += 1;
    });
    return { res, nextCalls };
}

test("memory rate limiter blocks repeated keys but evicts expired and overflow entries", async () => {
    let now = 1_000;
    const store = createMemoryRateLimitStore({ maxKeys: 2, now: () => now });
    const limiter = createRateLimiter({
        windowMs: 1_000,
        max: 1,
        store,
        now: () => now,
        logger: { error() {} }
    });

    const first = await callLimiter(limiter, makeReq("10.0.0.1"));
    const blocked = await callLimiter(limiter, makeReq("10.0.0.1"));

    assert.equal(first.nextCalls, 1);
    assert.equal(blocked.nextCalls, 0);
    assert.equal(blocked.res.statusCode, 429);
    assert.equal(blocked.res.headers["Retry-After"], 1);
    assert.equal(store.size(), 1);

    now = 3_000;
    await callLimiter(limiter, makeReq("10.0.0.2"));
    assert.equal(store.size(), 1, "expired entries should be pruned before new hits are recorded");

    await callLimiter(limiter, makeReq("10.0.0.3"));
    await callLimiter(limiter, makeReq("10.0.0.4"));
    assert.equal(store.size(), 2, "store should stay capped by maxKeys");

    const evictedOldKey = await callLimiter(limiter, makeReq("10.0.0.2"));
    assert.equal(evictedOldKey.nextCalls, 1, "oldest overflow key should have been evicted");
});

test("Redis rate limit store uses atomic increment and expiry", async () => {
    const commands = [];
    const fakeClient = {
        on() {},
        async connect() {},
        async sendCommand(args) {
            commands.push(args);
            if (args[0] === "INCR") return 1;
            if (args[0] === "PTTL") return -1;
            if (args[0] === "PEXPIRE") return "OK";
            throw new Error(`unexpected command ${args[0]}`);
        },
        async quit() {}
    };

    const store = createRedisRateLimitStore({
        redisUrl: "redis://localhost:6379",
        createClient: () => fakeClient,
        now: () => 5_000,
        logger: { error() {} }
    });

    const hit = await store.increment("10.0.0.1:/api/users/login", 15_000);

    assert.equal(hit.count, 1);
    assert.equal(hit.resetAt, 20_000);
    assert.deepEqual(commands.map(command => command[0]), ["INCR", "PTTL", "PEXPIRE"]);
});

test("Mongo lease runs only for the active owner and treats duplicate upserts as locked", async () => {
    const acquiredModel = {
        async findOneAndUpdate(filter, update, options) {
            assert.equal(filter._id, "notify-nearby-drivers");
            assert.equal(options.upsert, true);
            return {
                _id: filter._id,
                ownerId: update.$set.ownerId,
                expiresAt: update.$set.expiresAt
            };
        }
    };
    let ran = 0;

    const result = await runWithMongoLease({
        lockName: "notify-nearby-drivers",
        ttlMs: 60_000,
        ownerId: "replica-a",
        now: new Date("2026-08-05T00:00:00Z"),
        model: acquiredModel,
        task: async () => {
            ran += 1;
        }
    });

    assert.equal(result.ran, true);
    assert.equal(ran, 1);

    const lockedModel = {
        async findOneAndUpdate() {
            const error = new Error("E11000 duplicate key error collection");
            error.code = 11000;
            throw error;
        }
    };
    const locked = await acquireMongoLease({
        lockName: "notify-nearby-drivers",
        ttlMs: 60_000,
        ownerId: "replica-b",
        now: new Date("2026-08-05T00:00:00Z"),
        model: lockedModel
    });

    assert.deepEqual(locked, { acquired: false, reason: "locked" });
});

test("cluster-safe interval delegates each tick to a lease runner", async () => {
    let scheduled;
    let intervalMs;
    let unrefCalled = false;
    let cleared = false;
    let ran = 0;
    let leaseArgs;

    const handle = startClusterSafeInterval({
        lockName: "auto-cancel-stale-rides",
        intervalMs: 300_000,
        leaseTtlMs: 900_000,
        ownerId: "replica-a",
        task: async () => {
            ran += 1;
        },
        setIntervalFn(fn, ms) {
            scheduled = fn;
            intervalMs = ms;
            return { unref() { unrefCalled = true; } };
        },
        clearIntervalFn() {
            cleared = true;
        },
        runWithLease: async (args) => {
            leaseArgs = args;
            await args.task();
            return { ran: true };
        }
    });

    assert.equal(intervalMs, 300_000);
    assert.equal(unrefCalled, true);

    await scheduled();
    assert.equal(ran, 1);
    assert.equal(leaseArgs.lockName, "auto-cancel-stale-rides");
    assert.equal(leaseArgs.ttlMs, 900_000);
    assert.equal(leaseArgs.ownerId, "replica-a");

    handle.stop();
    assert.equal(cleared, true);
    assert.deepEqual(await handle.execute(), { ran: false, reason: "stopped" });
});

test("scheduled task switch can disable web-replica intervals", () => {
    assert.equal(shouldRunScheduledTasks({}), true);
    assert.equal(shouldRunScheduledTasks({ ENABLE_SCHEDULED_TASKS: "false" }), false);
});

test("Socket.IO Redis adapter is optional locally and configurable for replicas", async () => {
    const localConfig = normalizeSocketAdapterConfig({});
    assert.deepEqual(localConfig, { redisUrl: "", requireRedis: false });

    const disabled = await configureSocketIoAdapter({
        adapter() {
            throw new Error("adapter should not be configured without Redis");
        }
    }, {
        env: {},
        logger: { warn() {}, info() {}, error() {} }
    });
    assert.deepEqual(disabled, { enabled: false, reason: "redis_url_missing" });

    await assert.rejects(
        () => configureSocketIoAdapter({}, {
            env: { REQUIRE_SOCKET_IO_REDIS: "true" },
            logger: { warn() {}, info() {}, error() {} }
        }),
        /SOCKET_IO_REDIS_URL/
    );
});

test("Socket.IO Redis adapter connects pub/sub clients and installs the adapter", async () => {
    const connects = [];
    const quits = [];
    const subClient = {
        name: "sub",
        on() {},
        async connect() { connects.push(this.name); },
        async quit() { quits.push(this.name); }
    };
    const pubClient = {
        name: "pub",
        on() {},
        duplicate() { return subClient; },
        async connect() { connects.push(this.name); },
        async quit() { quits.push(this.name); }
    };
    let adapterValue;
    const io = {
        adapter(value) {
            adapterValue = value;
        }
    };

    const result = await configureSocketIoAdapter(io, {
        env: { SOCKET_IO_REDIS_URL: "redis://localhost:6379" },
        createRedisClient: ({ url }) => {
            assert.equal(url, "redis://localhost:6379");
            return pubClient;
        },
        createRedisAdapter: (pub, sub) => ({ pub, sub }),
        logger: { warn() {}, info() {}, error() {} }
    });

    assert.equal(result.enabled, true);
    assert.deepEqual(connects.sort(), ["pub", "sub"]);
    assert.deepEqual(adapterValue, { pub: pubClient, sub: subClient });

    await result.close();
    assert.deepEqual(quits.sort(), ["pub", "sub"]);
});
