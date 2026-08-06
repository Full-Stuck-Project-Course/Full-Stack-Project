const test = require("node:test");
const assert = require("node:assert/strict");

const DriverProfile = require("../db/models/DriverProfile");
const User = require("../db/models/User");
const Vehicle = require("../db/models/Vehicle");
const {
    deleteDriverLicensePhoto,
    deleteIdPhoto,
    deleteVehicleDocuments
} = require("../controllers/uploadController");
const {
    makeRes,
    patchMethod,
    restoreMethods
} = require("./helpers/controllerTestUtils");

const patches = [];

test.afterEach(() => {
    restoreMethods(patches);
});

function persistedDocument(overrides) {
    return {
        saveCount: 0,
        async save() {
            this.saveCount += 1;
            return this;
        },
        ...overrides
    };
}

test("deleting an ID photo clears the stored path and lets the user submit again", async () => {
    const user = persistedDocument({
        _id: "user-1",
        idPhotoPath: "/uploads/ids/id-photo.jpg",
        idVerificationStatus: "approved"
    });

    patchMethod(patches, User, "findById", async id => {
        assert.equal(id, "user-1");
        return user;
    });

    const res = makeRes();
    await deleteIdPhoto({ params: { userId: "user-1" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(user.idPhotoPath, null);
    assert.equal(user.idVerificationStatus, "not_submitted");
    assert.equal(user.saveCount, 1);
});

test("deleting driver documents clears the license and disables verification", async () => {
    const driver = persistedDocument({
        _id: "driver-1",
        licenseImagePath: "/uploads/licenses/license.jpg",
        verificationStatus: "approved",
        isVerified: true,
        status: "available"
    });

    patchMethod(patches, DriverProfile, "findById", async id => {
        assert.equal(id, "driver-1");
        return driver;
    });

    const res = makeRes();
    await deleteDriverLicensePhoto({ params: { driverProfileId: "driver-1" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(driver.licenseImagePath, null);
    assert.equal(driver.verificationStatus, "not_submitted");
    assert.equal(driver.isVerified, false);
    assert.equal(driver.status, "offline");
    assert.equal(driver.saveCount, 1);
});

test("deleting vehicle documents clears all uploaded vehicle document state", async () => {
    const vehicle = persistedDocument({
        _id: "vehicle-1",
        testImagePath: "/uploads/vehicle-docs/test.jpg",
        insuranceImagePath: "/uploads/vehicle-docs/insurance.jpg",
        testApproval: true,
        insuranceApproval: true,
        documentsVerificationStatus: "approved"
    });

    patchMethod(patches, Vehicle, "findById", async id => {
        assert.equal(id, "vehicle-1");
        return vehicle;
    });

    const res = makeRes();
    await deleteVehicleDocuments({ params: { vehicleId: "vehicle-1" } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(vehicle.testImagePath, null);
    assert.equal(vehicle.insuranceImagePath, null);
    assert.equal(vehicle.testApproval, false);
    assert.equal(vehicle.insuranceApproval, false);
    assert.equal(vehicle.documentsVerificationStatus, "not_submitted");
    assert.equal(vehicle.saveCount, 1);
});
