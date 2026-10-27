import type Stripe from "stripe";
import type { CheckoutRow } from "./checkout-store";

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
