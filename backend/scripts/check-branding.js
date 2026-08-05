const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..", "..");

const checks = [
  {
    file: "README.md",
    mustInclude: ["# HailNow"],
    mustNotInclude: ["# CarPool App", "claude folder/"]
  },
  {
    file: "start.bat",
    mustInclude: ["HailNow - Starting Up", "HailNow Backend", "HailNow Frontend"],
    mustNotInclude: ["CarPool App", "CarPool Backend", "CarPool Frontend"]
  },
  {
    file: "backend/package.json",
    mustInclude: ['"name": "hailnow-backend"', '"description": "HailNow backend API"'],
    mustNotInclude: ['"name": "carpool-backend"', "Carpool / Ride-Hailing backend API"]
  },
  {
    file: "backend/package-lock.json",
    mustInclude: ['"name": "hailnow-backend"'],
    mustNotInclude: ['"name": "carpool-backend"']
  },
  {
    file: "frontend/package.json",
    mustInclude: ['"name": "hailnow-frontend"'],
    mustNotInclude: ['"name": "carpool-frontend"']
  },
  {
    file: "frontend/package-lock.json",
    mustInclude: ['"name": "hailnow-frontend"'],
    mustNotInclude: ['"name": "carpool-frontend"']
  }
];

const failures = [];

for (const check of checks) {
  const absolutePath = path.join(repoRoot, check.file);
  const content = fs.readFileSync(absolutePath, "utf8");

  for (const expected of check.mustInclude) {
    if (!content.includes(expected)) {
      failures.push(`${check.file} is missing expected branding text: ${expected}`);
    }
  }

  for (const legacy of check.mustNotInclude) {
    if (content.includes(legacy)) {
      failures.push(`${check.file} still contains legacy branding text: ${legacy}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Branding consistency check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Branding consistency check passed: docs, startup script, and package names use HailNow.");
