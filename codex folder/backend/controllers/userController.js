const User = require("../db/models/User");
const PassengerProfile = require("../db/models/PassengerProfile");
const DriverProfile = require("../db/models/DriverProfile");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

function makeToken(user) {
    return jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET || "local-dev-secret",
        { expiresIn: "7d" }
    );
}

function publicUser(user, extras = {}) {
    return {
        userId: user._id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        preferredLanguage: user.preferredLanguage,
        profileImage: user.profileImage,
        idDocumentImage: user.idDocumentImage,
        identityStatus: user.identityStatus,
        ...extras
    };
}

function validateRegistrationPayload(body) {
    const required = ["fullName", "email", "password", "phone", "idNumber", "profileImage", "idDocumentImage"];
    const missing = required.filter(field => !body[field]);
    if (missing.length) return `Missing required fields: ${missing.join(", ")}`;
    if (body.password.length < 8) return "Password must be at least 8 characters";
    return "";
}

async function ensurePassengerProfile(user, body = {}) {
    let passenger = await PassengerProfile.findOne({ userId: user._id });
    if (!passenger) {
        passenger = await PassengerProfile.create({
            userId: user._id,
            preferredDriverGender: body.preferredDriverGender || "any",
            preferredMatching: body.preferredMatching || "closest",
            loyaltyPoints: body.referralCode ? 25 : 0
        });
    }
    return passenger;
}

// POST /users/register
async function register(req, res) {
    try {
        const {
            fullName, email, password, phone, preferredLanguage, role,
            idNumber, profileImage, idDocumentImage, referralCode
        } = req.body;

        const validationError = validateRegistrationPayload(req.body);
        if (validationError) return res.status(400).json({ error: validationError });

        const existing = await User.findOne({ email });
        if (existing) return res.status(409).json({ error: "Email already in use" });

        const passwordHash = await bcrypt.hash(password, 10);
        const cleanRole = ["passenger", "driver", "both"].includes(role) ? role : "passenger";
        const user = await User.create({
            fullName,
            email,
            passwordHash,
            phone,
            preferredLanguage,
            role: cleanRole,
            idNumber,
            profileImage,
            idDocumentImage,
            referralCode: `${String(fullName).slice(0, 3).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}`,
            referredBy: referralCode || ""
        });

        const passenger = await ensurePassengerProfile(user, req.body);
        const token = makeToken(user);

        res.status(201).json({
            message: "User registered successfully",
            userId: user._id,
            passengerId: passenger._id,
            token,
            user: publicUser(user, { passengerId: passenger._id })
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// POST /users/login
async function login(req, res) {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found" });

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return res.status(401).json({ error: "Invalid credentials" });

        const passenger = await ensurePassengerProfile(user);
        const driver = await DriverProfile.findOne({ userId: user._id });
        const token = makeToken(user);

        user.lastLoginAt = new Date();
        await User.updateOne({ _id: user._id }, { lastLoginAt: user.lastLoginAt });

        res.status(200).json({
            message: "Login successful",
            token,
            userId: user._id,
            role: user.role,
            passengerId: passenger._id,
            driverId: driver?._id,
            user: publicUser(user, { passengerId: passenger._id, driverId: driver?._id })
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

async function forgotPassword(req, res) {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found" });

        const code = String(Math.floor(100000 + Math.random() * 900000));
        user.passwordResetCode = code;
        user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();

        res.status(200).json({
            message: "Password reset code generated",
            demoCode: code
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

async function resetPassword(req, res) {
    try {
        const { email, code, newPassword } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ error: "User not found" });
        if (!user.passwordResetCode || user.passwordResetCode !== code) {
            return res.status(400).json({ error: "Invalid reset code" });
        }
        if (!user.passwordResetExpiresAt || user.passwordResetExpiresAt < new Date()) {
            return res.status(400).json({ error: "Reset code expired" });
        }
        if (!newPassword || newPassword.length < 8) {
            return res.status(400).json({ error: "Password must be at least 8 characters" });
        }

        user.passwordHash = await bcrypt.hash(newPassword, 10);
        user.passwordResetCode = null;
        user.passwordResetExpiresAt = null;
        await user.save();

        res.status(200).json({ message: "Password reset successfully" });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /users
async function getAllUsers(req, res) {
    try {
        const users = await User.find().select("-passwordHash -passwordResetCode");
        res.status(200).json(users);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /users/:id
async function getUserById(req, res) {
    try {
        const user = await User.findById(req.params.id).select("-passwordHash -passwordResetCode");
        if (!user) return res.status(404).json({ error: "User not found" });
        const passenger = await PassengerProfile.findOne({ userId: user._id });
        const driver = await DriverProfile.findOne({ userId: user._id });
        res.status(200).json(publicUser(user, { passengerId: passenger?._id, driverId: driver?._id }));
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /users/:id
async function updateUser(req, res) {
    try {
        delete req.body.passwordHash;
        delete req.body.passwordResetCode;

        const user = await User.findByIdAndUpdate(req.params.id, req.body, {
            new: true, runValidators: true
        }).select("-passwordHash -passwordResetCode");

        if (!user) return res.status(404).json({ error: "User not found" });

        res.status(200).json({ message: "User updated successfully", user: publicUser(user) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /users/:id/password
async function changePassword(req, res) {
    try {
        const { currentPassword, newPassword } = req.body;

        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: "User not found" });

        const valid = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

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

module.exports = {
    register,
    login,
    forgotPassword,
    resetPassword,
    getAllUsers,
    getUserById,
    updateUser,
    changePassword,
    deleteUser
};
