const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

const repoRoot = join(__dirname, "..", "..");
const ignoredTrackedPaths = ["frontend/build", ".idea"];

const tracked = execFileSync("git", ["ls-files", ...ignoredTrackedPaths], {
  cwd: repoRoot,
  encoding: "utf8"
})
  .split(/\r?\n/)
  .filter(Boolean);

if (tracked.length > 0) {
  console.error("Tracked generated or IDE files were found:");
  for (const file of tracked) {
    console.error(`- ${file}`);
  }
  console.error("Remove these paths from Git tracking and keep them ignored.");
  process.exit(1);
}

console.log("No generated build or IDE files are tracked.");
