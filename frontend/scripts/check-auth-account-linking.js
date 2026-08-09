const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function read(relativePath) {
    return readFileSync(join(__dirname, "..", relativePath), "utf8");
}

const registerPage = read("src/pages/RegisterPage.jsx");
const loginPage = read("src/pages/LoginPage.jsx");
const forgotPasswordPage = read("src/pages/ForgotPasswordPage.jsx");

assert(
    registerPage.includes('api.post("/users/check-email"'),
    "RegisterPage must check email availability while the user types."
);
assert(
    /\bemailChecking\b/.test(registerPage) && /\bemailInUse\b/.test(registerPage) && /\bemailChecked\b/.test(registerPage),
    "RegisterPage must track email availability state separately from phone state."
);
assert(
    /emailCheckSeq\.current/.test(registerPage),
    "RegisterPage must ignore stale email availability responses."
);
assert(
    /emailCheckTimer\.current/.test(registerPage) && /setTimeout/.test(registerPage) && /clearTimeout/.test(registerPage),
    "RegisterPage must debounce email availability checks to avoid auth rate-limit churn."
);
assert(
    /emailStatusIcon/.test(registerPage),
    "RegisterPage must render a status indicator for email availability."
);

assert(
    loginPage.includes("GOOGLE_PASSWORD_RESET_REQUIRED"),
    "LoginPage must detect Google-created accounts that need a password reset."
);
assert(
    /forgotPasswordPath[\s\S]*\/forgot-password\?email=/.test(loginPage),
    "LoginPage must link Google-created email-login failures to forgot-password with the typed email."
);

assert(
    /useSearchParams/.test(forgotPasswordPage) && /params\.get\("email"\)/.test(forgotPasswordPage),
    "ForgotPasswordPage must prefill the email when LoginPage links to it."
);

console.log("Auth account-linking checks passed.");
