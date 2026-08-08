const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const src = join(__dirname, "..", "src");

function read(...parts) {
    return readFileSync(join(src, ...parts), "utf8");
}

const verification = read("api", "verification.js");
const profilePage = read("pages", "ProfilePage.jsx");
const driverDashboard = read("pages", "DriverDashboard.jsx");
const adminPanel = read("pages", "AdminPanel.jsx");
const overlay = read("components", "AutoVerificationOverlay.jsx");

// Uploaded documents are approved automatically, so no screen may render a
// "pending"/under-review state for one.
assert(
    /documentStatus\(rawStatus, hasFile\)/.test(verification) &&
        verification.includes('return DOCUMENT_STATUS.APPROVED'),
    "verification.js must resolve any uploaded document to approved."
);

assert(
    !/DOCUMENT_STATUS_LABELS\s*=\s*{[^}]*pending/s.test(verification),
    "verification.js must not define a pending label for documents."
);

const surfaces = [
    ["ProfilePage.jsx", profilePage],
    ["DriverDashboard.jsx", driverDashboard],
    ["AdminPanel.jsx", adminPanel]
];

for (const [name, content] of surfaces) {
    assert(
        content.includes('from "../api/verification"'),
        `${name} must derive document status from the shared verification helper.`
    );
    assert(
        !content.includes("בבדיקה אוטומטית"),
        `${name} must not tell the user a document is under automatic review.`
    );
    assert(
        !/pending:\s*"/.test(content),
        `${name} must not carry its own pending document label.`
    );
}

assert(
    !/safeText\(driver\.verificationStatus\)/.test(adminPanel) &&
        !/safeText\(vehicle\.documentsVerificationStatus\)/.test(adminPanel),
    "AdminPanel must not print raw verification statuses; use the shared labels."
);

assert(
    driverDashboard.includes("documentRows") && driverDashboard.includes("המסמכים שלי"),
    "The driver dashboard must show the status of the driver's uploaded documents."
);

assert(
    !overlay.includes("בודק עכשיו"),
    "The verification overlay must describe automatic approval, not review."
);

console.log("Auto-approved document check passed: no upload surface shows a review state.");
