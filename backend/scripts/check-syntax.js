const { readdirSync, statSync } = require("fs");
const { join } = require("path");
const { spawnSync } = require("child_process");

const root = join(__dirname, "..");
const skipDirs = new Set(["node_modules", "uploads", "public"]);
const files = [];

function walk(dir) {
    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            if (!skipDirs.has(entry)) walk(fullPath);
            continue;
        }
        if (entry.endsWith(".js")) files.push(fullPath);
    }
}

walk(root);

for (const file of files) {
    const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
    if (result.status !== 0) {
        process.stderr.write(result.stderr || result.stdout);
        process.exit(result.status || 1);
    }
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);
