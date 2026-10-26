import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  contributionAmount,
  boundedRequestText,
  verifyStripeSignature,
  validatePaidCheckout,
} from "../.sites-runtime/tests/stripe-protocol.mjs";
test("Stripe raw signatures reject forgery, altered payloads and stale events", async () => {
  const now = Date.now(),
    t = Math.floor(now / 1000),
    body = '{"id":"evt_example"}',
    secret = "fixture_only";
  const signature = createHmac("sha256", secret)
    .update(`${t}.${body}`)
    .digest("hex");
  await verifyStripeSignature(body, `t=${t},v1=${signature}`, secret, now);
  await assert.rejects(
    verifyStripeSignature(body + " ", `t=${t},v1=${signature}`, secret, now),
  );
  await assert.rejects(
    verifyStripeSignature(body, `t=${t},v1=${signature}`, secret, now + 301000),
  );
  await assert.rejects(verifyStripeSignature(body, null, secret, now));
});
test("contributions allow half a euro or a whole euro, never more or smaller amounts", () => {
  assert.equal(contributionAmount(50), 50);
  assert.equal(contributionAmount(100), 100);
  for (const amount of [0, 1, 25, 99, 101, "50", NaN])
    assert.throws(() => contributionAmount(amount));
});
test("only a paid session for the expected product, amount, member and campaign can settle", () => {
  const checkout = {
    id: "reservation",
    session_id: "cs_example",
    expansion_id: "alameda:16",
    player_id: "a",
    amount_cents: 100,
  };
  const session = {
    id: "cs_example",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    currency: "eur",
    amount_total: 100,
    livemode: false,
    client_reference_id: "reservation",
    metadata: {
      checkoutId: "reservation",
      expansionId: "alameda:16",
      playerId: "a",
    },
  };
  const lines = {
    has_more: false,
    data: [
      {
        quantity: 1,
        amount_total: 100,
        price: { product: "prod_U4PzEucod6LCRJ" },
      },
    ],
  };
  validatePaidCheckout(session, checkout, lines, false);
  for (const changed of [
    { payment_status: "unpaid" },
    { amount_total: 50 },
    { currency: "usd" },
    { livemode: true },
    { metadata: {} },
  ])
    assert.throws(() =>
      validatePaidCheckout({ ...session, ...changed }, checkout, lines, false),
    );
  assert.throws(() =>
    validatePaidCheckout(
      session,
      checkout,
      {
        has_more: false,
        data: [{ quantity: 1, amount_total: 100, price: { product: "other" } }],
      },
      false,
    ),
  );
});

test("request size limits count bytes even without content-length", async () => {
  assert.equal(
    await boundedRequestText(
      new Request("https://fixture.invalid", { method: "POST", body: "ok" }),
      2,
    ),
    "ok",
  );
  await assert.rejects(
    boundedRequestText(
      new Request("https://fixture.invalid", {
        method: "POST",
        body: "too long",
      }),
      2,
    ),
  );
});
