// controllers/userController.js

const User             = require("../db/models/User");
const PassengerProfile = require("../db/models/PassengerProfile");
const bcrypt           = require("bcryptjs");
const jwt              = require("jsonwebtoken");
const crypto           = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const DriverProfile    = require("../db/models/DriverProfile");
const { sameId, isAdmin } = require("../utils/authz");

const googleClient = new OAuth2Client();

async function buildUserResponse(user) {
    const passengerProfile = await PassengerProfile.findOne({ userId: user._id });
    const driverProfile = await DriverProfile.findOne({ userId: user._id });

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

        const existing = await User.findOne({ $or: [{ email }, { phone }] });
        if (existing) {
            if (existing.email === email.toLowerCase()) return res.status(409).json({ error: "Email already in use" });
            return res.status(409).json({ error: "Phone already in use" });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        let referredBy = null;
        if (referralCode) {
            const referrer = await User.findOne({ referralCode: referralCode.toUpperCase() });
            if (referrer) referredBy = referrer._id;
        }

        const user = await User.create({
            fullName, email, passwordHash, phone,
            preferredLanguage, role, referredBy
        });

        // Give referrer bonus points
        if (referredBy) {
            await User.findByIdAndUpdate(referredBy, { $inc: { loyaltyPoints: 100 } });
        }

        // Auto-create PassengerProfile for every new user
        if (role !== "admin") {
            await PassengerProfile.create({ userId: user._id });
        }

        res.status(201).json({ message: "User registered successfully", userId: user._id, referralCode: user.referralCode });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /users/login
async function login(req, res) {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(404).json({ error: "User not found" });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: "Invalid credentials" });

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

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
        const genericMessage = "If an account exists for this email, a reset link was generated";
        if (!user) return res.status(200).json({ message: genericMessage });

        const token = crypto.randomBytes(32).toString("hex");
        user.resetPasswordToken   = token;
        user.resetPasswordExpires = new Date(Date.now() + 3600000); // 1 hour
        await user.save();

        const response = { message: genericMessage };
        if (process.env.NODE_ENV !== "production" && process.env.RETURN_RESET_TOKEN === "true") {
            const clientBase = process.env.CLIENT_BASE_URL || "http://localhost:3000";
            response.resetLink = `${clientBase}/reset-password?token=${token}`;
            response.resetToken = token;
        }
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /users/reset-password
async function resetPassword(req, res) {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: "Token and new password required" });
        if (newPassword.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters" });

        const user = await User.findOne({
            resetPasswordToken:   token,
            resetPasswordExpires: { $gt: new Date() }
        });

        if (!user) return res.status(400).json({ error: "Invalid or expired reset token" });

        user.passwordHash         = await bcrypt.hash(newPassword, 10);
        user.resetPasswordToken   = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /users
async function getAllUsers(req, res) {
    try {
        const users = await User.find().select("-passwordHash -resetPasswordToken");
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
        const user = await User.findById(req.params.id).select("-passwordHash -resetPasswordToken");
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
        const update = {};
        for (const key of ALLOWED_FIELDS) {
            if (req.body[key] !== undefined) update[key] = req.body[key];
        }
        if (req.user.role === "admin" && req.body.role) update.role = req.body.role;

        const user = await User.findByIdAndUpdate(req.params.id, update, {
            new: true, runValidators: true
        }).select("-passwordHash -resetPasswordToken");

        if (!user) return res.status(404).json({ error: "User not found" });
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
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });
        res.status(200).json({ message: "User deleted successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /users/google-login
async function googleLogin(req, res) {
    try {
        const { credential } = req.body;
        if (!credential) return res.status(400).json({ error: "Missing Google credential" });

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const email = payload.email;

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

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

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

module.exports = { register, login, googleLogin, forgotPassword, resetPassword, getAllUsers, getUserById, updateUser, changePassword, deleteUser };
