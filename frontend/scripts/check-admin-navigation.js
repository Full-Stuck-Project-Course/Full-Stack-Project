const { readFileSync } = require("fs");
const { join } = require("path");

function read(relativePath) {
    return readFileSync(join(__dirname, "..", relativePath), "utf8");
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const navbar = read("src/components/Navbar.jsx");
const adminPanel = read("src/pages/AdminPanel.jsx");

assert(
    /function\s+AdminLink\s*\(/.test(navbar),
    "Navbar must expose a direct AdminLink for admin-only access."
);

assert(
    /const\s+isAdmin\s*=\s*user\?\.role\s*===\s*"admin"/.test(navbar),
    "Navbar must explicitly detect admin users."
);

assert(
    /const\s+isDriver\s*=\s*isAdmin\s*\|\|/.test(navbar) &&
    /const\s+isPassenger\s*=\s*isAdmin\s*\|\|/.test(navbar),
    "Admin users must receive driver and passenger navigation capabilities."
);

assert(
    /<AdminLink\s+pathname=\{pathname\}\s*\/>/.test(navbar),
    "Navbar must render the direct AdminLink for admins."
);

assert(
    /to="\/admin"/.test(navbar) &&
    !/<AdminMenu\s+pathname=\{pathname\}\s*\/>/.test(navbar),
    "Clicking the admin control must go straight to /admin without rendering the old menu."
);

for (const target of ["/driver", "/passenger", "/book", "/history"]) {
    assert(navbar.includes(target), `Admin users must still have top-level access to ${target}.`);
}

assert(
    /useSearchParams/.test(adminPanel) &&
    /searchParams\.get\("tab"\)/.test(adminPanel),
    "AdminPanel must read the tab query parameter."
);

assert(
    /setSearchParams\(\{\s*tab:\s*nextTab\s*\}/.test(adminPanel),
    "AdminPanel tab clicks must update the tab query parameter."
);

console.log("Admin navigation check passed: admins can access admin, driver, and passenger options.");
