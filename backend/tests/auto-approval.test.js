const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const Notification = require("../db/models/Notification");
const User = require("../db/models/User");
const Vehicle = require("../db/models/Vehicle");
const upload = require("../middleware/upload");
const {
    uploadProfile,
    uploadIdPhoto,
    uploadVehicleTest
} = require("../controllers/uploadController");
const { approvePendingApprovals } = require("../scripts/approve-pending-approvals");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

function captureNotifications() {
    const captured = { sent: [], rooms: [] };
    patchMethod(patches, Notification, "insertMany", async (docs) => {
        captured.sent.push(...docs);
        return docs.map((doc, index) => ({ _id: `notification-${index}`, ...doc }));
    });
    captured.io = {
        to(room) {
            captured.rooms.push(room);
            return { emit(event) { captured.event = event; } };
        }
    };
    return captured;
}

function uploadRequest(captured, overrides = {}) {
    return {
        app: { get: (key) => key === "io" ? captured.io : null },
        user: { userId: "user-1", role: "passenger" },
        file: { originalname: "photo.jpg", mimetype: "image/jpeg", size: 100, buffer: Buffer.alloc(1) },
        body: {},
        ...overrides
    };
}

test("uploading a profile picture approves it automatically and tells the user", async () => {
    const captured = captureNotifications();

    patchMethod(patches, upload, "isValidImageFile", () => true);
    patchMethod(patches, upload, "saveUpload", async () => ({ storedPath: "/uploads/profiles/a.jpg" }));
    patchMethod(patches, User, "findByIdAndUpdate", async (id, update) => ({ _id: id, ...update }));

    const res = makeRes();
    await uploadProfile(uploadRequest(captured), res);

    assert.equal(res.statusCode, 200);
    assert.match(res.body.message, /approved/i);
    assert.equal(captured.sent.length, 1);
    assert.equal(captured.sent[0].type, "document_approved");
    assert.equal(captured.sent[0].userId, "user-1");
    assert.match(captured.sent[0].title, /תמונת הפרופיל/);
    assert.deepEqual(captured.rooms, ["user:user-1"]);
    assert.equal(captured.event, "document-approved");
});

test("uploading an ID photo approves it immediately and never leaves it pending", async () => {
    const captured = captureNotifications();
    let storedUpdate;

    patchMethod(patches, upload, "isValidImageFile", () => true);
    patchMethod(patches, upload, "saveUpload", async () => ({ storedPath: "/uploads/ids/a.jpg" }));
    patchMethod(patches, User, "findByIdAndUpdate", async (id, update) => {
        storedUpdate = update;
        return { _id: id, ...update };
    });

    const res = makeRes();
    await uploadIdPhoto(uploadRequest(captured), res);

    assert.equal(res.statusCode, 200);
    assert.equal(storedUpdate.idVerificationStatus, "approved");
    assert.equal(captured.sent.length, 1);
    assert.equal(captured.sent[0].type, "document_approved");
    assert.match(captured.sent[0].title, /תעודת הזהות/);
});

test("a half-documented vehicle is not_submitted rather than pending review", async () => {
    const captured = captureNotifications();
    let vehicleUpdate;

    patchMethod(patches, upload, "isValidImageFile", () => true);
    patchMethod(patches, upload, "saveUpload", async () => ({ storedPath: "/uploads/vehicle-docs/test.jpg" }));
    patchMethod(patches, Vehicle, "findById", async () => ({
        _id: "vehicle-1",
        driverId: "driver-1",
        testImagePath: null,
        insuranceImagePath: null
    }));
    patchMethod(patches, Vehicle, "findByIdAndUpdate", async (id, update) => {
        vehicleUpdate = update;
        return { _id: id, ...update };
    });
    patchMethod(patches, DriverProfile, "findById", () => ({
        select: async () => ({ userId: "driver-user" })
    }));

    const res = makeRes();
    await uploadVehicleTest(uploadRequest(captured, {
        user: { userId: "admin-user", role: "admin" },
        body: { vehicleId: "vehicle-1" }
    }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(vehicleUpdate.documentsVerificationStatus, "not_submitted");
    assert.equal(vehicleUpdate.testApproval, true, "the uploaded document itself is approved");
    assert.equal(vehicleUpdate.insuranceApproval, false);
    assert.equal(captured.sent[0].userId, "driver-user");
});

test("a fully documented vehicle is approved as soon as the second document arrives", async () => {
    const captured = captureNotifications();
    let vehicleUpdate;

    patchMethod(patches, upload, "isValidImageFile", () => true);
    patchMethod(patches, upload, "saveUpload", async () => ({ storedPath: "/uploads/vehicle-docs/test.jpg" }));
    patchMethod(patches, Vehicle, "findById", async () => ({
        _id: "vehicle-1",
        driverId: "driver-1",
        testImagePath: null,
        insuranceImagePath: "/uploads/vehicle-docs/insurance.jpg"
    }));
    patchMethod(patches, Vehicle, "findByIdAndUpdate", async (id, update) => {
        vehicleUpdate = update;
        return { _id: id, ...update };
    });
    patchMethod(patches, DriverProfile, "findById", () => ({
        select: async () => ({ userId: "driver-user" })
    }));

    const res = makeRes();
    await uploadVehicleTest(uploadRequest(captured, {
        user: { userId: "admin-user", role: "admin" },
        body: { vehicleId: "vehicle-1" }
    }), res);

    assert.equal(vehicleUpdate.documentsVerificationStatus, "approved");
    assert.equal(vehicleUpdate.testApproval, true);
    assert.equal(vehicleUpdate.insuranceApproval, true);
});

test("driver profiles start as not_submitted so nothing sits in review", () => {
    const driver = new DriverProfile({ userId: "user-1", licenseNumber: "123", gender: "female" });
    assert.equal(driver.verificationStatus, "not_submitted");
});

test("the migration approves uploaded documents and resets ones with no file behind them", async () => {
    const calls = [];

    function model(counts) {
        return {
            async countDocuments(filter) {
                return counts.shift() ?? 0;
            },
            async updateMany(filter, update) {
                calls.push({ filter, update });
            }
        };
    }

    const result = await approvePendingApprovals({
        UserModel: model([2, 1]),
        DriverProfileModel: model([1, 0]),
        VehicleModel: model([1, 3]),
        RideModel: { find: () => ({ select: async () => [{ _id: "ride-1" }] }) },
        PaymentModel: model([4])
    });

    assert.deepEqual(result, {
        dryRun: false,
        approvedIds: 2,
        resetIds: 1,
        approvedLicenses: 1,
        resetLicenses: 0,
        approvedVehicles: 1,
        resetVehicles: 3,
        settledPayments: 4
    });

    const updates = calls.map(call => call.update.$set);
    assert.equal(updates[0].idVerificationStatus, "approved");
    assert.equal(updates[1].idVerificationStatus, "not_submitted");
    assert.equal(updates[2].verificationStatus, "approved");
    assert.equal(updates[2].isVerified, true);
    assert.equal(updates[4].documentsVerificationStatus, "approved");
    assert.equal(updates[6].paymentStatus, "paid");
});

test("the migration reports what it would change without writing in dry-run mode", async () => {
    let wrote = false;

    function model(counts) {
        return {
            async countDocuments() {
                return counts.shift() ?? 0;
            },
            async updateMany() {
                wrote = true;
            }
        };
    }

    const result = await approvePendingApprovals({
        UserModel: model([5, 0]),
        DriverProfileModel: model([0, 0]),
        VehicleModel: model([0, 0]),
        RideModel: { find: () => ({ select: async () => [] }) },
        PaymentModel: model([0]),
        apply: false
    });

    assert.equal(result.dryRun, true);
    assert.equal(result.approvedIds, 5);
    assert.equal(wrote, false);
});
