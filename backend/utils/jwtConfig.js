const jwt = require("jsonwebtoken");

const MIN_JWT_SECRET_LENGTH = 32;
const KNOWN_INSECURE_SECRETS = new Set([
    "secret",
    "jwtsecret",
    "jwt_secret",
    "jwt-secret",
    "your_jwt_secret",
    "your-jwt-secret",
    "your_jwt_secret_here",
    "your-jwt-secret-here",
    "your_secret_key",
    "your-secret-key",
    "change_me",
    "change-me",
    "changeme",
    "default",
    "default_secret",
    "default-secret",
    "password",
    "123456",
    "hailnow-secret",
    "hailnow_jwt_secret",
    "development_secret",
    "development_jwt_secret_do_not_use",
    "replace-this-with-a-secure-jwt-secret",
    "supersecret"
]);

const INSECURE_SECRET_PATTERNS = [
    /change[_-]?(me|this)/i,
    /before[_-]?production/i,
    /do[_-]?not[_-]?use/i,
    /local[_-]?dev/i,
    /development/i,
    /example/i,
    /placeholder/i,
    /replace/i,
    /your[_-]/i
];

function normalizeJwtSecret(value) {
    return typeof value === "string" ? value.trim() : "";
}

function isKnownInsecureJwtSecret(secret) {
    const normalized = normalizeJwtSecret(secret);
    return KNOWN_INSECURE_SECRETS.has(normalized.toLowerCase()) ||
        INSECURE_SECRET_PATTERNS.some(pattern => pattern.test(normalized));
}

function validateJwtSecret(secret = process.env.JWT_SECRET) {
    const normalized = normalizeJwtSecret(secret);
    if (!normalized) {
        throw new Error("JWT_SECRET is required");
    }
    if (normalized.length < MIN_JWT_SECRET_LENGTH) {
        throw new Error(`JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters long`);
    }
    if (isKnownInsecureJwtSecret(normalized)) {
        throw new Error("JWT_SECRET must not use a default, placeholder, or known insecure value");
    }
    return normalized;
}

function validateJwtSecretForStartup() {
    try {
        return validateJwtSecret();
    } catch (error) {
        throw new Error(`Invalid JWT configuration: ${error.message}`);
    }
}

function getJwtSecret() {
    return validateJwtSecret();
}

function signAuthToken(user, options = {}) {
    const userId = user?._id || user?.id || user?.userId;
    if (!userId) {
        throw new Error("Cannot sign auth token without a user id");
    }
    return jwt.sign(
        { userId },
        getJwtSecret(),
        { expiresIn: "7d", ...options }
    );
}

function verifyAuthToken(token) {
    return jwt.verify(token, getJwtSecret());
}

module.exports = {
    KNOWN_INSECURE_SECRETS,
    MIN_JWT_SECRET_LENGTH,
    getJwtSecret,
    isKnownInsecureJwtSecret,
    signAuthToken,
    validateJwtSecret,
    validateJwtSecretForStartup,
    verifyAuthToken
};
