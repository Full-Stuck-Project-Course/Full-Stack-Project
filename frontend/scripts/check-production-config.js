const { readFileSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");

function read(relativePath) {
    return readFileSync(join(root, relativePath), "utf8");
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const clientFiles = [
    "src/api/axios.js",
    "src/api/socket.js",
    "src/api/assets.js",
    "src/api/config.js"
];

for (const file of clientFiles) {
    const content = read(file);
    assert(
        !/https?:\/\/(?:localhost|127\.0\.0\.1):5000/.test(content),
        `${file} must not hardcode the local backend origin in client code.`
    );
}

const config = read("src/api/config.js");
assert(
    /VITE_API_URL/.test(config) && /DEFAULT_API_BASE_URL\s*=\s*"\/api"/.test(config),
    "Frontend config must support VITE_API_URL with /api as the same-origin default."
);
assert(
    /originFromApiBaseUrl\(API_BASE_URL\)/.test(config),
    "Socket and asset defaults must derive from the API origin when the API is absolute."
);

const axiosClient = read("src/api/axios.js");
assert(
    /baseURL:\s*API_BASE_URL/.test(axiosClient),
    "Axios must use API_BASE_URL instead of a hardcoded /api literal."
);

const socketClient = read("src/api/socket.js");
assert(
    /SOCKET_URL\s*\?\s*io\(SOCKET_URL,\s*options\)\s*:\s*io\(options\)/s.test(socketClient),
    "Socket client must use same-origin when VITE_SOCKET_URL is not configured."
);

const assetsClient = read("src/api/assets.js");
assert(
    /ASSET_ORIGIN/.test(assetsClient) && /\`\$\{ASSET_ORIGIN\}/.test(assetsClient),
    "Asset URLs must use ASSET_ORIGIN from shared frontend config."
);

const viteConfig = read("vite.config.js");
assert(
    /"\/socket\.io"[\s\S]*ws:\s*true/.test(viteConfig) && /"\/uploads"/.test(viteConfig),
    "Vite dev proxy must cover Socket.IO and uploads for same-origin local development."
);

const envExample = read(".env.example");
assert(
    /VITE_API_URL=\/api/.test(envExample),
    ".env.example must document VITE_API_URL=/api."
);
assert(
    !/VITE_(?:SOCKET_URL|ASSET_ORIGIN)=https?:\/\/(?:localhost|127\.0\.0\.1):5000/.test(envExample),
    ".env.example must not default browser-facing production settings to localhost."
);

const productionEnv = read(".env.production");
const activeProductionEnvLines = productionEnv
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"));
const activeGoogleEnvValues = activeProductionEnvLines
    .filter(line => /^VITE_GOOGLE_(?:CLIENT_ID|BROWSER_MAPS_API_KEY)\s*=/.test(line))
    .map(line => line.split("=").slice(1).join("=").trim());
assert(
    activeGoogleEnvValues.every(value => value && !/^your_|placeholder|replace|example/i.test(value)),
    ".env.production must not define blank or placeholder Google values; omit them or set real deployment values."
);
const productionGoogleClientId = activeProductionEnvLines
    .find(line => /^VITE_GOOGLE_CLIENT_ID\s*=/.test(line))
    ?.split("=")
    .slice(1)
    .join("=")
    .trim();
assert(
    /^[0-9A-Za-z_-]+\.apps\.googleusercontent\.com$/.test(productionGoogleClientId || ""),
    ".env.production must define a valid VITE_GOOGLE_CLIENT_ID so production Google login is available."
);

console.log("Production frontend config check passed: client defaults are same-origin and env-driven.");
