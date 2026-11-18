import fs from "node:fs";
import path from "node:path";

const mode = process.argv[2];
if (!["preview", "production"].includes(mode)) {
  console.error("Usage: cloudflare-preflight.mjs preview|production");
  process.exit(2);
}

const root = path.resolve(process.cwd());
const file = path.join(root, mode === "preview" ? "wrangler.preview.toml" : "wrangler.production.toml");
if (!fs.existsSync(file)) {
  console.error(`Missing config: ${file}`);
  process.exit(2);
}

const config = fs.readFileSync(file, "utf8");
const placeholder = mode === "preview"
  ? "REPLACE_WITH_PREVIEW_D1_DATABASE_ID"
  : "REPLACE_WITH_PRODUCTION_D1_DATABASE_ID";
if (config.includes(placeholder)) {
  console.error(`${mode} deployment blocked: D1 database ID is not configured.`);
  process.exit(2);
}
if (!config.includes('crons = ["0 * * * *"]')) {
  console.error(`${mode} deployment blocked: scheduled cron is missing.`);
  process.exit(2);
}
if (mode === "production") {
  console.error("Production deployment blocked by safety policy. Explicit approval is required.");
  process.exit(2);
}
console.log("Preview config preflight passed.");
