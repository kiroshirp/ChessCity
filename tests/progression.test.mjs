import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceProgress,
  buildingStage,
  combinedRating,
} from "../.sites-runtime/tests/progression.mjs";
import {
  NEIGHBORHOODS,
  plotCoordinates,
} from "../.sites-runtime/tests/neighborhoods.mjs";
const empty = () => ({
  xp: 0,
  activeDays: 0,
  ratedBaseline: null,
  day: null,
  dailyGames: 0,
});
const day = (n) => Date.UTC(2026, 9, n);
test("historical games set baseline without building rewards", () => {
  const p = advanceProgress(empty(), 90000, day(1));
  assert.equal(p.xp, 0);
  assert.equal(p.ratedBaseline, 90000);
  assert.equal(p.activeDays, 0);
});
test("daily cap discards excess and repeated sync never credits twice", () => {
  let p = advanceProgress(empty(), 100, day(1));
  p = advanceProgress(p, 120, day(1));
  assert.equal(p.xp, 100);
  assert.equal(p.activeDays, 1);
  assert.deepEqual(advanceProgress(p, 120, day(1)), p);
  p = advanceProgress(p, 121, day(1));
  assert.equal(p.xp, 100);
  p = advanceProgress(p, 121, day(2));
  assert.equal(p.activeDays, 1);
  assert.equal(p.xp, 100);
  p = advanceProgress(p, 122, day(2));
  assert.equal(p.xp, 120);
  assert.equal(p.activeDays, 2);
});
test("each building requires XP and active days; one day cannot yield a block", () => {
  assert.equal(buildingStage({ xp: 99999, activeDays: 1 }).index, 0);
  assert.equal(buildingStage({ xp: 119, activeDays: 3 }).index, 0);
  assert.equal(buildingStage({ xp: 120, activeDays: 3 }).index, 1);
  assert.equal(buildingStage({ xp: 800, activeDays: 14 }).index, 3);
  assert.equal(buildingStage({ xp: 1800, activeDays: 30 }).index, 4);
});
test("mean uses established available modes equally, without zero substitution", () => {
  const profile = {
    perfs: {
      rapid: { rating: 1800, games: 50 },
      blitz: { rating: 1400, games: 300 },
      bullet: { rating: 2200, games: 1, provisional: true },
    },
  };
  assert.equal(combinedRating(profile).rating, 1600);
  assert.deepEqual(combinedRating(profile).modes, ["rapid", "blitz"]);
  assert.equal(combinedRating({ perfs: {} }).rating, null);
});
test("all current and future community parcels have distinct coordinates", () => {
  const points = NEIGHBORHOODS.flatMap((c) =>
    Array.from({ length: 64 }, (_, s) => plotCoordinates(c.id, s)),
  );
  assert.equal(new Set(points.map((p) => `${p.x},${p.z}`)).size, 192);
  assert.throws(() => plotCoordinates("alameda", 64));
});
