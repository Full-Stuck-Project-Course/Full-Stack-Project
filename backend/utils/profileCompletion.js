function isTemporaryGooglePhone(phone) {
    return /^google-[a-z0-9_-]+$/i.test(String(phone || ""));
}

function needsProfileCompletion(user) {
    return Boolean(user && (
        isTemporaryGooglePhone(user.phone) ||
        (user.authProvider === "google" && !user.idPhotoPath)
    ));
}

module.exports = {
    isTemporaryGooglePhone,
    needsProfileCompletion
};
