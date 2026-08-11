const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const source = readFileSync(join(__dirname, "..", "src", "pages", "DriverSetupPage.jsx"), "utf8");
const submitStart = source.indexOf("const handleSubmit = async");

assert(submitStart !== -1, "DriverSetupPage must define a submit handler.");
const submitSource = source.slice(submitStart);

assert(
    submitSource.includes('api.post("/drivers/setup"'),
    "Driver setup must use the atomic /drivers/setup endpoint."
);
for (const oldEndpoint of [
    'api.post("/drivers"',
    'api.post("/vehicles"',
    'api.post("/uploads/license"',
    'api.post("/uploads/vehicle-test"',
    'api.post("/uploads/vehicle-insurance"'
]) {
    assert(
        !submitSource.includes(oldEndpoint),
        `Driver setup must not call ${oldEndpoint} directly from submit.`
    );
}
assert(
    source.includes("MAX_DOCUMENT_BYTES") && source.includes("15 * 1024 * 1024"),
    "Driver setup must validate the 15MB document size limit before submitting."
);
assert(
    source.includes('api.post("/drivers/check-license-number"'),
    "Driver setup must check driver license number availability while editing."
);
assert(
    source.includes('api.post("/vehicles/check-license-plate"'),
    "Driver setup must check vehicle license plate availability while editing."
);
assert(
    source.includes("licenseChecking") && source.includes("plateChecking"),
    "Driver setup must block navigation while license availability checks are pending."
);
assert(
    source.includes("const userGender") && source.includes("gender: prev.gender || userGender"),
    "Driver setup must prefill gender from an existing user gender."
);
assert(
    source.includes('e.target.value = ""'),
    "File inputs must reset their value so the same corrected file can be selected again."
);

console.log("Atomic driver setup check passed.");
