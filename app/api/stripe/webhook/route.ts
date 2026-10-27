import Stripe from "stripe";
import { env } from "cloudflare:workers";
import { json, failure, ApiError } from "../../../../lib/server";
import { boundedRequestText } from "../../../../lib/stripe-protocol";
import {
  stripeClient,
  handleRentalStripeEvent,
} from "../../../../lib/stripe-server";
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
    let event: Stripe.Event;
    try {
      event = await stripeClient().webhooks.constructEventAsync(
        raw,
        request.headers.get("stripe-signature") ?? "",
        env.STRIPE_WEBHOOK_SECRET,
        300,
        Stripe.createSubtleCryptoProvider(),
      );
    } catch {
      throw new ApiError("Firma no válida.", 400);
    }
    if (event.livemode !== /^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY))
      throw new ApiError("Modo de Stripe no válido.", 400);
    await handleRentalStripeEvent(event);
    return json({ received: true });
  } catch (error) {
    return failure(error);
  }
}
