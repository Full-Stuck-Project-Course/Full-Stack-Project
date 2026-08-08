require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const mongoose = require("mongoose");
const DriverProfile = require("../db/models/DriverProfile");
const Payment = require("../db/models/payment");
const Ride = require("../db/models/Ride");
const User = require("../db/models/User");
const Vehicle = require("../db/models/Vehicle");

const dryRun = process.argv.includes("--dry-run");

// Documents and payments are approved automatically, but records created before
// that behaviour existed can still be sitting in "pending" and show up in the UI
// as "under automatic review". This settles them.
async function approvePendingApprovals({
    UserModel = User,
    DriverProfileModel = DriverProfile,
    VehicleModel = Vehicle,
    RideModel = Ride,
    PaymentModel = Payment,
    apply = true
} = {}) {
    // Only approve documents that were actually uploaded. A pending record with
    // no file behind it is not submitted, not approved.
    const idFilter = { idVerificationStatus: "pending", idPhotoPath: { $nin: [null, ""] } };
    const orphanIdFilter = { idVerificationStatus: "pending", idPhotoPath: { $in: [null, ""] } };
    const licenseFilter = { verificationStatus: "pending", licenseImagePath: { $nin: [null, ""] } };
    const orphanLicenseFilter = { verificationStatus: "pending", licenseImagePath: { $in: [null, ""] } };
    const vehicleFilter = {
        documentsVerificationStatus: "pending",
        testImagePath: { $nin: [null, ""] },
        insuranceImagePath: { $nin: [null, ""] }
    };
    const partialVehicleFilter = {
        documentsVerificationStatus: "pending",
        $or: [
            { testImagePath: { $in: [null, ""] } },
            { insuranceImagePath: { $in: [null, ""] } }
        ]
    };

    const completedRideIds = (await RideModel.find({ status: "completed" }).select("_id"))
        .map(ride => ride._id);
    const unpaidFilter = {
        rideId: { $in: completedRideIds },
        paymentStatus: "pending"
    };

    const counts = {
        approvedIds: await UserModel.countDocuments(idFilter),
        resetIds: await UserModel.countDocuments(orphanIdFilter),
        approvedLicenses: await DriverProfileModel.countDocuments(licenseFilter),
        resetLicenses: await DriverProfileModel.countDocuments(orphanLicenseFilter),
        approvedVehicles: await VehicleModel.countDocuments(vehicleFilter),
        resetVehicles: await VehicleModel.countDocuments(partialVehicleFilter),
        settledPayments: await PaymentModel.countDocuments(unpaidFilter)
    };

    if (!apply) return { dryRun: true, ...counts };

    await UserModel.updateMany(idFilter, { $set: { idVerificationStatus: "approved" } });
    await UserModel.updateMany(orphanIdFilter, { $set: { idVerificationStatus: "not_submitted" } });

    await DriverProfileModel.updateMany(licenseFilter, {
        $set: { verificationStatus: "approved", isVerified: true }
    });
    await DriverProfileModel.updateMany(orphanLicenseFilter, {
        $set: { verificationStatus: "not_submitted", isVerified: false }
    });

    await VehicleModel.updateMany(vehicleFilter, {
        $set: {
            documentsVerificationStatus: "approved",
            testApproval: true,
            insuranceApproval: true
        }
    });
    await VehicleModel.updateMany(partialVehicleFilter, {
        $set: { documentsVerificationStatus: "not_submitted" }
    });

    await PaymentModel.updateMany(unpaidFilter, {
        $set: {
            paymentStatus: "paid",
            paymentProvider: "simulated",
            paidAt: new Date()
        }
    });

    return { dryRun: false, ...counts };
}

async function main() {
    if (!process.env.DB_CONNECTION) {
        throw new Error("DB_CONNECTION is required");
    }

    await mongoose.connect(process.env.DB_CONNECTION);
    const result = await approvePendingApprovals({ apply: !dryRun });
    console.log(JSON.stringify(result, null, 2));
    await mongoose.disconnect();
}

if (require.main === module) {
    main().catch(async (error) => {
        console.error(error.message);
        try {
            await mongoose.disconnect();
        } catch {}
        process.exit(1);
    });
}

module.exports = { approvePendingApprovals };
