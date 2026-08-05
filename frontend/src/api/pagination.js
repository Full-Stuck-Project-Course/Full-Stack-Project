export function extractItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
}

export function extractPagination(payload) {
    return payload && !Array.isArray(payload) ? payload.pagination || null : null;
}
