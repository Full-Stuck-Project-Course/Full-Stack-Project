// controllers/userController.js

const User = require("../db/models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// POST /users/register
async function register(req, res) {
    try {
        const { fullName, email, password, phone, preferredLanguage, role } = req.body;

        const existing = await User.findOne({ email });
        if (existing) return res.status(409).json({ error: "Email already in use" });

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await User.create({
            fullName, email, passwordHash, phone,
            preferredLanguage, role
        });

        res.status(201).json({ message: "User registered successfully", userId: user._id });
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

        const token = jwt.sign(
            { userId: user._id, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        user.lastLoginAt = new Date();
        await user.save();

        res.status(200).json({ message: "Login successful", token, userId: user._id, role: user.role });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /users
async function getAllUsers(req, res) {
    try {
        const users = await User.find().select("-passwordHash");
        res.status(200).json(users);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// GET /users/:id
async function getUserById(req, res) {
    try {
        const user = await User.findById(req.params.id).select("-passwordHash");
        if (!user) return res.status(404).json({ error: "User not found" });
        res.status(200).json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
}

// PUT /users/:id
async function updateUser(req, res) {
    try {
        // Prevent updating passwordHash directly via this route
        delete req.body.passwordHash;

        const user = await User.findByIdAndUpdate(req.params.id, req.body, {
            new: true, runValidators: true
        }).select("-passwordHash");

        if (!user) return res.status(404).json({ error: "User not found" });

        res.status(200).json({ message: "User updated successfully", user });
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

module.exports = { register, login, getAllUsers, getUserById, updateUser, changePassword, deleteUser };
