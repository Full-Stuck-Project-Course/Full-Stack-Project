const User = require("../db/models/User");
const { verifyAuthToken } = require("./jwtConfig");

function authError(message, statusCode = 401) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

async function getSessionUserFromToken(token) {
    const decoded = verifyAuthToken(token);
    if (!decoded?.userId) {
        throw authError("Invalid token payload");
    }

    const user = await User.findById(decoded.userId).select("_id role isActive");
    if (!user) {
        throw authError("User no longer exists");
    }
    if (!user.isActive) {
        throw authError("Account is disabled", 403);
    }

    return {
        userId: user._id,
        role: user.role,
        isActive: user.isActive
    };
}

module.exports = {
    getSessionUserFromToken
};
