import test from "node:test";
import assert from "node:assert/strict";
import { fixture } from "./helpers/database.mjs";
import { applyRentalSnapshot } from "../.sites-runtime/tests/rental-store.mjs";
import { reserveContribution } from "../.sites-runtime/tests/checkout-store.mjs";
import {
  rentalSnapshot,
  renewalProcessing,
} from "../.sites-runtime/tests/rental-protocol.mjs";
import { verifyInvoicePayment } from "../.sites-runtime/tests/stripe-proof.mjs";
import { demolishExpiredRentals } from "../.sites-runtime/tests/city-events.mjs";

function setup(amount = 100, id = "a") {
  const result = fixture();
  result.sql
    .prepare(
      "INSERT INTO expansion_checkouts (id,expansion_id,player_id,amount_cents,status,session_id,created_at) VALUES (?,'alameda:16',?,?,'open',?,0)",
    )
    .run(id, id, amount, "cs_" + id);
  return result;
}
const snapshot = (
  id = "a",
  amount = 100,
  from = 1000,
  until = 2000,
  invoice = "one",
) => ({
  id: "sub_" + id,
  checkoutId: id,
  customerId: "cus_" + id,
  status: "active",
  amountCents: amount,
  cancelAtPeriodEnd: false,
  observedAt: 1000,
  invoice: { id: "in_" + invoice, amountCents: amount, from, until },
});
test("replayed invoices never add months or allocate four plots twice", async () => {
  const { sql, db } = setup();
  await applyRentalSnapshot(db, snapshot(), 1000);
  await applyRentalSnapshot(db, snapshot(), 1100);
  assert.equal(
    sql.prepare("SELECT rent_paid_until FROM expansions").get().rent_paid_until,
    2000,
  );
  assert.equal(
    sql.prepare("SELECT capacity FROM communities").get().capacity,
    20,
  );
  await applyRentalSnapshot(
    db,
    { ...snapshot("a", 100, 2000, 3000, "two"), observedAt: 2000 },
    2000,
  );
  await applyRentalSnapshot(db, snapshot(), 2500);
  assert.equal(
    sql.prepare("SELECT rent_paid_until FROM expansions").get().rent_paid_until,
    3000,
  );
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM plots").get().n, 4);
  sql.close();
});
test("two fifty-cent monthly contributors cover only their shared paid period", async () => {
  const { sql, db } = setup(50, "a");
  sql.exec(
    "INSERT INTO expansion_checkouts (id,expansion_id,player_id,amount_cents,status,session_id,created_at) VALUES ('b','alameda:16','b',50,'open','cs_b',0)",
  );
  await applyRentalSnapshot(db, snapshot("a", 50, 1000, 2000, "a"), 1000);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM plots").get().n, 0);
  await applyRentalSnapshot(db, snapshot("b", 50, 1000, 3000, "b"), 1000);
  assert.equal(
    sql.prepare("SELECT rent_paid_until FROM expansions").get().rent_paid_until,
    2000,
  );
  await applyRentalSnapshot(
    db,
    { ...snapshot("a", 50, 2000, 4000, "renew"), observedAt: 2000 },
    2000,
  );
  assert.equal(
    sql.prepare("SELECT rent_paid_until FROM expansions").get().rent_paid_until,
    3000,
  );
  sql.close();
});
test("cancelling preserves the paid month; expiry relocates the school member free", async () => {
  const { sql, db } = setup();
  await applyRentalSnapshot(db, snapshot(), 1000);
  sql.exec(
    "INSERT INTO players (id,username,profile,updated_at,claimed,plot_id,building_xp,active_days) VALUES ('student','Student','{}',0,1,'alameda:16',800,14)",
  );
  await applyRentalSnapshot(
    db,
    {
      ...snapshot(),
      invoice: undefined,
      cancelAtPeriodEnd: true,
      observedAt: 1500,
    },
    1500,
  );
  await demolishExpiredRentals(db, 1500, new Set(["alameda:16"]));
  assert.equal(
    sql.prepare("SELECT plot_id FROM players").get().plot_id,
    "alameda:16",
  );
  await applyRentalSnapshot(
    db,
    { ...snapshot(), invoice: undefined, status: "canceled", observedAt: 2000 },
    2000,
  );
  await demolishExpiredRentals(db, 2000, new Set(["alameda:16"]));
  const student = sql.prepare("SELECT * FROM players").get();
  assert.match(student.plot_id, /^libre:/);
  assert.equal(student.building_xp, 800);
  assert.equal(student.active_days, 14);
  sql.close();
});
test("refunds block the funded period and stale snapshots cannot undo cancellation", async () => {
  const { sql, db } = setup();
  await applyRentalSnapshot(db, snapshot(), 1000);
  await applyRentalSnapshot(
    db,
    {
      ...snapshot(),
      status: "canceled",
      observedAt: 1500,
      blockedInvoiceIds: ["in_one"],
    },
    1500,
  );
  await applyRentalSnapshot(db, { ...snapshot(), observedAt: 1200 }, 1500);
  assert.equal(
    sql.prepare("SELECT status FROM rental_subscriptions").get().status,
    "canceled",
  );
  assert.equal(
    sql.prepare("SELECT paid_cents FROM expansions").get().paid_cents,
    0,
  );
  assert.equal(
    sql.prepare("SELECT rent_paid_until FROM expansions").get().rent_paid_until,
    1500,
  );
  assert.equal(
    sql.prepare("SELECT blocked FROM rental_invoices").get().blocked,
    1,
  );
  sql.close();
});
test("another invoice payload cannot replace an already recorded invoice", async () => {
  const { sql, db } = setup();
  await applyRentalSnapshot(db, snapshot(), 1000);
  await assert.rejects(
    applyRentalSnapshot(db, snapshot("a", 100, 1000, 5000), 1000),
  );
  sql.close();
});
test("uncertain renewals are not treated as nonpayment", () => {
  assert.equal(
    renewalProcessing({ status: "active" }, { status: "draft" }, 1000),
    true,
  );
  assert.equal(
    renewalProcessing(
      { status: "active" },
      { status: "open", attempted: false },
      1000,
    ),
    true,
  );
  assert.equal(
    renewalProcessing(
      { status: "past_due" },
      { status: "open", attempted: true },
      1000,
    ),
    false,
  );
  assert.equal(
    renewalProcessing({ status: "canceled" }, { status: "paid" }, 1000),
    false,
  );
});
test("a subscribed fifty-cent commitment still limits subsequent checkouts", async () => {
  const { sql, db } = setup(50, "a");
  await applyRentalSnapshot(db, snapshot("a", 50), 1000);
  sql.exec(
    "INSERT INTO plots (id,community_id,slot,x,z) VALUES ('alameda:0','alameda',0,0,0); INSERT INTO players (id,username,profile,updated_at,claimed,plot_id) VALUES ('b','B','{}',0,1,'alameda:0')",
  );
  assert.equal(
    await reserveContribution(db, "new", "alameda:16", "b", 100, 1100),
    false,
  );
  assert.equal(
    await reserveContribution(db, "half", "alameda:16", "b", 50, 1100),
    true,
  );
  sql.close();
});
test("only the expected monthly item and invoice service dates determine rental coverage", () => {
  const checkout = { id: "a", amount_cents: 100 };
  const subscription = {
    id: "sub_a",
    customer: "cus_a",
    livemode: false,
    status: "active",
    items: {
      has_more: false,
      data: [
        {
          id: "si_a",
          quantity: 1,
          price: {
            product: "prod_U4PzEucod6LCRJ",
            currency: "eur",
            unit_amount: 100,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
  };
  const invoice = {
    id: "in_a",
    livemode: false,
    status: "paid",
    currency: "eur",
    amount_paid: 100,
    amount_due: 100,
    billing_reason: "subscription_cycle",
    parent: { subscription_details: { subscription: "sub_a" } },
    lines: {
      has_more: false,
      data: [
        {
          quantity: 1,
          parent: { subscription_item_details: { subscription_item: "si_a" } },
          period: { start: 100, end: 200 },
        },
      ],
    },
  };
  const result = rentalSnapshot(subscription, invoice, checkout, false, 1000);
  assert.equal(result.invoice.from, 100000);
  assert.equal(result.invoice.until, 200000);
  assert.throws(() =>
    rentalSnapshot(
      subscription,
      { ...invoice, amount_paid: 0 },
      checkout,
      false,
      1000,
    ),
  );
  assert.throws(() =>
    rentalSnapshot(
      { ...subscription, livemode: true },
      invoice,
      checkout,
      false,
      1000,
    ),
  );
});
test("manually marked invoices do not pass actual payment proof; refunds block it", async () => {
  const mock = {
    invoicePayments: { list: async () => ({ has_more: false, data: [] }) },
    paymentIntents: {
      retrieve: async () => ({ status: "succeeded", latest_charge: "ch_a" }),
    },
    charges: {
      retrieve: async () => ({
        paid: true,
        captured: true,
        amount_refunded: 0,
        disputed: false,
      }),
    },
    disputes: {
      list: async () => ({ has_more: false, data: [{ status: "won" }] }),
    },
  };
  assert.deepEqual(await verifyInvoicePayment(mock, "in_a", 100), {
    verified: false,
    blocked: false,
  });
  mock.invoicePayments.list = async () => ({
    has_more: false,
    data: [
      {
        currency: "eur",
        amount_paid: 100,
        payment: { type: "payment_intent", payment_intent: "pi_a" },
      },
    ],
  });
  assert.deepEqual(await verifyInvoicePayment(mock, "in_a", 100), {
    verified: true,
    blocked: false,
  });
  mock.charges.retrieve = async () => ({
    paid: true,
    captured: true,
    amount_refunded: 100,
    disputed: false,
  });
  assert.deepEqual(await verifyInvoicePayment(mock, "in_a", 100), {
    verified: true,
    blocked: true,
  });
  mock.charges.retrieve = async () => ({
    paid: true,
    captured: true,
    amount_refunded: 0,
    disputed: true,
  });
  assert.deepEqual(await verifyInvoicePayment(mock, "in_a", 100), {
    verified: true,
    blocked: false,
  });
  mock.disputes.list = async () => ({
    has_more: false,
    data: [{ status: "needs_response" }],
  });
  assert.deepEqual(await verifyInvoicePayment(mock, "in_a", 100), {
    verified: true,
    blocked: true,
  });
});

test("the same subscription cannot be reassigned to another checkout or customer", async () => {
  const { sql, db } = setup();
  await applyRentalSnapshot(db, snapshot(), 1000);
  await assert.rejects(
    applyRentalSnapshot(db, { ...snapshot(), customerId: "cus_other" }, 1100),
  );
  sql.exec(
    "INSERT INTO expansion_checkouts (id,expansion_id,player_id,amount_cents,status,session_id,created_at) VALUES ('other','alameda:16','other',100,'open','cs_other',0)",
  );
  await assert.rejects(
    applyRentalSnapshot(db, { ...snapshot(), checkoutId: "other" }, 1100),
  );
  sql.close();
});

test("a provider-verified resolution can restore the remaining paid period", async () => {
  const { sql, db } = setup();
  await applyRentalSnapshot(db, snapshot(), 1000);
  await applyRentalSnapshot(
    db,
    { ...snapshot(), blockedInvoiceIds: ["in_one"] },
    1100,
  );
  assert.equal(
    sql.prepare("SELECT paid_cents FROM expansions").get().paid_cents,
    0,
  );
  await applyRentalSnapshot(
    db,
    { ...snapshot(), unblockedInvoiceIds: ["in_one"] },
    1200,
  );
  assert.equal(
    sql.prepare("SELECT paid_cents FROM expansions").get().paid_cents,
    100,
  );
  assert.equal(
    sql.prepare("SELECT rent_paid_until FROM expansions").get().rent_paid_until,
    2000,
  );
  sql.close();
});

test("a delayed positive proof cannot undo a newer refund observation", async () => {
  const { sql, db } = setup();
  await applyRentalSnapshot(db, snapshot(), 1000);
  await applyRentalSnapshot(
    db,
    { ...snapshot(), observedAt: 1500, blockedInvoiceIds: ["in_one"] },
    1500,
  );
  await applyRentalSnapshot(
    db,
    { ...snapshot(), observedAt: 1200, unblockedInvoiceIds: ["in_one"] },
    1600,
  );
  assert.equal(
    sql.prepare("SELECT blocked FROM rental_invoices").get().blocked,
    1,
  );
  assert.equal(
    sql.prepare("SELECT paid_cents FROM expansions").get().paid_cents,
    0,
  );
  await applyRentalSnapshot(
    db,
    { ...snapshot(), observedAt: 1800, unblockedInvoiceIds: ["in_one"] },
    1800,
  );
  assert.equal(
    sql.prepare("SELECT blocked FROM rental_invoices").get().blocked,
    0,
  );
  sql.close();
});
