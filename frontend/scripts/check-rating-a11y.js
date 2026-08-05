const { readFileSync } = require("fs");
const { join } = require("path");

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const ratingPage = readFileSync(join(__dirname, "..", "src", "pages", "RatingPage.jsx"), "utf8");

assert(
    !ratingPage.includes("starsLabel"),
    "RatingPage must not expose the raw starsLabel translation key to assistive technology."
);

assert(
    /function\s+getStarAriaLabel\s*\(\s*n\s*\)/.test(ratingPage),
    "RatingPage must build a meaningful star aria-label."
);

assert(
    /aria-label=\{getStarAriaLabel\(n\)\}/.test(ratingPage),
    "Rating stars must use the meaningful aria-label helper."
);

assert(
    /role="radiogroup"\s+aria-label="דירוג כוכבים"/.test(ratingPage),
    "Rating stars must be grouped as a labelled radiogroup."
);

console.log("Rating accessibility check passed: star controls expose meaningful Hebrew labels.");
