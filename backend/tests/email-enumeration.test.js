const test = require("node:test");
const assert = require("node:assert/strict");

const routes = require("../routes");
const User = require("../db/models/User");
const { register } = require("../controllers/userController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

function getPostHandlers(path) {
    const layer = routes.stack.find(entry => entry.route?.path === path && entry.route.methods.post);
    assert.ok(layer, `POST ${path} route must exist`);
    return layer.route.stack
        .filter(entry => entry.method === "post")
        .map(entry => entry.handle);
}

function makeRouteRes() {
    return {
        statusCode: 200,
        body: undefined,
        headers: {},
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        send(payload) {
            this.body = payload;
            return this;
        }
    };
}

async function runRouteHandlers(handlers, body, ip = "203.0.113.10") {
    const req = {
        ip,
        originalUrl: "/api/users/check-email",
        body,
        socket: { remoteAddress: ip }
    };
    const res = makeRouteRes();
    let index = 0;

    async function next(error) {
        if (error) throw error;
        const handler = handlers[index];
        index += 1;
        if (!handler) return;

        const result = handler(req, res, next);
        if (result?.then) await result;
    }

    await next();
    return res;
}

test("check-email does not disclose account existence or query users", async () => {
    let lookupCalled = false;
    patchMethod(patches, User, "findOne", async () => {
        lookupCalled = true;
        throw new Error("check-email must not query users");
    });

    const handlers = getPostHandlers("/users/check-email");
    const existingEmailResponse = await runRouteHandlers(handlers, { email: "existing@example.com" });
    const missingEmailResponse = await runRouteHandlers(handlers, { email: "missing@example.com" });

    assert.equal(existingEmailResponse.statusCode, 200);
    assert.deepEqual(existingEmailResponse.body, { ok: true });
    assert.deepEqual(missingEmailResponse.body, existingEmailResponse.body);
    assert.equal(Object.hasOwn(existingEmailResponse.body, "exists"), false);
    assert.equal(lookupCalled, false);
});

test("register duplicate conflicts use a generic message and normalize email lookup", async () => {
    patchMethod(patches, User, "findOne", async (filter) => {
        assert.deepEqual(filter, {
            $or: [{ email: "existing@example.com" }, { phone: "0501234567" }]
        });
        return { email: "existing@example.com", phone: "0500000000" };
    });

    const res = makeRes();
    await register({
        body: {
            fullName: "Existing User",
            email: "Existing@Example.com",
            password: "Password1",
            phone: "0501234567",
            preferredLanguage: "he",
            role: "passenger"
        }
    }, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: "Registration details already in use" });
    assert.doesNotMatch(res.body.error, /email|phone/i);
});

test("register duplicate key errors use the same generic conflict response", async () => {
    patchMethod(patches, User, "findOne", async () => null);
    patchMethod(patches, User, "create", async () => {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
    });

    const res = makeRes();
    await register({
        body: {
            fullName: "New User",
            email: "New@Example.com",
            password: "Password1",
            phone: "0507654321",
            preferredLanguage: "he",
            role: "passenger"
        }
    }, res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(res.body, { error: "Registration details already in use" });
});
