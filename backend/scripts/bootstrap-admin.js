require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../db/models/User");
const PassengerProfile = require("../db/models/PassengerProfile");

function normalizeBootstrapConfig(env = process.env) {
    const email = String(env.BOOTSTRAP_ADMIN_EMAIL || "").trim().toLowerCase();
    const fullName = String(env.BOOTSTRAP_ADMIN_FULL_NAME || "").trim();
    const phone = String(env.BOOTSTRAP_ADMIN_PHONE || "").trim();
    const password = String(env.BOOTSTRAP_ADMIN_PASSWORD || "");

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        throw new Error("BOOTSTRAP_ADMIN_EMAIL must be a valid email address");
    }
    if (fullName.length < 2) {
        throw new Error("BOOTSTRAP_ADMIN_FULL_NAME must be at least 2 characters");
    }
    if (!/^05\d{8}$/.test(phone)) {
        throw new Error("BOOTSTRAP_ADMIN_PHONE must match Israeli mobile format, e.g. 0501234567");
    }
    if (
        password.length < 8 ||
        password.length > 128 ||
        !/[A-Z]/.test(password) ||
        !/[a-z]/.test(password) ||
        !/[0-9]/.test(password)
    ) {
        throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be 8-128 chars and include uppercase, lowercase, and digit");
    }

    return { email, fullName, phone, password };
}

async function ensurePassengerProfile(PassengerProfileModel, userId) {
    return PassengerProfileModel.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function bootstrapAdmin({
    env = process.env,
    UserModel = User,
    PassengerProfileModel = PassengerProfile,
    bcryptLib = bcrypt
} = {}) {
    const config = normalizeBootstrapConfig(env);

    const existingAdmin = await UserModel.findOne({ role: "admin" }).select("_id email");
    if (existingAdmin) {
        return {
            changed: false,
            action: "skipped",
            reason: "admin_exists",
            userId: existingAdmin._id,
            email: existingAdmin.email
        };
    }

    const passwordHash = await bcryptLib.hash(config.password, 10);
    const existingUser = await UserModel.findOne({ email: config.email });

    if (existingUser) {
        const user = await UserModel.findByIdAndUpdate(
            existingUser._id,
            {
                fullName: config.fullName,
                phone: config.phone,
                passwordHash,
                role: "admin",
                isActive: true,
                isEmailVerified: true
            },
            { new: true, runValidators: true }
        );
        await ensurePassengerProfile(PassengerProfileModel, user._id);
        return {
            changed: true,
            action: "promoted",
            userId: user._id,
            email: user.email
        };
    }

    const user = await UserModel.create({
        fullName: config.fullName,
        email: config.email,
        passwordHash,
        phone: config.phone,
        role: "admin",
        preferredLanguage: "he",
        isActive: true,
        isEmailVerified: true
    });
    await ensurePassengerProfile(PassengerProfileModel, user._id);

    return {
        changed: true,
        action: "created",
        userId: user._id,
        email: user.email
    };
}

async function main() {
    if (!process.env.DB_CONNECTION) {
        throw new Error("DB_CONNECTION is required");
    }

    await mongoose.connect(process.env.DB_CONNECTION);
    const result = await bootstrapAdmin();

    if (result.action === "skipped") {
        console.log(`Admin already exists (${result.email || result.userId}); no bootstrap changes made.`);
    } else {
        console.log(`Bootstrap admin ${result.action}: ${result.email} (${result.userId}).`);
    }
}

if (require.main === module) {
    main()
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        })
        .finally(async () => {
            try {
                await mongoose.disconnect();
            } catch {}
        });
}

module.exports = {
    bootstrapAdmin,
    normalizeBootstrapConfig
};
