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

module.exports = { auth, adminOnly };
