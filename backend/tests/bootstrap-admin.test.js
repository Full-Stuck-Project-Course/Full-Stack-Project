const test = require("node:test");
const assert = require("node:assert/strict");

const {
    bootstrapAdmin,
    normalizeBootstrapConfig
} = require("../scripts/bootstrap-admin");

const baseEnv = {
    BOOTSTRAP_ADMIN_EMAIL: "Admin@Example.com",
    BOOTSTRAP_ADMIN_FULL_NAME: "Admin User",
    BOOTSTRAP_ADMIN_PHONE: "0501234567",
    BOOTSTRAP_ADMIN_PASSWORD: "StrongPass1"
};

function queryResult(result) {
    return {
        select() {
            return Promise.resolve(result);
        },
        then(resolve, reject) {
            return Promise.resolve(result).then(resolve, reject);
        }
    };
}

function makeFakes({ existingAdmin = null, existingUser = null } = {}) {
    const calls = {
        findOne: [],
        create: [],
        findByIdAndUpdate: [],
        passengerProfile: []
    };

    const UserModel = {
        findOne(filter) {
            calls.findOne.push(filter);
            if (filter.role === "admin") return queryResult(existingAdmin);
            if (filter.email) return Promise.resolve(existingUser);
            return Promise.resolve(null);
        },
        async create(payload) {
            calls.create.push(payload);
            return { _id: "created-admin-id", email: payload.email, ...payload };
        },
        async findByIdAndUpdate(id, update, options) {
            calls.findByIdAndUpdate.push({ id, update, options });
            return { _id: id, email: existingUser.email, ...update };
        }
    };

    const PassengerProfileModel = {
        async findOneAndUpdate(filter, update, options) {
            calls.passengerProfile.push({ filter, update, options });
            return { _id: "passenger-profile-id", userId: filter.userId };
        }
    };

    const bcryptLib = {
        async hash(password, rounds) {
            calls.hash = { password, rounds };
            return "hashed-bootstrap-password";
        }
    };

    return { calls, UserModel, PassengerProfileModel, bcryptLib };
}

test("bootstrap config validates and normalizes admin env values", () => {
    const config = normalizeBootstrapConfig(baseEnv);

    assert.equal(config.email, "admin@example.com");
    assert.equal(config.fullName, "Admin User");
    assert.equal(config.phone, "0501234567");
    assert.equal(config.password, "StrongPass1");
});

test("bootstrap admin is a no-op when an admin already exists", async () => {
    const fakes = makeFakes({
        existingAdmin: { _id: "admin-id", email: "root@example.com" }
    });

    const result = await bootstrapAdmin({ env: baseEnv, ...fakes });

    assert.deepEqual(result, {
        changed: false,
        action: "skipped",
        reason: "admin_exists",
        userId: "admin-id",
        email: "root@example.com"
    });
    assert.equal(fakes.calls.create.length, 0);
    assert.equal(fakes.calls.findByIdAndUpdate.length, 0);
    assert.equal(fakes.calls.passengerProfile.length, 0);
});

test("bootstrap admin creates the first admin and passenger profile", async () => {
    const fakes = makeFakes();

    const result = await bootstrapAdmin({ env: baseEnv, ...fakes });

    assert.equal(result.action, "created");
    assert.equal(result.email, "admin@example.com");
    assert.equal(fakes.calls.hash.password, "StrongPass1");
    assert.equal(fakes.calls.hash.rounds, 10);
    assert.deepEqual(fakes.calls.create[0], {
        fullName: "Admin User",
        email: "admin@example.com",
        passwordHash: "hashed-bootstrap-password",
        phone: "0501234567",
        role: "admin",
        preferredLanguage: "he",
        isActive: true,
        isEmailVerified: true
    });
    assert.deepEqual(fakes.calls.passengerProfile[0], {
        filter: { userId: "created-admin-id" },
        update: { $setOnInsert: { userId: "created-admin-id" } },
        options: { upsert: true, new: true, setDefaultsOnInsert: true }
    });
});

test("bootstrap admin promotes an existing user when no admin exists", async () => {
    const fakes = makeFakes({
        existingUser: { _id: "existing-user-id", email: "admin@example.com" }
    });

    const result = await bootstrapAdmin({ env: baseEnv, ...fakes });

    assert.equal(result.action, "promoted");
    assert.equal(result.userId, "existing-user-id");
    assert.deepEqual(fakes.calls.findByIdAndUpdate[0], {
        id: "existing-user-id",
        update: {
            fullName: "Admin User",
            phone: "0501234567",
            passwordHash: "hashed-bootstrap-password",
            role: "admin",
            isActive: true,
            isEmailVerified: true
        },
        options: { new: true, runValidators: true }
    });
    assert.deepEqual(fakes.calls.passengerProfile[0].filter, { userId: "existing-user-id" });
});
