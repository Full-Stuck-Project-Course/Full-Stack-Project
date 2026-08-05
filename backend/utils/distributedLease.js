const os = require("os");
const RuntimeLease = require("../db/models/RuntimeLease");

function toDate(value) {
    return value instanceof Date ? value : new Date(value);
}

function createInstanceId(env = process.env) {
    const configuredId = String(env.INSTANCE_ID || "").trim();
    if (configuredId) return configuredId;

    return `${os.hostname()}:${process.pid}`;
}

function isDuplicateKeyError(error) {
    return error?.code === 11000 || /E11000 duplicate key/i.test(String(error?.message || ""));
}

async function acquireMongoLease({
    lockName,
    ttlMs,
    ownerId = createInstanceId(),
    now = new Date(),
    model = RuntimeLease
} = {}) {
    if (!lockName) throw new Error("lockName is required");
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new Error("ttlMs must be a positive number");

    const currentTime = toDate(now);
    const expiresAt = new Date(currentTime.getTime() + ttlMs);

    try {
        const lease = await model.findOneAndUpdate(
            {
                _id: lockName,
                $or: [
                    { expiresAt: { $lte: currentTime } },
                    { ownerId }
                ]
            },
            {
                $set: {
                    ownerId,
                    expiresAt,
                    updatedAt: currentTime
                },
                $setOnInsert: {
                    createdAt: currentTime
                }
            },
            {
                new: true,
                upsert: true,
                setDefaultsOnInsert: true
            }
        );

        if (!lease || String(lease.ownerId) !== String(ownerId)) {
            return { acquired: false, reason: "locked" };
        }

        return { acquired: true, lease, expiresAt };
    } catch (error) {
        if (isDuplicateKeyError(error)) {
            return { acquired: false, reason: "locked" };
        }
        throw error;
    }
}

async function runWithMongoLease({
    lockName,
    ttlMs,
    task,
    ownerId = createInstanceId(),
    now = new Date(),
    model = RuntimeLease
} = {}) {
    if (typeof task !== "function") throw new Error("task must be a function");

    const lease = await acquireMongoLease({ lockName, ttlMs, ownerId, now, model });
    if (!lease.acquired) {
        return { ran: false, ...lease };
    }

    await task();
    return { ran: true, ...lease };
}

function shouldRunScheduledTasks(env = process.env) {
    return String(env.ENABLE_SCHEDULED_TASKS || "true").toLowerCase() !== "false";
}

function startClusterSafeInterval({
    lockName,
    intervalMs,
    leaseTtlMs,
    task,
    ownerId = createInstanceId(),
    logger = console,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    runWithLease = runWithMongoLease
} = {}) {
    if (!lockName) throw new Error("lockName is required");
    if (!Number.isFinite(intervalMs) || intervalMs <= 0) throw new Error("intervalMs must be a positive number");
    if (!Number.isFinite(leaseTtlMs) || leaseTtlMs <= 0) throw new Error("leaseTtlMs must be a positive number");
    if (typeof task !== "function") throw new Error("task must be a function");

    let stopped = false;
    const execute = async () => {
        if (stopped) return { ran: false, reason: "stopped" };

        try {
            return await runWithLease({
                lockName,
                ttlMs: leaseTtlMs,
                ownerId,
                task
            });
        } catch (error) {
            logger.error?.(`Scheduled task ${lockName} failed:`, error.message);
            return { ran: false, reason: "error", error };
        }
    };

    const timer = setIntervalFn(execute, intervalMs);
    timer?.unref?.();

    return {
        timer,
        execute,
        stop() {
            stopped = true;
            clearIntervalFn(timer);
        }
    };
}

module.exports = {
    acquireMongoLease,
    createInstanceId,
    isDuplicateKeyError,
    runWithMongoLease,
    shouldRunScheduledTasks,
    startClusterSafeInterval
};
