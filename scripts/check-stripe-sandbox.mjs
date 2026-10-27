// Opt-in integration check. Never accepts live credentials or the production database.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { fixture } from "../tests/helpers/database.mjs";
import { rentalSnapshot } from "../.sites-runtime/tests/rental-protocol.mjs";
import { rentalCheckoutParameters } from "../.sites-runtime/tests/rental-checkout.mjs";
import { applyRentalSnapshot } from "../.sites-runtime/tests/rental-store.mjs";
import { verifyInvoicePayment } from "../.sites-runtime/tests/stripe-proof.mjs";
import { demolishExpiredRentals } from "../.sites-runtime/tests/city-events.mjs";

const key = readFileSync(
  existsSync(".sites-runtime/stripe-e2e-key")
    ? ".sites-runtime/stripe-e2e-key"
    : ".sites-runtime/stripe-sandbox.toml",
  "utf8",
).match(/(?:rkcs|rk|sk)_test_[A-Za-z0-9]+/)?.[0];
assert.ok(key, "Se requiere una clave exclusivamente de prueba.");
const client = new Stripe(key, { maxNetworkRetries: 1, timeout: 20000 });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = Math.floor(Date.now() / 1000);
let clock, product;
const subscriptions = [];

async function advance(time) {
  await client.testHelpers.testClocks.advance(clock.id, { frozen_time: time });
  for (let i = 0; i < 30; i++) {
    await wait(1000);
    clock = await client.testHelpers.testClocks.retrieve(clock.id);
    if (clock.status === "ready") return;
  }
  throw new Error("El reloj de prueba sigue procesando.");
}

try {
  clock = await client.testHelpers.testClocks.create({
    frozen_time: now,
    name: "ChessCity monthly lifecycle",
  });
  product = await client.products.create({
    name: "ChessCity · ampliación de prueba",
  });
  const customer = await client.customers.create({
    name: "ChessCity sandbox",
    test_clock: clock.id,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });
  const checkout = {
    id: randomUUID(),
    expansion_id: "alameda:16",
    player_id: "sandbox",
    amount_cents: 100,
    created_at: Date.now(),
  };
  const session = await client.checkout.sessions.create(
    rentalCheckoutParameters(checkout, "http://127.0.0.1:5173", product.id),
  );
  assert.equal(session.livemode, false);
  assert.equal(session.amount_total, 100);
  assert.equal(session.mode, "subscription");
  await client.checkout.sessions.expire(session.id);
  console.log(
    "PASS · Checkout real de prueba acepta los parámetros de producción.",
  );

  const { sql, db } = fixture();
  sql
    .prepare(
      "INSERT INTO expansion_checkouts (id,expansion_id,player_id,amount_cents,status,session_id,created_at) VALUES (?,'alameda:16','sandbox',100,'open',?,?)",
    )
    .run(checkout.id, session.id, checkout.created_at);
  let sub = await client.subscriptions.create({
    customer: customer.id,
    items: [
      {
        price_data: {
          product: product.id,
          currency: "eur",
          unit_amount: 100,
          recurring: { interval: "month" },
        },
      },
    ],
    payment_behavior: "error_if_incomplete",
    expand: ["latest_invoice"],
  });
  subscriptions.push(sub.id);

  async function reconcile() {
    sub = await client.subscriptions.retrieve(sub.id, {
      expand: ["latest_invoice"],
    });
    const invoice = sub.latest_invoice;
    const snapshot = rentalSnapshot(
      sub,
      invoice,
      { ...checkout, session_id: session.id },
      false,
      Date.now(),
      product.id,
    );
    if (snapshot.invoice) {
      const proof = await verifyInvoicePayment(client, invoice.id, 100);
      assert.ok(proof.verified, "Se debe verificar el pago real de prueba.");
      snapshot.blockedInvoiceIds = proof.blocked ? [invoice.id] : [];
      snapshot.unblockedInvoiceIds = proof.blocked ? [] : [invoice.id];
    }
    await applyRentalSnapshot(db, snapshot, clock.frozen_time * 1000);
    return { invoice, snapshot };
  }

  let first = await reconcile();
  assert.equal(first.invoice.status, "paid");
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM plots").get().n, 4);
  await reconcile();
  assert.equal(
    sql.prepare("SELECT COUNT(*) n FROM rental_invoices").get().n,
    1,
  );
  console.log(
    "PASS · Pago, prueba bancaria y conciliación idempotente de cuatro parcelas.",
  );

  await advance(first.snapshot.invoice.until / 1000 + 3700);
  let renewal = await reconcile();
  if (renewal.invoice.status !== "paid") {
    await advance(clock.frozen_time + 3700);
    renewal = await reconcile();
  }
  assert.equal(renewal.invoice.status, "paid");
  assert.notEqual(renewal.invoice.id, first.invoice.id);
  assert.equal(
    sql.prepare("SELECT COUNT(*) n FROM rental_invoices").get().n,
    2,
  );
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM plots").get().n, 4);
  console.log("PASS · Renovación mensual del proveedor sin duplicar parcelas.");

  const declined = await client.paymentMethods.attach(
    "pm_card_chargeCustomerFail",
    { customer: customer.id },
  );
  await client.subscriptions.update(sub.id, {
    default_payment_method: declined.id,
  });
  await advance(renewal.snapshot.invoice.until / 1000 + 7400);
  let failed = await reconcile();
  assert.notEqual(failed.invoice.status, "paid");
  assert.equal(
    sql.prepare("SELECT rent_paid_until FROM expansions").get().rent_paid_until,
    renewal.snapshot.invoice.until,
  );
  const valid = await client.paymentMethods.attach("pm_card_visa", {
    customer: customer.id,
  });
  await client.subscriptions.update(sub.id, {
    default_payment_method: valid.id,
  });
  await client.invoices.pay(failed.invoice.id, { payment_method: valid.id });
  let recovered = await reconcile();
  assert.equal(recovered.invoice.status, "paid");
  console.log(
    "PASS · Impago no concede un mes; recuperar el pago restablece cobertura.",
  );

  await client.subscriptions.update(sub.id, { cancel_at_period_end: true });
  await reconcile();
  sql.exec(
    "INSERT INTO players (id,username,profile,updated_at,claimed,plot_id,building_xp,active_days) VALUES ('sandbox','Sandbox','{}',0,1,'alameda:16',900,14)",
  );
  await advance(recovered.snapshot.invoice.until / 1000 + 2);
  await reconcile();
  assert.equal(sub.status, "canceled");
  await demolishExpiredRentals(
    db,
    clock.frozen_time * 1000,
    new Set([checkout.expansion_id]),
  );
  const resident = sql
    .prepare("SELECT * FROM players WHERE id='sandbox'")
    .get();
  assert.equal(resident.plot_id, "libre:0");
  assert.equal(resident.building_xp, 900);
  console.log(
    "PASS · Cancelación y vencimiento trasladan al jugador sin perder progreso.",
  );
  sql.close();
  const shared = fixture();
  const sharedSubscriptions = [];
  for (const index of [0, 1]) {
    const contribution = {
      ...checkout,
      id: randomUUID(),
      player_id: `shared${index}`,
      amount_cents: 50,
    };
    shared.sql
      .prepare(
        "INSERT INTO expansion_checkouts (id,expansion_id,player_id,amount_cents,status,session_id,created_at) VALUES (?,'alameda:16',?,50,'open',?,?)",
      )
      .run(
        contribution.id,
        contribution.player_id,
        `cs_shared${index}`,
        Date.now(),
      );
    const subscription = await client.subscriptions.create({
      customer: customer.id,
      default_payment_method: valid.id,
      items: [
        {
          price_data: {
            product: product.id,
            currency: "eur",
            unit_amount: 50,
            recurring: { interval: "month" },
          },
        },
      ],
      payment_behavior: "error_if_incomplete",
      expand: ["latest_invoice"],
    });
    const snap = rentalSnapshot(
      subscription,
      subscription.latest_invoice,
      contribution,
      false,
      Date.now(),
      product.id,
    );
    const proof = await verifyInvoicePayment(client, snap.invoice.id, 50);
    assert.ok(proof.verified && !proof.blocked);
    await applyRentalSnapshot(shared.db, snap, clock.frozen_time * 1000);
    assert.equal(
      shared.sql.prepare("SELECT COUNT(*) n FROM plots").get().n,
      index === 0 ? 0 : 4,
    );
    sharedSubscriptions.push({ subscription, contribution, snap });
  }
  console.log(
    "PASS · Dos pagos simulados de 0,50 € activan una sola ampliación.",
  );
  const refunded = sharedSubscriptions[0];
  const payments = await client.invoicePayments.list({
    invoice: refunded.snap.invoice.id,
    status: "paid",
  });
  const intent = await client.paymentIntents.retrieve(
    payments.data[0].payment.payment_intent,
  );
  await client.refunds.create({ charge: intent.latest_charge, amount: 50 });
  const proof = await verifyInvoicePayment(
    client,
    refunded.snap.invoice.id,
    50,
  );
  assert.ok(proof.verified && proof.blocked);
  await applyRentalSnapshot(
    shared.db,
    {
      ...refunded.snap,
      observedAt: Date.now(),
      blockedInvoiceIds: [refunded.snap.invoice.id],
    },
    clock.frozen_time * 1000,
  );
  assert.ok(
    shared.sql.prepare("SELECT rent_paid_until FROM expansions").get()
      .rent_paid_until <=
      clock.frozen_time * 1000,
  );
  shared.sql.close();
  console.log(
    "PASS · Un reembolso simulado bloquea la cobertura correspondiente.",
  );
  writeFileSync(
    ".sites-runtime/stripe-sandbox-result.json",
    JSON.stringify({
      account: clock.account,
      clockId: clock.id,
      productId: product.id,
      subscriptionId: sub.id,
      checkedAt: new Date().toISOString(),
      success: true,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      error: error.type ?? error.name,
      code: error.code,
      message: error.message,
    }),
  );
  process.exitCode = 1;
} finally {
  // All created objects live in this temporary sandbox; clock deletion removes its customers/subscriptions.
  if (clock) await client.testHelpers.testClocks.del(clock.id).catch(() => {});
  if (product)
    await client.products.update(product.id, { active: false }).catch(() => {});
}
