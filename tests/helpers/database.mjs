import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
export function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((name) => name.endsWith(".sql"))
    .sort())
    sql.exec(readFileSync(`drizzle/${file}`, "utf8"));
  sql.exec(
    "INSERT INTO communities (id,name,capacity) VALUES ('alameda','Alameda',16); INSERT INTO expansions (id,community_id,created_at) VALUES ('alameda:16','alameda',0)",
  );
  const db = {
    prepare(query) {
      let args = [];
      const stmt = {
        bind(...values) {
          args = values;
          return stmt;
        },
        async first() {
          return sql.prepare(query).get(...args) ?? null;
        },
        async all() {
          return { results: sql.prepare(query).all(...args) };
        },
        async run() {
          return { meta: { changes: sql.prepare(query).run(...args).changes } };
        },
      };
      return stmt;
    },
    async batch(statements) {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const stmt of statements) result.push(await stmt.run());
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
  };
  return { sql, db };
}
