import assert from "node:assert/strict";

const origin = process.env.CHESSCITY_TEST_ORIGIN ?? "http://127.0.0.1:5173";
const request = (path, init = {}) =>
  fetch(origin + path, { ...init, redirect: "manual" });
const city = await request("/api/city");
assert.equal(city.status, 200);
const data = await city.json();
assert.ok(Array.isArray(data.players));
assert.equal((await (await request("/api/me")).json()).player, null);
assert.equal((await request("/api/player?username=..%2Fbad")).status, 400);
const body = JSON.stringify({
  accent: "jade",
  roof: "crown",
  id: "someone-else",
});
assert.equal(
  (
    await request("/api/customize", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body,
    })
  ).status,
  401,
);
assert.equal(
  (
    await request("/api/customize", {
      method: "POST",
      headers: {
        Origin: "https://not-this-site.invalid",
        "Content-Type": "application/json",
      },
      body,
    })
  ).status,
  403,
);
assert.equal(
  (
    await request("/api/customize", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: "chesscity_session=" + "x".repeat(43),
      },
      body,
    })
  ).status,
  401,
);
const start = await request("/auth/start");
assert.equal(start.status, 302);
const authorization = new URL(start.headers.get("location"));
assert.equal(authorization.origin, "https://lichess.org");
assert.equal(authorization.searchParams.get("code_challenge_method"), "S256");
assert.equal(authorization.searchParams.get("scope"), null);
assert.equal(authorization.searchParams.has("code_verifier"), false);
const state = authorization.searchParams.get("state");
assert.equal(state.length, 43);
const authCookie = start.headers.get("set-cookie").split(";")[0];
assert.ok(start.headers.get("set-cookie").includes("HttpOnly"));
const badState = await request(
  "/auth/lichess?state=" + "z".repeat(43) + "&code=not-a-real-code",
  { headers: { Cookie: authCookie } },
);
assert.equal(badState.status, 302);
assert.ok(badState.headers.get("location").endsWith("/?auth=failed"));
assert.equal(
  (
    await request("/api/logout", {
      method: "POST",
      headers: { Origin: origin },
    })
  ).status,
  200,
);
console.log(
  "HTTP OK: city persistence, anonymous session, input validation, ownership/origin checks, forged-session rejection, PKCE start, state mismatch rejection and logout. No Lichess account was authorized by this check.",
);
const neighborhoods = await (await request("/api/neighborhoods")).json();
for (const id of ["alameda", "mirador", "ribera", "abierta"])
  assert.ok(neighborhoods.communities.some((community) => community.id === id));
assert.ok(neighborhoods.plots.filter((plot) => plot.communityId === "abierta").length >= 256);
assert.equal(new Set(neighborhoods.plots.map((plot) => plot.id)).size, neighborhoods.plots.length);
assert.equal(typeof neighborhoods.paymentsEnabled, "boolean");
if (process.env.CHESSCITY_EXPECT_PAYMENTS)
  assert.equal(neighborhoods.paymentsEnabled, process.env.CHESSCITY_EXPECT_PAYMENTS === "true");
for (const route of ["/api/placement", "/api/expansions"]) {
  assert.equal(
    (
      await request(route, {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await request(route, {
        method: "POST",
        headers: { Origin: "https://foreign.invalid" },
        body: "{}",
      })
    ).status,
    403,
  );
}
assert.equal(
  (
    await request("/api/checkout", {
      method: "POST",
      headers: { Origin: origin },
    })
  ).status,
  neighborhoods.paymentsEnabled ? 401 : 503,
);
console.log(
  "HTTP OK: growing public land, protected placement/expansions, Checkout requires an authenticated owner.",
);

assert.equal((await request("/api/rentals")).status, 401);
assert.equal(
  (
    await request("/api/rentals", {
      method: "POST",
      headers: { Origin: origin },
      body: "{}",
    })
  ).status,
  401,
);
