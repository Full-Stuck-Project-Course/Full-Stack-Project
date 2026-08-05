const assert = require("node:assert/strict");

function makeRes() {
    return {
        statusCode: 200,
        body: undefined,
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

function queryResult(result, capture = {}) {
    return {
        populate(path) {
            capture.populates ||= [];
            capture.populates.push(path);
            return this;
        },
        select(selection) {
            capture.selection = selection;
            return this;
        },
        sort(sortSpec) {
            capture.sort = sortSpec;
            return Promise.resolve(result);
        },
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        },
        catch(reject) {
            return Promise.resolve(result).catch(reject);
        }
    };
}

function makeRide(overrides = {}) {
    return {
        _id: "ride-1",
        passengerId: "passenger-1",
        driverId: "driver-1",
        vehicleId: "vehicle-1",
        status: "accepted",
        finalPrice: 42,
        distanceKm: 8,
        estimatedDurationMinutes: 18,
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        },
        ...overrides
    };
}

function restoreMethods(patches) {
    for (const { target, key, original } of patches.reverse()) {
        target[key] = original;
    }
    patches.length = 0;
}

function patchMethod(patches, target, key, replacement) {
    assert.equal(typeof target[key], "function", `${key} must be a function before it is patched`);
    patches.push({ target, key, original: target[key] });
    target[key] = replacement;
}

module.exports = {
    makeRes,
    makeRide,
    patchMethod,
    queryResult,
    restoreMethods
};
