const ASSET_ORIGIN = import.meta.env.VITE_ASSET_ORIGIN || "http://localhost:5000";

export function assetUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${ASSET_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

export function secureUploadPath(path) {
    if (!path) return "";
    const normalized = path.startsWith("/") ? path : `/${path}`;
    const parts = normalized.split("/").filter(Boolean);
    if (parts.length !== 3 || parts[0] !== "uploads") return "";
    if (!["ids", "licenses", "vehicle-docs"].includes(parts[1])) return "";
    return `/uploads/secure/${parts[1]}/${encodeURIComponent(parts[2])}`;
}
