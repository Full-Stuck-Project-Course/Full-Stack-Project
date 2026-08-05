require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const User = require("../db/models/User");
const PassengerProfile = require("../db/models/PassengerProfile");

const dryRun = process.argv.includes("--dry-run");

async function main() {
    if (!process.env.DB_CONNECTION) {
        throw new Error("DB_CONNECTION is required");
    }

    await mongoose.connect(process.env.DB_CONNECTION);

    const legacyProfiles = await PassengerProfile.collection
        .find({ loyaltyPoints: { $exists: true } })
        .toArray();

    let inspected = 0;
    let userUpdates = 0;
    let unsetProfiles = 0;

    for (const profile of legacyProfiles) {
        inspected += 1;
        const legacyPoints = Math.max(0, Number(profile.loyaltyPoints || 0));
        const user = await User.findById(profile.userId).select("loyaltyPoints");

        if (user && legacyPoints > Number(user.loyaltyPoints || 0)) {
            userUpdates += 1;
            if (!dryRun) {
                await User.findByIdAndUpdate(user._id, { loyaltyPoints: legacyPoints });
            }
        }

        unsetProfiles += 1;
        if (!dryRun) {
            await PassengerProfile.collection.updateOne(
                { _id: profile._id },
                { $unset: { loyaltyPoints: "" } }
            );
        }
    }

    console.log(JSON.stringify({
        dryRun,
        inspected,
        userUpdates,
        unsetProfiles
    }));

    await mongoose.disconnect();
}

main().catch(async (error) => {
    console.error(error.message);
    try {
        await mongoose.disconnect();
    } catch {}
    process.exit(1);
});
