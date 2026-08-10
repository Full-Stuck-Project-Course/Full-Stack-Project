const DEFAULT_DRIVER_ACTIVE_WINDOW_MS = 120_000;
const DEFAULT_DRIVER_DISCONNECT_GRACE_MS = 30_000;

function positiveMs(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

function getDriverActiveWindowMs(env = process.env) {
    return positiveMs(env.DRIVER_ACTIVE_WINDOW_MS, DEFAULT_DRIVER_ACTIVE_WINDOW_MS);
}

function getDriverDisconnectGraceMs(env = process.env) {
    return positiveMs(env.DRIVER_DISCONNECT_GRACE_MS, DEFAULT_DRIVER_DISCONNECT_GRACE_MS);
}

function driverActiveSince(date = new Date(), env = process.env) {
    return new Date(date.getTime() - getDriverActiveWindowMs(env));
}

function activeDriverFilter(date = new Date(), env = process.env) {
    return { lastActiveAt: { $gte: driverActiveSince(date, env) } };
}

function staleAvailableDriverFilter(date = new Date(), env = process.env) {
    return {
        status: "available",
        $or: [
            { lastActiveAt: null },
            { lastActiveAt: { $lt: driverActiveSince(date, env) } }
        ]
    };
}

module.exports = {
    DEFAULT_DRIVER_ACTIVE_WINDOW_MS,
    DEFAULT_DRIVER_DISCONNECT_GRACE_MS,
    activeDriverFilter,
    driverActiveSince,
    getDriverActiveWindowMs,
    getDriverDisconnectGraceMs,
    staleAvailableDriverFilter
};
