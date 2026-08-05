const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const routing = readFileSync(join(__dirname, "..", "src", "routing.jsx"), "utf8");

assert(
    /from\s+"react-router-dom"/.test(routing),
    "routing.jsx must delegate routing primitives to react-router-dom."
);

for (const manualImplementation of [
    "createContext",
    "window.history",
    "matchPath(",
    "popstate",
    "pushState",
    "replaceState"
]) {
    assert(
        !routing.includes(manualImplementation),
        `routing.jsx must not contain manual router implementation code: ${manualImplementation}`
    );
}

for (const exportName of [
    "BrowserRouter",
    "Link",
    "Navigate",
    "Route",
    "Routes",
    "useLocation",
    "useNavigate",
    "useParams",
    "useSearchParams"
]) {
    assert(
        new RegExp(`\\b${exportName}\\b`).test(routing),
        `routing.jsx must re-export ${exportName}.`
    );
}

console.log("Router adapter check passed: routing primitives come from react-router-dom.");
