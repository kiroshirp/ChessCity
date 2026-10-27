import { contributionAmount } from "./stripe-protocol";

export interface CheckoutRow {
  id: string;
  expansion_id: string;
  player_id: string;
  amount_cents: number;
  status: string;
  session_id: string | null;
  checkout_url: string | null;
  created_at: number;
}

/** One atomic statement reserves remaining funding, across Worker instances. Never free on a client redirect. */
export async function reserveContribution(
  db: D1Database,
  id: string,
  expansionId: string,
  playerId: string,
  amount: unknown,
  now: number,
) {
  const cents = contributionAmount(amount);
  const result = await db
    .prepare(
      `INSERT INTO expansion_checkouts
  (id,expansion_id,player_id,amount_cents,status,created_at)
  SELECT ?,?,?,?,'creating',? FROM expansions e
  WHERE e.id=? AND e.status='awaiting_payment' AND e.added_slots=4 AND e.goal_cents=100
  AND EXISTS (SELECT 1 FROM players p JOIN plots l ON p.plot_id=l.id WHERE p.id=? AND p.claimed=1 AND l.community_id=e.community_id)
  AND NOT EXISTS (SELECT 1 FROM expansion_checkouts WHERE player_id=? AND status IN ('creating','open'))
  AND COALESCE((SELECT SUM(s.amount_cents) FROM rental_subscriptions s WHERE s.expansion_id=e.id AND (s.status NOT IN ('canceled','incomplete_expired') OR EXISTS (SELECT 1 FROM rental_invoices i WHERE i.subscription_id=s.id AND i.period_end>? AND i.blocked=0))),0)
+COALESCE((SELECT SUM(amount_cents) FROM expansion_checkouts WHERE expansion_id=e.id AND status IN ('creating','open')),0)+?<=e.goal_cents`,
    )
    .bind(
      id,
      expansionId,
      playerId,
      cents,
      now,
      expansionId,
      playerId,
      playerId,
      now,
      cents,
    )
    .run();
  return result.meta.changes > 0;
}
