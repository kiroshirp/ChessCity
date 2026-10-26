import {
  EXPANSION_PRICE_CENTS,
  EXPANSION_SLOTS,
  MAX_COMMUNITY_SLOTS,
  plotCoordinates,
} from "./neighborhoods";

/** Server-only integration point. Never call with a browser's claim that a payment succeeded.
 * A future provider webhook must verify its signature and final paid status first.
 * No public route calls this function while checkout is disabled.
 */
export async function settleVerifiedExpansionPayment(
  db: D1Database,
  payment: {
    eventId: string;
    expansionId: string;
    amountCents: number;
    currency: string;
  },
) {
  if (
    !/^[a-zA-Z0-9_.:-]{1,180}$/.test(payment.eventId) ||
    payment.currency !== "EUR" ||
    !Number.isInteger(payment.amountCents) ||
    payment.amountCents <= 0 ||
    payment.amountCents > EXPANSION_PRICE_CENTS
  )
    throw new Error("Pago no válido.");
  const expansion = await db
    .prepare("SELECT * FROM expansions WHERE id=?")
    .bind(payment.expansionId)
    .first<Record<string, any>>();
  if (
    !expansion ||
    expansion.goal_cents !== EXPANSION_PRICE_CENTS ||
    expansion.added_slots !== EXPANSION_SLOTS
  )
    throw new Error("Ampliación no válida.");
  const existing = await db
    .prepare("SELECT * FROM expansion_payments WHERE event_id=?")
    .bind(payment.eventId)
    .first<Record<string, any>>();
  if (existing) {
    if (
      existing.expansion_id !== payment.expansionId ||
      existing.amount_cents !== payment.amountCents ||
      existing.currency !== payment.currency
    )
      throw new Error("El evento de pago ya tiene otro contenido.");
    return { duplicate: true, applied: expansion.status === "applied" };
  }
  if (expansion.status !== "awaiting_payment")
    throw new Error("La ampliación ya no admite aportaciones.");
  const capacity = Number(String(expansion.id).split(":")[1]);
  if (
    !Number.isInteger(capacity) ||
    capacity < 16 ||
    capacity + EXPANSION_SLOTS > MAX_COMMUNITY_SLOTS
  )
    throw new Error("Capacidad no válida.");
  const eligible = `EXISTS (SELECT 1 FROM expansions e JOIN communities c ON c.id=e.community_id
    WHERE e.id=? AND e.status='awaiting_payment' AND e.paid_cents>=e.goal_cents AND c.capacity=?)`;
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO expansion_payments (event_id,expansion_id,amount_cents,currency,received_at)
      VALUES (?,?,?,?,?)`,
      )
      .bind(
        payment.eventId,
        payment.expansionId,
        payment.amountCents,
        payment.currency,
        Date.now(),
      ),
    db
      .prepare(
        `UPDATE expansions SET paid_cents=COALESCE((SELECT SUM(amount_cents-refunded_cents) FROM expansion_payments WHERE expansion_id=?),0) WHERE id=?`,
      )
      .bind(payment.expansionId, payment.expansionId),
    ...Array.from({ length: EXPANSION_SLOTS }, (_, index) => {
      const slot = capacity + index,
        point = plotCoordinates(expansion.community_id, slot);
      return db
        .prepare(
          `INSERT OR IGNORE INTO plots (id,community_id,slot,x,z) SELECT ?,?,?,?,? WHERE ${eligible}`,
        )
        .bind(
          `${expansion.community_id}:${slot}`,
          expansion.community_id,
          slot,
          point.x,
          point.z,
          payment.expansionId,
          capacity,
        );
    }),
    db
      .prepare(
        `UPDATE communities SET capacity=capacity+? WHERE id=? AND capacity=? AND EXISTS
      (SELECT 1 FROM expansions WHERE id=? AND status='awaiting_payment' AND paid_cents>=goal_cents)`,
      )
      .bind(
        EXPANSION_SLOTS,
        expansion.community_id,
        capacity,
        payment.expansionId,
      ),
    db
      .prepare(
        `UPDATE expansions SET status='applied',applied_at=? WHERE id=? AND status='awaiting_payment'
      AND paid_cents>=goal_cents AND EXISTS (SELECT 1 FROM communities WHERE id=? AND capacity=?)`,
      )
      .bind(
        Date.now(),
        payment.expansionId,
        expansion.community_id,
        capacity + EXPANSION_SLOTS,
      ),
  ]);
  const status = await db
    .prepare("SELECT status FROM expansions WHERE id=?")
    .bind(payment.expansionId)
    .first<{ status: string }>();
  return { duplicate: false, applied: status?.status === "applied" };
}
