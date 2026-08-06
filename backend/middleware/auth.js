// middleware/auth.js

const { getSessionUserFromToken } = require("../utils/authSession");

async function auth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    try {
        req.user = await getSessionUserFromToken(token);
        next();
    } catch (error) {
        if (error.statusCode === 403) {
            return res.status(403).json({ error: error.message });
        }
        return res.status(401).json({ error: "Invalid or expired token" });
    }
}

function adminOnly(req, res, next) {
    if (req.user?.role !== "admin") {
        return res.status(403).json({ error: "Admin access required" });
    }
    next();
}

function isProfileCompletionRoute(req) {
    const userId = String(req.user?.userId || "");
    if (!userId) return false;

    return (
        (req.method === "GET" && req.path === `/users/${userId}`) ||
        (req.method === "POST" && req.path === `/users/${userId}/complete-profile`) ||
        (req.method === "POST" && req.path === "/uploads/id-photo")
    );
}

function requireCompletedProfile(req, res, next) {
    if (req.user?.role === "admin" || !req.user?.needsProfileCompletion || isProfileCompletionRoute(req)) {
        return next();
    }

    return res.status(403).json({
        code: "PROFILE_COMPLETION_REQUIRED",
        error: "Profile completion is required before using HailNow"
    });
}

module.exports = { auth, adminOnly, requireCompletedProfile };
