import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProfile,
  experience,
  levelFor,
  xpForLevel,
  progressFor,
  unlockedRoofs,
} from "../.sites-runtime/tests/model.mjs";
import {
  createLayout,
  demoPlayers,
} from "../.sites-runtime/tests/city-layout.mjs";

const raw = () => ({
  id: "example",
  username: "Example",
  count: { rated: 320, all: 500, win: 200, draw: 100, loss: 200 },
  perfs: {
    rapid: { rating: 1500, games: 100, prov: true },
    blitz: { rating: 1300, games: 0 },
  },
  seenAt: 100000,
  createdAt: 1000,
});
const player = () => ({
  id: "example",
  username: "Example",
  profile: normalizeProfile(raw()),
  xp: experience(320),
  accent: "jade",
  roof: "antenna",
  claimed: false,
  updatedAt: 100,
});

test("normalizes real API fields and preserves provisional status without inventing missing ratings", () => {
  const profile = normalizeProfile(raw());
  assert.equal(profile.rated, 320);
  assert.equal(profile.perfs.rapid.provisional, true);
  assert.equal(profile.perfs.blitz, undefined);
  assert.equal(profile.perfs.classical, undefined);
});
test("rejects closed, prohibited, bot and malformed accounts", () => {
  for (const overrides of [
    { disabled: true },
    { tosViolation: true },
    { title: "BOT" },
    { id: "../../etc" },
    { username: null },
  ])
    assert.throws(() => normalizeProfile({ ...raw(), ...overrides }));
});
test("unknown sensitive profile fields are not retained", () => {
  const profile = normalizeProfile({
    ...raw(),
    email: "private@example.invalid",
    profile: { bio: "unused" },
    token: "not-a-real-token",
  });
  assert.equal(profile.email, undefined);
  assert.equal(profile.token, undefined);
  assert.equal(profile.profile, undefined);
});
test("nonfinite and negative counts cannot become XP", () => {
  const profile = normalizeProfile({
    ...raw(),
    count: { rated: Infinity, all: -30 },
  });
  assert.equal(profile.rated, 0);
  assert.equal(profile.total, 0);
  assert.equal(experience(profile.rated), 0);
});
test("experience is monotonic and returns diminish", () => {
  assert.equal(experience(0), 0);
  assert.ok(experience(100) > experience(50));
  assert.ok(
    experience(100) - experience(50) > experience(1000) - experience(950),
  );
});
test("rating does not control permanent building height", () => {
  const one = player(),
    two = player();
  two.profile.perfs.rapid.rating = 900;
  assert.equal(
    createLayout([one], "rapid", 100000)[0].height,
    createLayout([two], "rapid", 100000)[0].height,
  );
});
test("levels have explicit boundaries and a hard visual cap", () => {
  assert.equal(levelFor(0), 1);
  assert.equal(levelFor(xpForLevel(6)), 6);
  assert.equal(levelFor(xpForLevel(6) - 1), 5);
  assert.equal(levelFor(1e12), 30);
  const data = player();
  data.buildingXp = 2000;
  data.activeDays = 30;
  assert.equal(progressFor(data).next, null);
  assert.equal(progressFor(data).fraction, 1);
});
test("roofs unlock only at their declared levels", () => {
  const data = player();
  data.xp = 0;
  assert.deepEqual(unlockedRoofs(data), ["antenna"]);
  data.buildingXp = 150;
  data.activeDays = 3;
  assert.ok(unlockedRoofs(data).includes("garden"));
  assert.ok(!unlockedRoofs(data).includes("crown"));
  data.buildingXp = 900;
  data.activeDays = 14;
  assert.ok(unlockedRoofs(data).includes("crown"));
});
test("layout is deterministic across input order and has distinct non-overlapping lots", () => {
  const data = demoPlayers();
  const layout = createLayout(data, "rapid", 123456);
  assert.deepEqual(layout, createLayout([...data].reverse(), "rapid", 123456));
  assert.equal(
    new Set(layout.map((item) => `${item.x},${item.z}`)).size,
    data.length,
  );
  assert.ok(
    layout.every(
      (item) =>
        item.width < 16 && item.depth < 16 && Number.isFinite(item.height),
    ),
  );
});
test("all scenic samples are explicitly marked, empty city is supported", () => {
  assert.ok(
    demoPlayers().every(
      (item) => item.demo && Object.keys(item.profile.perfs).length === 0,
    ),
  );
  assert.deepEqual(createLayout([], "rapid"), []);
});
