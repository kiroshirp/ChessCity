import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { productionDatabaseId } from "./cloudflare-config.mjs";
productionDatabaseId();
for (const args of [
  ["scripts/source-archive.mjs"],
  ["scripts/run-framework.mjs", "build"],
]) {
  const result = spawnSync(process.execPath, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const target = "dist/server/wrangler.json";
const config = JSON.parse(readFileSync(target, "utf8"));
for (const binding of config.d1_databases ?? [])
  if (binding.binding === "DB") binding.migrations_dir = "../../drizzle";
writeFileSync(target, JSON.stringify(config, null, 2));
