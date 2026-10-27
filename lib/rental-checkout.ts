import type Stripe from "stripe";
import type { CheckoutRow } from "./checkout-store";

export async function cancelRentalCheckout(
  client: Pick<Stripe, "checkout">,
  pending: Pick<CheckoutRow, "id" | "session_id" | "amount_cents">,
  live: boolean,
) {
  if (!pending.session_id)
    throw new Error("La aportación sigue creándose. Inténtalo de nuevo.");
  const current = await client.checkout.sessions.retrieve(pending.session_id);
  if (
    current.id !== pending.session_id ||
    current.client_reference_id !== pending.id ||
    current.mode !== "subscription" ||
    current.livemode !== live ||
    current.amount_total !== pending.amount_cents
  )
    throw new Error("La sesión no corresponde a esta aportación.");
  if (current.status === "open") {
    try {
      await client.checkout.sessions.expire(current.id);
    } catch (error) {
      const updated = await client.checkout.sessions.retrieve(current.id);
      if (updated.status === "open") throw error;
    }
  }
}

export function rentalCheckoutParameters(
  pending: Pick<
    CheckoutRow,
    "id" | "created_at" | "amount_cents" | "expansion_id" | "player_id"
  >,
  origin: string,
  productId: string,
): Stripe.Checkout.SessionCreateParams {
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
  return {
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
          product: productId,
          tax_behavior: "inclusive",
          recurring: { interval: "month" },
        },
      },
    ],
    metadata,
    subscription_data: { metadata },
  };
}
