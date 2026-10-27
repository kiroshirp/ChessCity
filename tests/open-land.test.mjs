import { fixture } from "./helpers/database.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  claimSite,
  foundCommunity,
  reserveCommunityExpansion,
  validSite,
} from "../.sites-runtime/tests/open-land.mjs";
import { applyRentalSnapshot } from "../.sites-runtime/tests/rental-store.mjs";
import { demolishExpiredRentals } from "../.sites-runtime/tests/city-events.mjs";
const add = (sql, id) =>
  sql
    .prepare(
      "INSERT INTO players(id,username,profile,updated_at,claimed,building_xp) VALUES (?,?,'{}',0,1,800)",
    )
    .run(id, id);

test("free placement creates only a chosen address and rejects races, plaza and non-aligned overlap", async () => {
  const { sql, db } = fixture();
  add(sql, "a");
  add(sql, "b");
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM plots").get().n, 0);
  // Historical, unused generated lots do not constrain where players can build.
  sql.exec(
    "INSERT INTO plots(id,community_id,slot,x,z) VALUES ('old:0','old',0,160,160)",
  );
  await claimSite(db, "a", 160, 160);
  await assert.rejects(claimSite(db, "b", 160, 160));
  await assert.rejects(claimSite(db, "b", 0, 0));
  assert.equal(validSite(2049, 80), false);
  assert.equal(validSite(80.1, 80), false);
  sql.exec(
    "INSERT INTO plots(id,community_id,slot,x,z) VALUES ('old:1','old',1,184,160);UPDATE players SET plot_id='old:1' WHERE id='b'",
  );
  await assert.rejects(claimSite(db, "a", 176, 160));
  await claimSite(db, "a", 240, 160);
  assert.equal(
    sql.prepare("SELECT building_xp FROM players WHERE id='a'").get()
      .building_xp,
    800,
  );
  sql.close();
});

test("community starts at the founder, reserves four free neighbors, and uses existing monthly billing", async () => {
  const { sql, db } = fixture();
  add(sql, "a");
  add(sql, "neighbor");
  add(sql, "student");
  await claimSite(db, "a", 320, 320);
  await claimSite(db, "neighbor", 304, 304);
  const id = await foundCommunity(db, "a", "Escuela de ajedrez");
  const community = sql.prepare("SELECT * FROM communities WHERE id=?").get(id);
  assert.equal(community.capacity, 1);
  assert.equal(community.origin_x, 320);
  assert.equal(
    sql.prepare("SELECT COUNT(*) n FROM plots WHERE community_id=?").get(id).n,
    1,
  );
  await assert.rejects(foundCommunity(db, "a", "Otra comunidad"));
  await assert.rejects(claimSite(db, "a", 640, 640));
  const expansion = await reserveCommunityExpansion(db, community, 1000);
  await reserveCommunityExpansion(db, community, 1001);
  const plots = sql
    .prepare("SELECT * FROM plots WHERE rental_expansion_id=?")
    .all(expansion);
  assert.equal(plots.length, 4);
  assert.ok(plots.every((p) => !(p.x === 304 && p.z === 304)));
  assert.equal(
    sql.prepare("SELECT capacity FROM communities WHERE id=?").get(id).capacity,
    1,
  );
  sql
    .prepare(
      "INSERT INTO expansion_checkouts(id,expansion_id,player_id,amount_cents,status,session_id,created_at) VALUES ('new',?,'a',100,'open','cs_new',0)",
    )
    .run(expansion);
  const snapshot = {
    id: "sub_new",
    checkoutId: "new",
    customerId: "cus_new",
    status: "active",
    amountCents: 100,
    cancelAtPeriodEnd: false,
    observedAt: 1000,
    invoice: { id: "in_new", amountCents: 100, from: 1000, until: 2000 },
  };
  await applyRentalSnapshot(db, snapshot, 1100);
  await applyRentalSnapshot(db, snapshot, 1200);
  assert.equal(
    sql.prepare("SELECT capacity FROM communities WHERE id=?").get(id).capacity,
    5,
  );
  assert.equal(
    sql
      .prepare("SELECT COUNT(*) n FROM plots WHERE rental_expansion_id=?")
      .get(expansion).n,
    4,
  );
  sql
    .prepare("UPDATE players SET plot_id=? WHERE id='student'")
    .run(plots[0].id);
  await demolishExpiredRentals(db, 2100);
  const student = sql.prepare("SELECT * FROM players WHERE id='student'").get();
  assert.notEqual(student.plot_id, plots[0].id);
  assert.equal(student.building_xp, 800);
  assert.equal(
    sql.prepare("SELECT plot_id FROM players WHERE id='a'").get().plot_id,
    "site:320:320",
  );
  sql.close();
});
