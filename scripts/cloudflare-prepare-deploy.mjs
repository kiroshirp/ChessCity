import { spawnSync } from "node:child_process";
// Invoked by source-level `wrangler deploy`, including Cloudflare's default Git build command.
for (const args of [
  ["scripts/cloudflare-build.mjs"],
  [
    "--import",
    "./scripts/sites-env.mjs",
    "node_modules/wrangler/bin/wrangler.js",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    "dist/server/wrangler.json",
  ],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
