// controllers/userController.js

const User             = require("../db/models/User");
const PassengerProfile = require("../db/models/PassengerProfile");
const bcrypt           = require("bcryptjs");
const crypto           = require("crypto");
const axios            = require("axios");
const { OAuth2Client } = require("google-auth-library");
const DriverProfile    = require("../db/models/DriverProfile");
const { sameId, isAdmin } = require("../utils/authz");
const { signAuthToken } = require("../utils/jwtConfig");
const { sendPasswordResetEmail, isSmtpConfigured } = require("../utils/email");
const {
    cleanupDeletedUserPrivacy,
    deleteStoredUploads
} = require("../utils/privacyCleanup");

const googleClient = new OAuth2Client();
const RESET_EXPIRES_MINUTES = 60;
const RESET_MAX_CODE_ATTEMPTS = 5;
const SAFE_USER_SELECT = "-passwordHash -resetPasswordToken -resetPasswordCodeHash -resetPasswordExpires -resetPasswordCodeAttempts";

function isPlaceholderGoogleClientId(clientId) {
    return /^your_/i.test(clientId) || /placeholder|replace|example/i.test(clientId);
}

function getGoogleClientIdsFromEnv(env = process.env) {
    const raw = String(env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || "").trim();
    return raw
        .split(",")
        .map(clientId => clientId.trim())
        .filter(clientId => clientId && !isPlaceholderGoogleClientId(clientId));
}

function hashResetSecret(value) {
    return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function clearPasswordResetFields(user) {
    user.resetPasswordToken = null;
    user.resetPasswordCodeHash = null;
    user.resetPasswordExpires = null;
    user.resetPasswordCodeAttempts = 0;
}

function isPasswordResetDeliveryConfigured() {
    return Boolean(process.env.RESET_EMAIL_WEBHOOK_URL || isSmtpConfigured());
}

async function ensurePassengerProfileForUser(user) {
    return PassengerProfile.findOneAndUpdate(
        { userId: user._id },
        { $setOnInsert: { userId: user._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

function createPasswordResetSecrets(user) {
    const token = crypto.randomBytes(32).toString("hex");
    const resetCode = crypto.randomInt(100000, 1000000).toString();
    user.resetPasswordToken = hashResetSecret(token);
    user.resetPasswordCodeHash = hashResetSecret(resetCode);
    user.resetPasswordExpires = new Date(Date.now() + RESET_EXPIRES_MINUTES * 60 * 1000);
    user.resetPasswordCodeAttempts = 0;
    return { token, resetCode };
}

async function deliverPasswordReset(user, token, resetCode) {
    const clientBase = process.env.CLIENT_BASE_URL || "http://localhost:3000";
    const resetLink = `${clientBase}/reset-password?token=${token}`;

    if (process.env.RESET_EMAIL_WEBHOOK_URL) {
        await axios.post(process.env.RESET_EMAIL_WEBHOOK_URL, {
            email: user.email,
            fullName: user.fullName,
            resetLink,
            resetCode,
            expiresMinutes: RESET_EXPIRES_MINUTES
        });
        return { resetLink, sent: true };
    }

    const delivery = await sendPasswordResetEmail({
        to: user.email,
        fullName: user.fullName,
        resetLink,
        resetCode,
        expiresMinutes: RESET_EXPIRES_MINUTES
    });

    return { resetLink, sent: delivery.sent };
}

async function buildUserResponse(user) {
    const [passengerProfile, driverProfile] = await Promise.all([
        ensurePassengerProfileForUser(user),
        DriverProfile.findOne({ userId: user._id })
    ]);

    return {
        userId: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
        profileImage: user.profileImage,
        referralCode: user.referralCode,
        loyaltyPoints: user.loyaltyPoints || 0,
        idPhotoPath: user.idPhotoPath,
        idVerificationStatus: user.idVerificationStatus,
        passengerId: passengerProfile?._id || null,
        driverId: driverProfile?._id || null
    };
}

// POST /users/register
async function register(req, res) {
    try {
        const { fullName, email, password, phone, preferredLanguage, role, referralCode } = req.body;
        const normalizedEmail = email.toLowerCase();

        const existing = await User.findOne({ $or: [{ email: normalizedEmail }, { phone }] });
        if (existing) {
            return res.status(409).json({ error: "Registration details already in use" });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        let referredBy = null;
        if (referralCode) {
            const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
            if (referrer) referredBy = referrer._id;
        }

        const user = await User.create({
            fullName, email: normalizedEmail, passwordHash, phone,
            preferredLanguage, role, referredBy
        });

        // Give referrer bonus points
        if (referredBy) {
            await User.findByIdAndUpdate(referredBy, { $inc: { loyaltyPoints: 100 } });
        }

        await ensurePassengerProfileForUser(user);

        const token = signAuthToken(user);
        const userData = await buildUserResponse(user);

        res.status(201).json({
            message: "User registered successfully",
            token,
            ...userData
        });
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(409).json({ error: "Registration details already in use" });
        }
        res.status(400).json({ error: error.message });
    }
}

// POST /users/login
async function login(req, res) {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: "User not found" });
        if (!user.isActive) return res.status(403).json({ error: "Account is disabled" });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: "Invalid credentials" });

        const token = signAuthToken(user);

        user.lastLoginAt = new Date();
        await user.save();

        const userData = await buildUserResponse(user);

        res.status(200).json({
            message: "Login successful",
            token,
            ...userData
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /users/forgot-password
async function forgotPassword(req, res) {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "Email is required" });

        const user = await User.findOne({ email: email.toLowerCase() });
        const genericMessage = "If an account exists for this email, password reset instructions were sent";
        if (!user) {
            return res.status(200).json({
                message: genericMessage,
                deliveryConfigured: isPasswordResetDeliveryConfigured()
            });
        }

        const { token, resetCode } = createPasswordResetSecrets(user);
        await user.save();

        let resetLink = "";
        try {
            const delivery = await deliverPasswordReset(user, token, resetCode);
            resetLink = delivery.resetLink;
            if (!delivery.sent && process.env.NODE_ENV === "production") {
                return res.status(503).json({ error: "Password reset email delivery is not configured" });
            }
        } catch (deliveryError) {
            if (process.env.NODE_ENV === "production") {
                return res.status(503).json({ error: "Could not send password reset email" });
            }
            console.warn("Password reset email delivery failed:", deliveryError.message);
        }

        const response = {
            message: genericMessage,
            email: user.email,
            deliveryConfigured: isPasswordResetDeliveryConfigured()
        };
        if (process.env.NODE_ENV !== "production" && process.env.RETURN_RESET_TOKEN === "true") {
            response.resetLink = resetLink;
            response.resetToken = token;
            response.resetCode = resetCode;
        }
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /users/reset-password
async function resetPassword(req, res) {
    try {
        const { token, email, code, newPassword } = req.body;
        if (!newPassword) return res.status(400).json({ error: "New password required" });
        if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

        let user;
        if (token) {
            user = await User.findOne({
                resetPasswordToken: hashResetSecret(token),
                resetPasswordExpires: { $gt: new Date() }
            });
        } else if (email && code) {
            user = await User.findOne({
                email: email.toLowerCase(),
                resetPasswordCodeHash: { $ne: null },
                resetPasswordExpires: { $gt: new Date() }
            });

            if (user) {
                if ((user.resetPasswordCodeAttempts || 0) >= RESET_MAX_CODE_ATTEMPTS) {
                    clearPasswordResetFields(user);
                    await user.save();
                    return res.status(400).json({ error: "Too many invalid reset code attempts. Please request a new code." });
                }

                if (user.resetPasswordCodeHash !== hashResetSecret(code)) {
                    user.resetPasswordCodeAttempts = (user.resetPasswordCodeAttempts || 0) + 1;
                    if (user.resetPasswordCodeAttempts >= RESET_MAX_CODE_ATTEMPTS) {
                        clearPasswordResetFields(user);
                        await user.save();
                        return res.status(400).json({ error: "Too many invalid reset code attempts. Please request a new code." });
                    }
                    await user.save();
                    return res.status(400).json({ error: "Invalid or expired reset code" });
                }
            }
        } else {
            return res.status(400).json({ error: "Reset token or email and code required" });
        }

        if (!user) return res.status(400).json({ error: "Invalid or expired password reset request" });

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        clearPasswordResetFields(user);
        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /users
async function getAllUsers(req, res) {
    try {
        const users = await User.find().select(SAFE_USER_SELECT);
        res.status(200).json(users);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /users/:id
async function getUserById(req, res) {
    try {
        if (!isAdmin(req) && !sameId(req.user.userId, req.params.id)) {
            return res.status(403).json({ error: "Cannot view another user" });
        }
        const user = await User.findById(req.params.id).select(SAFE_USER_SELECT);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.status(200).json(await buildUserResponse(user));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /users/:id
async function updateUser(req, res) {
    try {
        if (!sameId(req.user.userId, req.params.id) && req.user.role !== "admin") {
            return res.status(403).json({ error: "Cannot update another user" });
        }

        const ALLOWED_FIELDS = ["fullName", "phone", "preferredLanguage", "profileImage"];
        const ADMIN_FIELDS = ["role", "isActive"];
        const update = {};
        for (const key of ALLOWED_FIELDS) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }
        if (req.user.role === "admin") {
            for (const key of ADMIN_FIELDS) {
                if (req.body[key] !== undefined) update[key] = req.body[key];
            }
        }
        if (update.profileImage === "") update.profileImage = null;

        if (update.profileImage === null) {
            const existing = await User.findById(req.params.id).select("profileImage");
            await deleteStoredUploads([existing?.profileImage]);
        }

        const user = await User.findByIdAndUpdate(req.params.id, update, {
            new: true, runValidators: true
        }).select(SAFE_USER_SELECT);

        if (!user) return res.status(404).json({ error: "User not found" });
        await ensurePassengerProfileForUser(user);
        res.status(200).json({ message: "User updated successfully", user });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /users/:id/password
async function changePassword(req, res) {
    try {
        if (!sameId(req.user.userId, req.params.id)) {
            return res.status(403).json({ error: "Cannot change another user's password" });
        }
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

        if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        await user.save();

        res.status(200).json({ message: "Password updated successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// DELETE /users/:id
async function deleteUser(req, res) {
    try {
        const cleanup = await cleanupDeletedUserPrivacy(req.params.id);
        if (!cleanup.user) return res.status(404).json({ error: "User not found" });

        const deletedUploadCount = cleanup.deletedUploads.filter(result => result.deleted).length;
        res.status(200).json({
            message: "User disabled and personal data cleaned up",
            deletedUploadCount
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// DELETE /users/:id/hard
async function hardDeleteUser(req, res) {
    try {
        const [passenger, driver] = await Promise.all([
            PassengerProfile.findOne({ userId: req.params.id }),
            DriverProfile.findOne({ userId: req.params.id })
        ]);

        const activeRideFilter = {
            status: { $in: ["searching", "accepted", "driver_arriving", "in_progress"] },
            $or: []
        };
        if (passenger) activeRideFilter.$or.push({ passengerId: passenger._id });
        if (driver) activeRideFilter.$or.push({ driverId: driver._id });

        if (activeRideFilter.$or.length > 0) {
            const activeRide = await require("../db/models/Ride").findOne(activeRideFilter);
            if (activeRide) return res.status(409).json({ error: "Cannot hard-delete a user with active rides" });
        }

        const cleanup = await cleanupDeletedUserPrivacy(req.params.id);
        if (!cleanup.user) return res.status(404).json({ error: "User not found" });

        if (driver) await require("../db/models/Vehicle").deleteMany({ driverId: driver._id });
        if (driver) await DriverProfile.findByIdAndDelete(driver._id);
        if (passenger) await PassengerProfile.findByIdAndDelete(passenger._id);
        await User.findByIdAndDelete(req.params.id);

        res.status(200).json({ message: "User hard-deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /users/:id/password-reset
async function adminSendPasswordReset(req, res) {
    try {
        if (!isAdmin(req)) return res.status(403).json({ error: "Admin access required" });
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });
        if (!user.email || user.email.startsWith("deleted-")) {
            return res.status(400).json({ error: "User does not have a deliverable email" });
        }

        const { token, resetCode } = createPasswordResetSecrets(user);
        await user.save();

        let delivery = { resetLink: "", sent: false };
        try {
            delivery = await deliverPasswordReset(user, token, resetCode);
            if (!delivery.sent && process.env.NODE_ENV === "production") {
                return res.status(503).json({ error: "Password reset email delivery is not configured" });
            }
        } catch (deliveryError) {
            if (process.env.NODE_ENV === "production") {
                return res.status(503).json({ error: "Could not send password reset email" });
            }
            console.warn("Admin password reset delivery failed:", deliveryError.message);
        }

        const response = {
            message: "Password reset instructions sent",
            email: user.email,
            deliveryConfigured: isPasswordResetDeliveryConfigured(),
            sent: delivery.sent
        };
        if (process.env.NODE_ENV !== "production" && process.env.RETURN_RESET_TOKEN === "true") {
            response.resetLink = delivery.resetLink;
            response.resetToken = token;
            response.resetCode = resetCode;
        }
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /users/google-login
async function googleLogin(req, res) {
    try {
        const { credential } = req.body;
        if (!credential) return res.status(400).json({ error: "Missing Google credential" });

        const googleClientIds = getGoogleClientIdsFromEnv();
        if (googleClientIds.length === 0) {
            return res.status(503).json({ error: "Google login is not configured. Set GOOGLE_CLIENT_ID in backend/.env." });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: googleClientIds.length === 1 ? googleClientIds[0] : googleClientIds,
        });
        const payload = ticket.getPayload();
        const email = String(payload.email || "").trim().toLowerCase();

        if (!email) return res.status(400).json({ error: "Google account has no email" });

        let user = await User.findOne({ email });

        if (!user) {
            const randomPassword = crypto.randomBytes(20).toString("hex");
            const passwordHash = await bcrypt.hash(randomPassword, 10);

            user = await User.create({
                fullName: payload.name || email.split("@")[0],
                email,
                passwordHash,
                phone: "google-" + Date.now(),
                profileImage: payload.picture || null,
                isEmailVerified: payload.email_verified || false,
                role: "passenger"
            });

            await PassengerProfile.create({ userId: user._id });
        }
        if (!user.isActive) return res.status(403).json({ error: "Account is disabled" });

        const token = signAuthToken(user);

        user.lastLoginAt = new Date();
        await user.save();

        const userData = await buildUserResponse(user);

        res.status(200).json({
            message: "Google login successful",
            token,
            ...userData
        });
    } catch (error) {
        res.status(400).json({ error: "Google authentication failed: " + error.message });
    }
}

module.exports = {
    register,
    login,
    googleLogin,
    forgotPassword,
    resetPassword,
    getAllUsers,
    getUserById,
    updateUser,
    changePassword,
    deleteUser,
    hardDeleteUser,
    adminSendPasswordReset
};
