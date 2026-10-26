import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { settleVerifiedExpansionPayment } from "../.sites-runtime/tests/expansion-settlement.mjs";
function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of ["0000_woozy_ezekiel.sql", "0001_warm_vulture.sql"])
    sql.exec(readFileSync(`drizzle/${file}`, "utf8"));
  sql.exec(
    "INSERT INTO communities VALUES ('alameda','Alameda',16); INSERT INTO expansions (id,community_id,created_at) VALUES ('alameda:16','alameda',0)",
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
const payment = (id, amount = 100) => ({
  eventId: id,
  expansionId: "alameda:16",
  amountCents: amount,
  currency: "EUR",
});
test("100 cents total unlocks sixteen plots once; duplicate notifications are idempotent", async () => {
  const { sql, db } = fixture();
  assert.equal(
    (await settleVerifiedExpansionPayment(db, payment("one", 50))).applied,
    false,
  );
  assert.equal(
    sql.prepare("SELECT capacity FROM communities").get().capacity,
    16,
  );
  assert.equal(
    (await settleVerifiedExpansionPayment(db, payment("two", 50))).applied,
    true,
  );
  assert.equal(
    (await settleVerifiedExpansionPayment(db, payment("two", 50))).duplicate,
    true,
  );
  assert.equal(
    sql.prepare("SELECT capacity FROM communities").get().capacity,
    32,
  );
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM plots").get().n, 16);
  await assert.rejects(settleVerifiedExpansionPayment(db, payment("two", 40)));
  await assert.rejects(settleVerifiedExpansionPayment(db, payment("three")));
  sql.close();
});
test("unverified amounts/currency cannot expand land", async () => {
  const { sql, db } = fixture();
  for (const p of [
    payment("x", 0),
    payment("x", -1),
    payment("x", 101),
    { ...payment("x"), currency: "USD" },
  ])
    await assert.rejects(settleVerifiedExpansionPayment(db, p));
  assert.equal(
    sql.prepare("SELECT capacity FROM communities").get().capacity,
    16,
  );
  sql.close();
});
test("a plot has at most one owner and moving releases the old address", () => {
  const { sql } = fixture();
  sql.exec(
    "INSERT INTO players (id,username,profile,updated_at,claimed,plot_id) VALUES ('a','A','{}',0,1,'alameda:0'),('b','B','{}',0,1,NULL)",
  );
  assert.throws(() =>
    sql
      .prepare("UPDATE players SET plot_id=? WHERE id=?")
      .run("alameda:0", "b"),
  );
  sql.prepare("UPDATE players SET plot_id=? WHERE id=?").run("alameda:1", "a");
  sql.prepare("UPDATE players SET plot_id=? WHERE id=?").run("alameda:0", "b");
  assert.equal(
    sql.prepare("SELECT plot_id FROM players WHERE id='a'").get().plot_id,
    "alameda:1",
  );
  sql.close();
});
