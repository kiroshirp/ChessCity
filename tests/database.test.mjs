import { fixture } from "./helpers/database.mjs";
import { demolishExpiredRentals } from "../.sites-runtime/tests/city-events.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { reserveContribution } from "../.sites-runtime/tests/checkout-store.mjs";
import {
  ensurePublicLand,
  publicPlotCoordinates,
} from "../.sites-runtime/tests/public-land.mjs";
import {
  NEIGHBORHOODS,
  plotCoordinates,
} from "../.sites-runtime/tests/neighborhoods.mjs";

test("public land grows without moving addresses or occupying community expansion space", async () => {
  const { sql, db } = fixture();
  const points = publicPlotCoordinates(0, 512);
  assert.deepEqual(publicPlotCoordinates(256, 256), points.slice(256));
  assert.equal(new Set(points.map((p) => `${p.x}:${p.z}`)).size, 512);
  for (const point of points)
    for (const community of NEIGHBORHOODS)
      for (let slot = 0; slot < 64; slot++) {
        const reserved = plotCoordinates(community.id, slot);
        assert.ok(
          Math.abs(point.x - reserved.x) >= 15 ||
            Math.abs(point.z - reserved.z) >= 15,
        );
      }
  await ensurePublicLand(db);
  await ensurePublicLand(db);
  assert.equal(
    sql
      .prepare("SELECT COUNT(*) n FROM plots WHERE community_id='abierta'")
      .get().n,
    256,
  );
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM players").get().n, 0);
  for (let i = 0; i < 193; i++)
    sql
      .prepare(
        "INSERT INTO players (id,username,profile,updated_at,claimed,plot_id) VALUES (?,?, '{}',0,1,?)",
      )
      .run(`p${i}`, `Player${i}`, `abierta:${i}`);
  await ensurePublicLand(db);
  assert.equal(
    sql.prepare("SELECT capacity FROM communities WHERE id='abierta'").get()
      .capacity,
    512,
  );
  const address = sql
    .prepare("SELECT x,z FROM plots WHERE id='abierta:0'")
    .get();
  assert.equal(address.x, points[0].x);
  assert.equal(address.z, points[0].z);
  assert.equal(
    sql.prepare("SELECT plot_id FROM players WHERE id='p0'").get().plot_id,
    "abierta:0",
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
