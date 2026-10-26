import { env } from "cloudflare:workers";
import { ApiError, database } from "./server";
import { STRIPE_PRODUCT_ID } from "./neighborhoods";
import { reserveContribution, type CheckoutRow } from "./checkout-store";
import { validatePaidCheckout } from "./stripe-protocol";
import { settleVerifiedExpansionPayment } from "./expansion-settlement";

// Renewal/invoice reconciliation must be completed and tested before enabling rentals.
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
async function stripe(
  path: string,
  body?: URLSearchParams,
  idempotency?: string,
) {
  if (!env.STRIPE_SECRET_KEY)
    throw new ApiError("Stripe todavía no está configurado.", 503);
  const response = await fetch("https://api.stripe.com/v1/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new ApiError(
      "Stripe no ha podido completar la operación. Tu aportación no se ha desbloqueado; vuelve a consultar su estado.",
      502,
    );
  return response.json() as Promise<any>;
}

export async function reconcileCheckout(checkout: CheckoutRow) {
  if (!checkout.session_id) return checkout;
  const session = await stripe(
    `checkout/sessions/${encodeURIComponent(checkout.session_id)}`,
  );
  if (session.status === "expired") {
    await database()
      .prepare(
        "UPDATE expansion_checkouts SET status='expired' WHERE id=? AND status='open'",
      )
      .bind(checkout.id)
      .run();
  } else if (
    session.status === "complete" &&
    session.payment_status === "paid"
  ) {
    if (!RENTAL_LIFECYCLE_READY)
      throw new ApiError(
        "La conciliación de los alquileres mensuales aún no está activada.",
        503,
      );
    const lines = await stripe(
      `checkout/sessions/${encodeURIComponent(checkout.session_id)}/line_items?limit=2`,
    );
    validatePaidCheckout(
      session,
      checkout,
      lines,
      env.STRIPE_SECRET_KEY!.startsWith("sk_live_") ||
        env.STRIPE_SECRET_KEY!.startsWith("rk_live_"),
    );
    await settleVerifiedExpansionPayment(database(), {
      eventId: session.id,
      expansionId: checkout.expansion_id,
      amountCents: checkout.amount_cents,
      currency: "EUR",
      checkoutId: checkout.id,
    });
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
  const product = await stripe(`products/${STRIPE_PRODUCT_ID}`);
  if (!product.active)
    throw new ApiError("Este producto no está disponible.", 409);
  let pending = await database()
    .prepare(
      "SELECT * FROM expansion_checkouts WHERE player_id=? AND status IN ('creating','open') LIMIT 1",
    )
    .bind(playerId)
    .first<CheckoutRow>();
  if (pending) pending = await reconcileCheckout(pending);
  // Recover uncertain API results using the same immutable parameters and idempotency key.
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
  const body = new URLSearchParams({
    mode: "subscription",
    client_reference_id: pending.id,
    success_url: `${origin}/?payment=return`,
    cancel_url: `${origin}/?payment=cancel`,
    expires_at: String(Math.floor(pending.created_at / 1000) + 1800),
    "payment_method_types[0]": "card",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][recurring][interval]": "month",
    "line_items[0][price_data][unit_amount]": String(pending.amount_cents),
    "line_items[0][price_data][product]": STRIPE_PRODUCT_ID,
    "line_items[0][price_data][tax_behavior]": "inclusive",
    "metadata[checkoutId]": pending.id,
    "metadata[expansionId]": pending.expansion_id,
    "metadata[playerId]": pending.player_id,
  });
  const session = await stripe(
    "checkout/sessions",
    body,
    `chesscity:${pending.id}`,
  );
  if (
    typeof session.id !== "string" ||
    typeof session.url !== "string" ||
    new URL(session.url).hostname !== "checkout.stripe.com"
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
