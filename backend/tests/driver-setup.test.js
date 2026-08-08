const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const User = require("../db/models/User");
const Vehicle = require("../db/models/Vehicle");
const upload = require("../middleware/upload");
const { completeDriverSetup } = require("../controllers/driverController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

function setupBody(overrides = {}) {
    return {
        licenseNumber: "12345678",
        gender: "male",
        preferredMusic: "rock",
        hobbies: JSON.stringify(["sport"]),
        spokenLanguages: JSON.stringify(["he"]),
        acceptsCarpoolRides: "true",
        vehicleConditions: JSON.stringify({ noPets: false, noSmoking: true, noFood: false }),
        company: "Toyota",
        model: "Corolla",
        year: "2023",
        color: "white",
        licensePlate: "1234567",
        vehicleType: "regular",
        seats: "4",
        ...overrides
    };
}

function setupFiles() {
    return {
        licensePhoto: [{ fieldname: "licensePhoto", originalname: "license.jpg" }],
        testPhoto: [{ fieldname: "testPhoto", originalname: "test.jpg" }],
        insurancePhoto: [{ fieldname: "insurancePhoto", originalname: "insurance.jpg" }]
    };
}

// Uploads are persisted to MongoDB, so the controller asks the middleware for a
// stored path instead of deriving one from a filename on disk.
function patchSaveUpload() {
    patchMethod(patches, upload, "saveUpload", async (file, kind) => ({
        storedPath: `/uploads/${kind}/${file.originalname}`
    }));
}

test("driver setup does not create a profile when required documents are missing", async () => {
    let createDriverCalled = false;
    let createVehicleCalled = false;

    patchMethod(patches, DriverProfile, "findOne", async () => null);
    patchMethod(patches, Vehicle, "findOne", async () => null);
    patchMethod(patches, DriverProfile, "create", async () => {
        createDriverCalled = true;
        return {};
    });
    patchMethod(patches, Vehicle, "create", async () => {
        createVehicleCalled = true;
        return {};
    });

    const res = makeRes();
    await completeDriverSetup({
        user: { userId: "user-1", role: "passenger" },
        body: setupBody(),
        files: {}
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /photos are required/i);
    assert.equal(createDriverCalled, false);
    assert.equal(createVehicleCalled, false);
});

test("driver setup creates driver and vehicle together only after valid documents exist", async () => {
    let driverPayload;
    let vehiclePayload;
    let roleUpdate;

    patchMethod(patches, upload, "isValidImageFile", () => true);
    patchMethod(patches, upload, "cleanupFile", () => {});
    patchSaveUpload();
    patchMethod(patches, DriverProfile, "findOne", async () => null);
    patchMethod(patches, Vehicle, "findOne", async () => null);
    patchMethod(patches, DriverProfile, "create", async (payload) => {
        driverPayload = payload;
        return { _id: "driver-1", ...payload };
    });
    patchMethod(patches, Vehicle, "create", async (payload) => {
        vehiclePayload = payload;
        return { _id: "vehicle-1", ...payload };
    });
    patchMethod(patches, User, "findById", async () => ({ _id: "user-1", role: "passenger" }));
    patchMethod(patches, User, "findByIdAndUpdate", async (id, update) => {
        roleUpdate = { id, update };
        return {};
    });

    const res = makeRes();
    await completeDriverSetup({
        user: { userId: "user-1", role: "passenger" },
        body: setupBody(),
        files: setupFiles()
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(driverPayload.licenseImagePath, "/uploads/licenses/license.jpg");
    assert.equal(driverPayload.isVerified, true);
    assert.equal(vehiclePayload.testImagePath, "/uploads/vehicle-docs/test.jpg");
    assert.equal(vehiclePayload.insuranceImagePath, "/uploads/vehicle-docs/insurance.jpg");
    assert.equal(vehiclePayload.documentsVerificationStatus, "approved");
    assert.deepEqual(roleUpdate, { id: "user-1", update: { role: "both" } });
});

test("driver setup removes a newly-created driver if vehicle creation fails", async () => {
    let deletedDriverId;

    patchMethod(patches, upload, "isValidImageFile", () => true);
    patchMethod(patches, upload, "cleanupFile", () => {});
    patchSaveUpload();
    patchMethod(patches, DriverProfile, "findOne", async () => null);
    patchMethod(patches, Vehicle, "findOne", async () => null);
    patchMethod(patches, DriverProfile, "create", async (payload) => ({ _id: "driver-created", ...payload }));
    patchMethod(patches, Vehicle, "create", async () => {
        const error = new Error("duplicate plate");
        error.code = 11000;
        error.keyValue = { licensePlate: "1234567" };
        throw error;
    });
    patchMethod(patches, Vehicle, "findByIdAndDelete", async () => {});
    patchMethod(patches, DriverProfile, "findByIdAndDelete", async (id) => {
        deletedDriverId = id;
        return {};
    });

    const res = makeRes();
    await completeDriverSetup({
        user: { userId: "user-1", role: "passenger" },
        body: setupBody(),
        files: setupFiles()
    }, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /licensePlate already exists/);
    assert.equal(deletedDriverId, "driver-created");
});
