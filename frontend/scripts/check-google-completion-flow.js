const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const source = readFileSync(join(__dirname, "..", "src", "pages", "CompleteProfilePage.jsx"), "utf8");
const submitStart = source.indexOf("const submit = async");

assert(submitStart !== -1, "CompleteProfilePage must define the profile completion submit handler.");

const completeProfileCall = source.indexOf("complete-profile", submitStart);
const idUploadCall = source.indexOf('api.post("/uploads/id-photo"', submitStart);
const refreshUserCall = source.indexOf("api.get(`/users/${user.userId}`)", submitStart);

assert(completeProfileCall !== -1, "Google completion must save profile details.");
assert(idUploadCall !== -1, "Google completion must upload the ID photo.");
assert(refreshUserCall !== -1, "Google completion must refresh the user after ID upload.");
assert(
    completeProfileCall < idUploadCall,
    "Google completion must save profile details before uploading the ID photo to avoid already-complete conflicts."
);
assert(
    idUploadCall < refreshUserCall,
    "Google completion must refresh the user only after the ID photo upload updates verification state."
);
assert(
    source.includes('digits === String(user?.phone || "")'),
    "Phone availability checks must not flag the current user's own phone as already in use."
);
assert(
    /needsProfileCompletion:\s*refreshedUser\.needsProfileCompletion\s*\?\?\s*false/.test(source),
    "Google completion must clear local completion state from the refreshed server response."
);

console.log("Google completion flow check passed.");
