import { readFileSync } from "node:fs";
import ts from "typescript";
export function productionDatabaseId() {
  return validateDatabaseId(
    ts
      .parseConfigFileTextToJson(
        "wrangler.jsonc",
        readFileSync("wrangler.jsonc", "utf8"),
      )
      .config.d1_databases?.find((item) => item.binding === "DB")?.database_id,
  );
}
export function validateDatabaseId(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ) ||
    value === "00000000-0000-4000-8000-000000000000"
  ) {
    throw new Error(
      "Falta un identificador D1 válido en wrangler.jsonc. No es una clave secreta.",
    );
  }
  return value;
}
