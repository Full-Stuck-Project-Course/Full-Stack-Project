const test = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("node:events");

process.env.JWT_SECRET = "test-server-listen-secret-with-more-than-32-chars";

const { formatListenError, listen } = require("../server");

class FakeServer extends EventEmitter {
    constructor(result) {
        super();
        this.result = result;
    }

    listen() {
        process.nextTick(() => {
            if (this.result instanceof Error) this.emit("error", this.result);
            else this.emit("listening");
        });
    }
}

test("listen rejects port conflicts instead of leaving an unhandled server error", async () => {
    const error = Object.assign(new Error("address already in use"), { code: "EADDRINUSE" });

    await assert.rejects(
        listen(new FakeServer(error), 5000),
        error
    );

    assert.match(formatListenError(error, 5000), /Port 5000 is already in use/);
});

test("listen resolves once the server starts listening", async () => {
    await assert.doesNotReject(listen(new FakeServer("ok"), 5000));
});
