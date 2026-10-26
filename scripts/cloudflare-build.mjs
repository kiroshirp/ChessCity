import { spawnSync } from "node:child_process";
import { validateDatabaseId } from "./cloudflare-config.mjs";
validateDatabaseId(process.env.CHESSCITY_D1_ID);
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
