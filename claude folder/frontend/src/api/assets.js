const ASSET_ORIGIN = process.env.REACT_APP_ASSET_ORIGIN || "http://localhost:5000";

export function assetUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${ASSET_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
