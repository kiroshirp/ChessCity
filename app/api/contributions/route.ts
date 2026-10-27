import {
  requireOrigin,
  session,
  database,
  json,
  failure,
  ApiError,
} from "../../../lib/server";
import {
  stripeEnabled,
  reconcileCheckout,
  cancelPendingContribution,
} from "../../../lib/stripe-server";
import { boundedRequestText } from "../../../lib/stripe-protocol";
import type { CheckoutRow } from "../../../lib/checkout-store";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await session(request);
    if (!user) throw new ApiError("Sesión requerida.", 401);
    if (!stripeEnabled()) return json({ status: "disabled" });
    let cancel = false;
    try {
      const text = await boundedRequestText(request, 1024);
      if (text) {
        const body = JSON.parse(text);
        if (!body || typeof body.cancel !== "boolean") throw new Error();
        cancel = body.cancel;
      }
    } catch {
      throw new ApiError("Petición no válida.");
    }
    const pending = await database()
      .prepare(
        "SELECT * FROM expansion_checkouts WHERE player_id=? AND status IN ('creating','open') ORDER BY created_at DESC LIMIT 1",
      )
      .bind(user.player_id)
      .first<CheckoutRow>();
    const result = pending
      ? await (cancel
          ? cancelPendingContribution(pending)
          : reconcileCheckout(pending))
      : null;
    return json({ status: result?.status ?? "none" });
  } catch (error) {
    return failure(error);
  }
}
