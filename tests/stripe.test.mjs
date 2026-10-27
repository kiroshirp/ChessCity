import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { cancelRentalCheckout } from "../.sites-runtime/tests/rental-checkout.mjs";

test("leaving Checkout expires only the matching unpaid reservation", async () => {
  let expired = 0;
  const pending = {
    id: "reservation",
    session_id: "cs_expected",
    amount_cents: 100,
  };
  const state = {
    id: pending.session_id,
    client_reference_id: pending.id,
    mode: "subscription",
    livemode: false,
    amount_total: 100,
    status: "open",
  };
  const client = {
    checkout: {
      sessions: {
        retrieve: async () => state,
        expire: async () => {
          expired++;
          state.status = "expired";
        },
      },
    },
  };
  await cancelRentalCheckout(client, pending, false);
  await cancelRentalCheckout(client, pending, false);
  assert.equal(expired, 1);
  state.status = "complete";
  await cancelRentalCheckout(client, pending, false);
  assert.equal(expired, 1);
  state.client_reference_id = "someone-else";
  await assert.rejects(cancelRentalCheckout(client, pending, false));
  assert.equal(expired, 1);
});

test("a payment completing during cancellation is reconciled without expiring a subscription", async () => {
  let reads = 0;
  const state = {
    id: "cs_expected",
    client_reference_id: "reservation",
    mode: "subscription",
    livemode: false,
    amount_total: 100,
    status: "open",
  };
  const client = {
    checkout: {
      sessions: {
        retrieve: async () => ({
          ...state,
          status: reads++ ? "complete" : "open",
        }),
        expire: async () => {
          throw new Error("already completed");
        },
      },
    },
  };
  await cancelRentalCheckout(
    client,
    { id: "reservation", session_id: state.id, amount_cents: 100 },
    false,
  );
  assert.equal(reads, 2);
});
import {
  contributionAmount,
  boundedRequestText,
  verifyStripeSignature,
  validatePaidCheckout,
} from "../.sites-runtime/tests/stripe-protocol.mjs";

test("the production SDK webhook verifier rejects a modified signed event without network access", async () => {
  const stripe = new Stripe("fixture"),
    secret = "fixture-signature",
    timestamp = Math.floor(Date.now() / 1000);
  const raw = JSON.stringify({
    id: "evt_fixture",
    object: "event",
    type: "invoice.paid",
    data: { object: { id: "in_fixture" } },
  });
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  const header = `t=${timestamp},v1=${signature}`;
  const event = await stripe.webhooks.constructEventAsync(
    raw,
    header,
    secret,
    300,
    Stripe.createSubtleCryptoProvider(),
  );
  assert.equal(event.id, "evt_fixture");
  await assert.rejects(
    stripe.webhooks.constructEventAsync(
      raw + " ",
      header,
      secret,
      300,
      Stripe.createSubtleCryptoProvider(),
    ),
  );
});
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
