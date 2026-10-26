import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import ts from "typescript";
mkdirSync(".sites-runtime/tests", { recursive: true });
for (const name of [
  "model",
  "city-layout",
  "progression",
  "neighborhoods",
  "expansion-settlement",
  "stripe-protocol",
  "checkout-store",
  "city-events",
  "construction-timeline",
]) {
  const source = readFileSync(`lib/${name}.ts`, "utf8").replace(
    /from ['"]\.\/([a-z-]+)['"]/g,
    'from "./$1.mjs"',
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  writeFileSync(`.sites-runtime/tests/${name}.mjs`, output);
}
const result = spawnSync(
  process.execPath,
  [
    "--test",
    "tests/domain.test.mjs",
    "tests/progression.test.mjs",
    "tests/database.test.mjs",
    "tests/stripe.test.mjs",
    "tests/animation.test.mjs",
  ],
  { stdio: "inherit" },
);
process.exitCode = result.status ?? 1;
