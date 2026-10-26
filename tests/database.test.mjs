import { demolishExpiredRentals } from "../.sites-runtime/tests/city-events.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { reserveContribution } from "../.sites-runtime/tests/checkout-store.mjs";
import { settleVerifiedExpansionPayment } from "../.sites-runtime/tests/expansion-settlement.mjs";
function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync("drizzle")
    .filter((name) => name.endsWith(".sql"))
    .sort())
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
test("100 cents total unlocks four plots once; duplicate notifications are idempotent", async () => {
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
    20,
  );
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM plots").get().n, 4);
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

test("reservations never exceed 100 cents across community members", async () => {
  const { sql, db } = fixture();
  sql.exec(
    "INSERT INTO plots (id,community_id,slot,x,z) VALUES ('alameda:0','alameda',0,0,0),('alameda:1','alameda',1,16,0); INSERT INTO players (id,username,profile,updated_at,claimed,plot_id) VALUES ('a','A','{}',0,1,'alameda:0'),('b','B','{}',0,1,'alameda:1')",
  );
  assert.equal(
    await reserveContribution(db, "one", "alameda:16", "a", 100, 0),
    true,
  );
  assert.equal(
    await reserveContribution(db, "two", "alameda:16", "b", 50, 0),
    false,
  );
  sql.exec("UPDATE expansion_checkouts SET status='expired'");
  assert.equal(
    await reserveContribution(db, "three", "alameda:16", "a", 50, 1),
    true,
  );
  assert.equal(
    await reserveContribution(db, "four", "alameda:16", "b", 50, 1),
    true,
  );
  assert.equal(
    sql
      .prepare(
        "SELECT SUM(amount_cents) n FROM expansion_checkouts WHERE status='creating'",
      )
      .get().n,
    100,
  );
  assert.equal(
    await reserveContribution(db, "five", "alameda:16", "stranger", 50, 1),
    false,
  );
  sql.close();
});
test("one member can fund all four plots for exactly one euro", async () => {
  const { sql, db } = fixture();
  assert.equal(
    (await settleVerifiedExpansionPayment(db, payment("full"))).applied,
    true,
  );
  assert.equal(
    sql.prepare("SELECT capacity FROM communities").get().capacity,
    20,
  );
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM plots").get().n, 4);
  sql.close();
});

test("expired school plots relocate players free, preserving XP and identity, exactly once", async () => {
  const { sql, db } = fixture();
  sql.exec(
    "UPDATE expansions SET status='applied',rent_paid_until=100; INSERT INTO plots (id,community_id,slot,x,z,rental_expansion_id) VALUES ('alameda:16','alameda',16,0,0,'alameda:16'); INSERT INTO players (id,username,profile,updated_at,claimed,plot_id,building_xp,active_days) VALUES ('student','Student','{}',0,1,'alameda:16',900,14)",
  );
  await demolishExpiredRentals(db, 99);
  assert.equal(
    sql.prepare("SELECT plot_id FROM players WHERE id='student'").get().plot_id,
    "alameda:16",
  );
  await demolishExpiredRentals(db, 100);
  const player = sql.prepare("SELECT * FROM players WHERE id='student'").get();
  assert.equal(player.plot_id, "libre:0");
  assert.equal(player.building_xp, 900);
  assert.equal(player.active_days, 14);
  assert.equal(player.claimed, 1);
  assert.equal(
    sql
      .prepare("SELECT rental_expansion_id FROM plots WHERE id=?")
      .get(player.plot_id).rental_expansion_id,
    null,
  );
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM city_events").get().n, 2);
  await demolishExpiredRentals(db, 200);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM city_events").get().n, 2);
  sql.close();
});
