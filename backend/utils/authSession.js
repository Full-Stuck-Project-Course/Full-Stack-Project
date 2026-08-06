const User = require("../db/models/User");
const { verifyAuthToken } = require("./jwtConfig");
const { needsProfileCompletion } = require("./profileCompletion");

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

    const user = await User.findById(decoded.userId).select("_id role isActive phone authProvider idPhotoPath");
    if (!user) {
        throw authError("User no longer exists");
    }
    if (!user.isActive) {
        throw authError("Account is disabled", 403);
    }

    return {
        userId: user._id,
        role: user.role,
        isActive: user.isActive,
        needsProfileCompletion: needsProfileCompletion(user)
    };
}

module.exports = {
    getSessionUserFromToken
};
