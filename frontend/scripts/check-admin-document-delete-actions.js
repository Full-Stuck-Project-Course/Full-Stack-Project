const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const source = readFileSync(join(__dirname, "..", "src/pages/AdminPanel.jsx"), "utf8");

const forbiddenResetActions = [
    {
        pattern: /api\.put\(`\/uploads\/verify-id\/\$\{user\._id\}`,\s*\{\s*status:\s*"not_submitted"\s*\}\)/,
        message: "Admin ID delete action must not only reset the verification status."
    },
    {
        pattern: /api\.put\(`\/uploads\/verify-driver\/\$\{driver\._id\}`,\s*\{\s*status:\s*"not_submitted"\s*\}\)/,
        message: "Admin driver-document delete action must not only reset the verification status."
    },
    {
        pattern: /api\.put\(`\/uploads\/verify-vehicle\/\$\{vehicle\._id\}`,\s*\{\s*status:\s*"not_submitted"\s*\}\)/,
        message: "Admin vehicle-document delete action must not only reset the verification status."
    }
];

for (const { pattern, message } of forbiddenResetActions) {
    assert(!pattern.test(source), message);
}

for (const snippet of [
    'api.delete(`/uploads/id-photo/${user._id}`)',
    'api.delete(`/uploads/license/${driver._id}`)',
    'api.delete(`/uploads/vehicle-docs/${vehicle._id}`)',
    ">מחק תז</button>",
    ">מחק מסמכי נהג</button>",
    ">מחק מסמכי רכב</button>"
]) {
    assert(source.includes(snippet), `AdminPanel must include ${snippet}.`);
}

console.log("Admin document delete check passed: reset actions delete uploaded files and expose re-upload.");
