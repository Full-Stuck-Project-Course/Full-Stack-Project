const DEFAULT_API_BASE_URL = "/api";

function normalizeEndpoint(value, envName) {
    const endpoint = String(value || "").trim();
    if (!endpoint) return "";

    if (/^https?:\/\//i.test(endpoint)) {
        return endpoint.replace(/\/+$/, "");
    }

    if (endpoint.startsWith("/")) {
        return endpoint === "/" ? "" : endpoint.replace(/\/+$/, "");
    }

    throw new Error(`${envName} must be an absolute http(s) URL or a root-relative path.`);
}

function originFromApiBaseUrl(apiBaseUrl) {
    if (!/^https?:\/\//i.test(apiBaseUrl)) return "";
    return new URL(apiBaseUrl).origin;
}

export const API_BASE_URL = normalizeEndpoint(
    import.meta.env.VITE_API_URL || DEFAULT_API_BASE_URL,
    "VITE_API_URL"
) || DEFAULT_API_BASE_URL;

export const SOCKET_URL = normalizeEndpoint(
    import.meta.env.VITE_SOCKET_URL || "",
    "VITE_SOCKET_URL"
) || originFromApiBaseUrl(API_BASE_URL);

export const ASSET_ORIGIN = normalizeEndpoint(
    import.meta.env.VITE_ASSET_ORIGIN || "",
    "VITE_ASSET_ORIGIN"
) || originFromApiBaseUrl(API_BASE_URL);
