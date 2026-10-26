import Stripe from "stripe";
import { env } from "cloudflare:workers";
import { ApiError, database } from "./server";
import { STRIPE_PRODUCT_ID } from "./neighborhoods";
import { reserveContribution, type CheckoutRow } from "./checkout-store";
import { validateRentalCheckout } from "./stripe-protocol";
import { rentalSnapshot, renewalProcessing, stripeId } from "./rental-protocol";
import { applyRentalSnapshot } from "./rental-store";
import { verifyInvoicePayment } from "./stripe-proof";
import { demolishExpiredRentals } from "./city-events";

// Keep checkout closed until a full sandbox cycle and production credentials are verified.
const RENTAL_LIFECYCLE_READY = false;
export function stripeEnabled() {
  return (
    RENTAL_LIFECYCLE_READY &&
    env.STRIPE_PAYMENTS_ENABLED === "true" &&
    !!env.STRIPE_SECRET_KEY &&
    !!env.STRIPE_WEBHOOK_SECRET &&
    !!env.CHESSCITY_PUBLIC_ORIGIN
  );
}
export function stripeProductId() {
  const id = env.STRIPE_PRODUCT_ID ?? STRIPE_PRODUCT_ID;
  if (!/^prod_[a-zA-Z0-9]+$/.test(id))
    throw new ApiError("Producto de Stripe no válido.", 503);
  return id;
}
export function stripeClient() {
  if (!env.STRIPE_SECRET_KEY)
    throw new ApiError("Stripe todavía no está configurado.", 503);
  return new Stripe(env.STRIPE_SECRET_KEY, {
    httpClient: Stripe.createFetchHttpClient(),
    timeout: 15000,
    maxNetworkRetries: 1,
  });
}
const isLive = () => /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY ?? "");

export async function reconcileSubscription(
  subscriptionId: string,
  blockedInvoiceIds: string[] = [],
  unblockedInvoiceIds: string[] = [],
) {
  const observedAt = Date.now(),
    client = stripeClient();
  const subscription = await client.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice"],
  });
  let row = await database()
    .prepare("SELECT checkout_id FROM rental_subscriptions WHERE id=?")
    .bind(subscription.id)
    .first<{ checkout_id: string }>();
  // Explicit fallback for an invoice webhook that reaches us before Checkout's completion webhook.
  if (!row && subscription.metadata.checkoutId) {
    const pending = await database()
      .prepare("SELECT * FROM expansion_checkouts WHERE id=?")
      .bind(subscription.metadata.checkoutId)
      .first<CheckoutRow>();
    if (pending?.session_id) {
      const session = await client.checkout.sessions.retrieve(
        pending.session_id,
      );
      if (
        stripeId(session.subscription) === subscription.id &&
        session.client_reference_id === pending.id
      )
        row = { checkout_id: pending.id };
    }
  }
  if (!row) return { ignored: true, processing: false, expansionId: null };
  const checkout = (await database()
    .prepare("SELECT * FROM expansion_checkouts WHERE id=?")
    .bind(row.checkout_id)
    .first<CheckoutRow>())!;
  const invoice =
    typeof subscription.latest_invoice === "object"
      ? subscription.latest_invoice
      : null;
  const snapshot = rentalSnapshot(
    subscription,
    invoice,
    checkout,
    isLive(),
    observedAt,
    stripeProductId(),
  );
  let processing = renewalProcessing(subscription, invoice, Date.now());
  if (snapshot.invoice) {
    const proof = await verifyInvoicePayment(
      client,
      snapshot.invoice.id,
      snapshot.amountCents,
    );
    if (!proof.verified) {
      delete snapshot.invoice;
      processing = true;
    } else if (proof.blocked) blockedInvoiceIds.push(snapshot.invoice.id);
    else unblockedInvoiceIds.push(snapshot.invoice.id);
  }
  snapshot.blockedInvoiceIds = blockedInvoiceIds;
  snapshot.unblockedInvoiceIds = unblockedInvoiceIds;
  await applyRentalSnapshot(database(), snapshot);
  return { ignored: false, processing, expansionId: checkout.expansion_id };
}

export async function reconcileCheckout(checkout: CheckoutRow) {
  if (!checkout.session_id) return checkout;
  const client = stripeClient(),
    session = await client.checkout.sessions.retrieve(checkout.session_id);
  if (session.status === "expired") {
    await database()
      .prepare(
        "UPDATE expansion_checkouts SET status='expired' WHERE id=? AND status='open'",
      )
      .bind(checkout.id)
      .run();
  } else if (session.status === "complete" && session.mode === "subscription") {
    // Paid and asynchronous sessions share identity validation; only invoices grant rented territory.
    const lines = await client.checkout.sessions.listLineItems(session.id, {
      limit: 2,
    });
    validateRentalCheckout(
      session,
      checkout,
      lines,
      isLive(),
      false,
      stripeProductId(),
    );
    const subscriptionId = stripeId(session.subscription);
    if (!subscriptionId)
      throw new ApiError("La sesión no tiene una suscripción válida.", 409);
    await reconcileSubscription(subscriptionId);
  }
  return (await database()
    .prepare("SELECT * FROM expansion_checkouts WHERE id=?")
    .bind(checkout.id)
    .first<CheckoutRow>())!;
}

export async function createContribution(
  playerId: string,
  expansionId: string,
  amount: unknown,
) {
  if (!stripeEnabled())
    throw new ApiError(
      "Los cobros aún no están activados. No se ha realizado ningún cargo.",
      503,
    );
  const client = stripeClient(),
    product = await client.products.retrieve(stripeProductId());
  if (!product.active || product.livemode !== isLive())
    throw new ApiError("Este producto no está disponible.", 409);
  let pending = await database()
    .prepare(
      "SELECT * FROM expansion_checkouts WHERE player_id=? AND status IN ('creating','open') LIMIT 1",
    )
    .bind(playerId)
    .first<CheckoutRow>();
  if (pending) pending = await reconcileCheckout(pending);
  if (
    pending &&
    pending.status === "creating" &&
    Date.now() - pending.created_at > 23 * 3600000
  )
    throw new ApiError(
      "Hay una aportación pendiente de revisión. No se abrirá otro cobro.",
      409,
    );
  if (pending && ["creating", "open"].includes(pending.status)) {
    if (pending.expansion_id !== expansionId || pending.amount_cents !== amount)
      throw new ApiError(
        "Tienes otra aportación pendiente. Reanúdala antes de empezar otra.",
        409,
      );
  } else {
    const id = crypto.randomUUID();
    if (
      !(await reserveContribution(
        database(),
        id,
        expansionId,
        playerId,
        amount,
        Date.now(),
      ))
    )
      throw new ApiError(
        "El importe restante está reservado o la solicitud ya ha terminado. Actualiza la comunidad.",
        409,
      );
    pending = (await database()
      .prepare("SELECT * FROM expansion_checkouts WHERE id=?")
      .bind(id)
      .first<CheckoutRow>())!;
  }
  if (pending.status === "open") return { url: pending.checkout_url };
  const origin = new URL(env.CHESSCITY_PUBLIC_ORIGIN!).origin;
  const suffix = pending.id
    .replaceAll("-", "")
    .slice(0, 8)
    .split("")
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join("");
  const metadata = {
    checkoutId: pending.id,
    expansionId: pending.expansion_id,
    playerId: pending.player_id,
  };
  const session = await client.checkout.sessions.create(
    {
      mode: "subscription",
      client_reference_id: pending.id,
      integration_identifier: `chesscity-${suffix}`,
      success_url: `${origin}/?payment=return`,
      cancel_url: `${origin}/?payment=cancel`,
      expires_at: Math.floor(pending.created_at / 1000) + 1800,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: pending.amount_cents,
            product: stripeProductId(),
            tax_behavior: "inclusive",
            recurring: { interval: "month" },
          },
        },
      ],
      metadata,
      subscription_data: { metadata },
    },
    { idempotencyKey: `chesscity:${pending.id}` },
  );
  if (
    !session.url ||
    new URL(session.url).hostname !== "checkout.stripe.com" ||
    new URL(session.url).protocol !== "https:"
  )
    throw new ApiError("Respuesta de Stripe no válida.", 502);
  await database()
    .prepare(
      "UPDATE expansion_checkouts SET session_id=?,checkout_url=?,status='open' WHERE id=? AND status='creating'",
    )
    .bind(session.id, session.url, pending.id)
    .run();
  return { url: session.url };
}

export async function reconcileDueRentals() {
  if (!env.DB || !env.STRIPE_SECRET_KEY) return;
  const now = Date.now(),
    verified = new Set<string>();
  const rentals = await database()
    .prepare(
      "SELECT id FROM expansions WHERE status='applied' AND rent_paid_until<=?",
    )
    .bind(now)
    .all<{ id: string }>();
  for (const rental of rentals.results) {
    const subscriptions = await database()
      .prepare("SELECT id FROM rental_subscriptions WHERE expansion_id=?")
      .bind(rental.id)
      .all<{ id: string }>();
    if (!subscriptions.results.length) continue;
    let ready = true;
    for (const subscription of subscriptions.results) {
      try {
        if ((await reconcileSubscription(subscription.id)).processing)
          ready = false;
      } catch {
        ready = false;
      }
    }
    if (ready) verified.add(rental.id);
  }
  await demolishExpiredRentals(database(), now, verified);
}

async function projectSubscription(id: string, checkoutId?: string) {
  return !!(await database()
    .prepare(
      "SELECT id FROM rental_subscriptions WHERE id=? UNION ALL SELECT id FROM expansion_checkouts WHERE id=? LIMIT 1",
    )
    .bind(id, checkoutId ?? "")
    .first());
}

export async function handleRentalStripeEvent(event: Stripe.Event) {
  const object = event.data.object as any;
  if (event.type.startsWith("checkout.session.")) {
    const row = await database()
      .prepare("SELECT * FROM expansion_checkouts WHERE session_id=?")
      .bind(object.id)
      .first<CheckoutRow>();
    if (row) await reconcileCheckout(row);
  } else if (event.type.startsWith("customer.subscription.")) {
    if (await projectSubscription(object.id, object.metadata?.checkoutId))
      await reconcileSubscription(object.id);
  } else if (event.type.startsWith("invoice.")) {
    const subscriptionId = stripeId(
      object.parent?.subscription_details?.subscription,
    );
    if (
      subscriptionId &&
      (await projectSubscription(
        subscriptionId,
        object.parent?.subscription_details?.metadata?.checkoutId,
      ))
    )
      await reconcileSubscription(subscriptionId);
  } else if (
    event.type === "charge.refunded" ||
    event.type.startsWith("charge.dispute.")
  ) {
    const client = stripeClient();
    const charge =
      event.type === "charge.refunded"
        ? object
        : await client.charges.retrieve(stripeId(object.charge)!);
    const intentId = stripeId(charge.payment_intent);
    if (intentId) {
      const payments = await client.invoicePayments.list({
        payment: { type: "payment_intent", payment_intent: intentId },
        limit: 10,
      });
      if (payments.has_more)
        throw new Error("Demasiadas facturas asociadas; requiere revisión.");
      for (const payment of payments.data) {
        const invoice = await client.invoices.retrieve(
          stripeId(payment.invoice)!,
        );
        const subscriptionId = stripeId(
          invoice.parent?.subscription_details?.subscription,
        );
        if (
          subscriptionId &&
          (await projectSubscription(
            subscriptionId,
            invoice.parent?.subscription_details?.metadata?.checkoutId,
          ))
        ) {
          const proof = await verifyInvoicePayment(
            client,
            invoice.id,
            invoice.amount_paid,
          );
          if (proof.verified)
            await reconcileSubscription(
              subscriptionId,
              proof.blocked ? [invoice.id] : [],
              proof.blocked ? [] : [invoice.id],
            );
        }
      }
    }
  }
}

export async function cancelOwnRental(playerId: string, id: string) {
  const row = await database()
    .prepare(
      "SELECT id,status FROM rental_subscriptions WHERE id=? AND player_id=?",
    )
    .bind(id, playerId)
    .first<{ id: string; status: string }>();
  if (!row) throw new ApiError("No se ha encontrado esta aportación.", 404);
  if (["canceled", "incomplete_expired"].includes(row.status)) return;
  await stripeClient().subscriptions.update(row.id, {
    cancel_at_period_end: true,
  });
  await reconcileSubscription(row.id);
}
