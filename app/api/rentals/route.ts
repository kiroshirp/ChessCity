import {
  database,
  session,
  requireOrigin,
  json,
  failure,
  ApiError,
} from "../../../lib/server";
import { cancelOwnRental } from "../../../lib/stripe-server";
import { boundedRequestText } from "../../../lib/stripe-protocol";
async function ownRentals(playerId: string) {
  const rows = await database()
    .prepare(
      `SELECT s.id,s.expansion_id AS expansionId,s.amount_cents AS amountCents,s.status,s.cancel_at_period_end AS cancelAtPeriodEnd,
  (SELECT MAX(i.period_end) FROM rental_invoices i WHERE i.subscription_id=s.id AND i.blocked=0) AS paidUntil
  FROM rental_subscriptions s WHERE s.player_id=? ORDER BY s.observed_at DESC LIMIT 50`,
    )
    .bind(playerId)
    .all();
  return rows.results;
}
export async function GET(request: Request) {
  try {
    const user = await session(request);
    if (!user) throw new ApiError("Sesión requerida.", 401);
    return json({ rentals: await ownRentals(user.player_id) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await session(request);
    if (!user) throw new ApiError("Sesión requerida.", 401);
    let body;
    try {
      body = JSON.parse(await boundedRequestText(request, 1024));
    } catch {
      throw new ApiError("Petición no válida.");
    }
    if (typeof body?.id !== "string" || !/^sub_[a-zA-Z0-9]+$/.test(body.id))
      throw new ApiError("Aportación no válida.");
    await cancelOwnRental(user.player_id, body.id);
    return json({ rentals: await ownRentals(user.player_id) });
  } catch (error) {
    return failure(error);
  }
}
