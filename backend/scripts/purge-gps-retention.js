require("dotenv").config();

const mongoose = require("mongoose");
const connectMongo = require("../db/mongo");
const { getGpsRetentionDays, scrubExpiredGpsData } = require("../utils/privacyCleanup");

function count(result) {
    return result?.modifiedCount ?? result?.nModified ?? 0;
}

(async () => {
    const retentionDays = Number(process.argv[2] || process.env.GPS_RETENTION_DAYS || getGpsRetentionDays());
    await connectMongo();
    const summary = await scrubExpiredGpsData({ retentionDays });

    console.log(JSON.stringify({
        retentionDays: summary.retentionDays,
        cutoff: summary.cutoff.toISOString(),
        scrubbed: {
            driverLocations: count(summary.driverLocations),
            rides: count(summary.rides),
            rideStops: count(summary.rideStops),
            carpoolRequests: count(summary.carpoolRequests)
        }
    }, null, 2));

    await mongoose.disconnect();
})().catch(async (error) => {
    console.error(error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
