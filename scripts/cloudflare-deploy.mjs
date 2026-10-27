import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { productionDatabaseId } from "./cloudflare-config.mjs";
const databaseId = productionDatabaseId();
const configPath = "dist/server/wrangler.json";
const config = JSON.parse(readFileSync(configPath, "utf8"));
config.name = "chesscity";
config.d1_databases = [
  {
    binding: "DB",
    database_name: "chesscity-db",
    database_id: databaseId,
    migrations_dir: "../../drizzle",
  },
];
// The already-built Worker must not recursively execute the source build command.
delete config.build;
writeFileSync(configPath, JSON.stringify(config, null, 2));
const wrangler = "node_modules/wrangler/bin/wrangler.js";
const migrate = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    wrangler,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--remote",
    "--config",
    configPath,
  ],
  { stdio: "inherit", env: process.env },
);
if (migrate.status !== 0) process.exit(migrate.status ?? 1);
const deploy = spawnSync(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    wrangler,
    "deploy",
    "--config",
    configPath,
  ],
  { stdio: "inherit", env: process.env },
);
process.exitCode = deploy.status ?? 1;
