import { env } from "cloudflare:workers";
import { database, json, failure, ApiError } from "../../../../lib/server";
import {
  verifyStripeSignature,
  boundedRequestText,
} from "../../../../lib/stripe-protocol";
import { reconcileCheckout } from "../../../../lib/stripe-server";
import type { CheckoutRow } from "../../../../lib/checkout-store";
export async function POST(request: Request) {
  try {
    if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY)
      throw new ApiError("Stripe no configurado.", 503);
    let raw;
    try {
      raw = await boundedRequestText(request, 65536);
    } catch {
      throw new ApiError("Evento demasiado grande.", 413);
    }
    try {
      await verifyStripeSignature(
        raw,
        request.headers.get("stripe-signature"),
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch {
      throw new ApiError("Firma no válida.", 400);
    }
    let event;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new ApiError("Evento no válido.");
    }
    if (
      [
        "checkout.session.completed",
        "checkout.session.expired",
        "checkout.session.async_payment_succeeded",
      ].includes(event.type)
    ) {
      const id = event.data?.object?.id;
      if (typeof id !== "string") throw new ApiError("Sesión no válida.");
      const checkout = await database()
        .prepare("SELECT * FROM expansion_checkouts WHERE session_id=?")
        .bind(id)
        .first<CheckoutRow>();
      // Do not apply unrelated products or sessions created outside this application.
      if (checkout) await reconcileCheckout(checkout);
    }
    return json({ received: true });
  } catch (error) {
    return failure(error);
  }
}
