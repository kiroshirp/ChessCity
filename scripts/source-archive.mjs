import { mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

mkdirSync("public/source", { recursive: true });
// Explicit allowlist excludes credentials, databases, dependencies, Git and generated builds.
const candidates = [
  "app",
  "worker",
  "components",
  "hooks",
  "vendor",
  "lib",
  "db",
  "drizzle",
  "docs",
  "tests",
  "scripts",
  "public/fonts",
  "public/favicon.svg",
  "public/LICENSE.txt",
  "README.md",
  "LICENSE",
  "NOTICE.md",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "vite.config.ts",
  "next.config.ts",
  "drizzle.config.ts",
  "tsconfig.json",
  "cloudflare-env.d.ts",
  "postcss.config.mjs",
  ".openai/hosting.json",
  "wrangler.jsonc",
  "LICENSE.repository-original",
];
const files = candidates.filter((file) => existsSync(file));
const result = spawnSync(
  "tar",
  ["-czf", path.resolve("public/source/chesscity.tar.gz"), ...files],
  { stdio: "inherit", shell: false },
);
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error("No se ha podido generar el paquete de código fuente.");
console.log("Código fuente público generado: /source/chesscity.tar.gz");
