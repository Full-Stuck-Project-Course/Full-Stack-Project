require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const Rating = require("../db/models/rating");

const dryRun = process.argv.includes("--dry-run");
const { PASSENGER_TO_DRIVER } = Rating.RATING_DIRECTIONS;

async function main() {
    if (!process.env.DB_CONNECTION) {
        throw new Error("DB_CONNECTION is required");
    }

    await mongoose.connect(process.env.DB_CONNECTION);

    const collection = Rating.collection;
    const indexes = await collection.indexes();
    const legacyRideIndex = indexes.find(index =>
        index.unique === true &&
        index.key?.rideId === 1 &&
        Object.keys(index.key).length === 1
    );
    const legacyDirectionIndex = indexes.find(index =>
        index.unique === true &&
        index.key?.rideId === 1 &&
        index.key?.direction === 1 &&
        Object.keys(index.key).length === 2
    );

    const missingDirectionCount = await collection.countDocuments({
        direction: { $exists: false }
    });

    if (!dryRun && missingDirectionCount > 0) {
        await collection.updateMany(
            { direction: { $exists: false } },
            { $set: { direction: PASSENGER_TO_DRIVER } }
        );
    }

    if (!dryRun && legacyRideIndex) {
        await collection.dropIndex(legacyRideIndex.name);
    }
    if (!dryRun && legacyDirectionIndex) {
        await collection.dropIndex(legacyDirectionIndex.name);
    }

    if (!dryRun) {
        await collection.createIndex(
            { rideId: 1, direction: 1, passengerId: 1 },
            { unique: true, name: "rideId_1_direction_1_passengerId_1" }
        );
    }

    console.log(JSON.stringify({
        dryRun,
        missingDirectionCount,
        legacyRideIndexName: legacyRideIndex?.name || null,
        legacyDirectionIndexName: legacyDirectionIndex?.name || null,
        compoundDirectionIndex: "rideId_1_direction_1_passengerId_1"
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
