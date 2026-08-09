const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../app");

function listenOnRandomPort() {
    const server = http.createServer(app);
    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve(server));
    });
}

function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
    });
}

test("security headers keep Google sign-in popups and origin checks working", async () => {
    const server = await listenOnRandomPort();
    try {
        const { port } = server.address();
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);

        assert.equal(response.headers.get("x-content-type-options"), "nosniff");
        assert.equal(response.headers.get("x-frame-options"), "DENY");
        assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
        assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
    } finally {
        await closeServer(server);
    }
});
