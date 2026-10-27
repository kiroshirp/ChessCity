import {
  EXPANSION_SLOTS,
  EXPANSION_PRICE_CENTS,
  MAX_COMMUNITY_SLOTS,
  plotCoordinates,
} from "./neighborhoods";
import { contributionAmount } from "./stripe-protocol";
export interface RentalSnapshot {
  id: string;
  checkoutId: string;
  customerId: string;
  status: string;
  amountCents: number;
  cancelAtPeriodEnd: boolean;
  observedAt: number;
  invoice?: { id: string; amountCents: number; from: number; until: number };
  blockedInvoiceIds?: string[];
  unblockedInvoiceIds?: string[];
}
const funded = `EXISTS (SELECT 1 FROM rental_invoices i WHERE i.subscription_id=s.id AND i.blocked=0 AND i.period_start<=? AND i.period_end>?)`;

/** Dates are the paid invoice's service period, never an accumulated number of months. */
export async function applyRentalSnapshot(
  db: D1Database,
  snapshot: RentalSnapshot,
  now = Date.now(),
) {
  contributionAmount(snapshot.amountCents);
  if (
    !/^sub_[a-zA-Z0-9]+$/.test(snapshot.id) ||
    !/^cus_[a-zA-Z0-9]+$/.test(snapshot.customerId) ||
    !Number.isSafeInteger(snapshot.observedAt)
  )
    throw new Error("Suscripción no válida.");
  const checkout = await db
    .prepare("SELECT * FROM expansion_checkouts WHERE id=?")
    .bind(snapshot.checkoutId)
    .first<Record<string, any>>();
  if (!checkout?.session_id || checkout.amount_cents !== snapshot.amountCents)
    throw new Error("Aportación no válida.");
  const owner = await db
    .prepare(
      "SELECT checkout_id,customer_id FROM rental_subscriptions WHERE id=?",
    )
    .bind(snapshot.id)
    .first<{ checkout_id: string; customer_id: string }>();
  if (
    owner &&
    (owner.checkout_id !== snapshot.checkoutId ||
      owner.customer_id !== snapshot.customerId)
  )
    throw new Error("La suscripción ya tiene otro propietario.");
  const expansion = await db
    .prepare("SELECT * FROM expansions WHERE id=?")
    .bind(checkout.expansion_id)
    .first<Record<string, any>>();
  if (
    !expansion ||
    expansion.goal_cents !== EXPANSION_PRICE_CENTS ||
    expansion.added_slots !== EXPANSION_SLOTS
  )
    throw new Error("Alquiler no válido.");
  const base = Number(expansion.id.split(":")[1]);
  if (
    !Number.isInteger(base) ||
    base < 16 ||
    base % 4 ||
    base + 4 > MAX_COMMUNITY_SLOTS
  )
    throw new Error("Terreno no válido.");
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO rental_subscriptions (id,checkout_id,expansion_id,player_id,customer_id,amount_cents,status,cancel_at_period_end,observed_at) VALUES (?,?,?,?,?,?,?,?,?)
   ON CONFLICT(id) DO UPDATE SET status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,observed_at=excluded.observed_at
   WHERE rental_subscriptions.checkout_id=excluded.checkout_id AND rental_subscriptions.observed_at<=excluded.observed_at`,
      )
      .bind(
        snapshot.id,
        snapshot.checkoutId,
        checkout.expansion_id,
        checkout.player_id,
        snapshot.customerId,
        snapshot.amountCents,
        snapshot.status,
        snapshot.cancelAtPeriodEnd ? 1 : 0,
        snapshot.observedAt,
      ),
    db
      .prepare(
        "UPDATE expansion_checkouts SET status='subscribed' WHERE id=? AND status IN ('creating','open')",
      )
      .bind(snapshot.checkoutId),
  ];
  if (snapshot.invoice) {
    const invoice = snapshot.invoice;
    if (
      !/^in_[a-zA-Z0-9]+$/.test(invoice.id) ||
      invoice.amountCents !== snapshot.amountCents ||
      !Number.isSafeInteger(invoice.from) ||
      !Number.isSafeInteger(invoice.until) ||
      invoice.from >= invoice.until
    )
      throw new Error("Periodo facturado no válido.");
    const old = await db
      .prepare("SELECT * FROM rental_invoices WHERE id=?")
      .bind(invoice.id)
      .first<Record<string, any>>();
    if (
      old &&
      (old.subscription_id !== snapshot.id ||
        old.amount_cents !== invoice.amountCents ||
        old.period_start !== invoice.from ||
        old.period_end !== invoice.until)
    )
      throw new Error("La factura ya tiene otro contenido.");
    statements.push(
      db
        .prepare(
          "INSERT OR IGNORE INTO rental_invoices (id,subscription_id,amount_cents,period_start,period_end,blocked,observed_at) VALUES (?,?,?,?,?,0,?)",
        )
        .bind(
          invoice.id,
          snapshot.id,
          invoice.amountCents,
          invoice.from,
          invoice.until,
          snapshot.observedAt,
        ),
    );
  }
  for (const invoiceId of snapshot.unblockedInvoiceIds ?? [])
    statements.push(
      db
        .prepare(
          "UPDATE rental_invoices SET blocked=0,observed_at=? WHERE id=? AND subscription_id=? AND observed_at<=?",
        )
        .bind(snapshot.observedAt, invoiceId, snapshot.id, snapshot.observedAt),
    );
  for (const invoiceId of snapshot.blockedInvoiceIds ?? [])
    statements.push(
      db
        .prepare(
          "UPDATE rental_invoices SET blocked=1,observed_at=? WHERE id=? AND subscription_id=? AND observed_at<=?",
        )
        .bind(snapshot.observedAt, invoiceId, snapshot.id, snapshot.observedAt),
    );
  statements.push(
    db
      .prepare(
        `UPDATE expansions SET paid_cents=COALESCE((SELECT SUM(s.amount_cents) FROM rental_subscriptions s WHERE s.expansion_id=expansions.id AND ${funded}),0) WHERE id=?`,
      )
      .bind(now, now, checkout.expansion_id),
    ...Array.from({ length: 4 }, (_, index) => {
      const slot = base + index,
        point = plotCoordinates(expansion.community_id, slot);
      return db
        .prepare(
          `INSERT OR IGNORE INTO plots (id,community_id,slot,x,z,rental_expansion_id) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM expansions WHERE id=? AND paid_cents=goal_cents)`,
        )
        .bind(
          `${expansion.community_id}:${slot}`,
          expansion.community_id,
          slot,
          point.x,
          point.z,
          expansion.id,
          expansion.id,
        );
    }),
    db
      .prepare(
        "UPDATE communities SET capacity=MAX(capacity,?) WHERE id=? AND EXISTS (SELECT 1 FROM expansions WHERE id=? AND paid_cents=goal_cents)",
      )
      .bind(base + 4, expansion.community_id, expansion.id),
    db
      .prepare(
        `UPDATE expansions SET status='applied',applied_at=COALESCE(applied_at,?),rent_paid_until=(SELECT MIN(covered_until) FROM
   (SELECT MAX(i.period_end) AS covered_until FROM rental_subscriptions s JOIN rental_invoices i ON i.subscription_id=s.id WHERE s.expansion_id=? AND i.blocked=0 AND i.period_start<=? AND i.period_end>? GROUP BY s.id))
   WHERE id=? AND paid_cents=goal_cents`,
      )
      .bind(now, expansion.id, now, now, expansion.id),
  );
  if (snapshot.blockedInvoiceIds?.length)
    statements.push(
      db
        .prepare(
          "UPDATE expansions SET rent_paid_until=MIN(rent_paid_until,?) WHERE id=? AND status='applied' AND paid_cents<goal_cents",
        )
        .bind(now, expansion.id),
    );
  await db.batch(statements);
  return db
    .prepare(
      "SELECT status,paid_cents,rent_paid_until FROM expansions WHERE id=?",
    )
    .bind(expansion.id)
    .first();
}
