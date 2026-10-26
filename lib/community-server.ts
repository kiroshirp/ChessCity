import { database, ApiError } from "./server";
import { stripeEnabled } from "./stripe-server";
import {
  NEIGHBORHOODS,
  plotCoordinates,
  EXPANSION_PRICE_CENTS,
  EXPANSION_SLOTS,
  STRIPE_PRODUCT_ID,
  MAX_COMMUNITY_SLOTS,
} from "./neighborhoods";

export async function ensureNeighborhoods() {
  const count = await database()
    .prepare(
      "SELECT COUNT(*) AS count FROM communities WHERE id IN ('alameda','mirador','ribera')",
    )
    .first<{ count: number }>();
  if (count?.count === NEIGHBORHOODS.length) return;
  const statements = NEIGHBORHOODS.flatMap((community) => [
    database()
      .prepare(
        "INSERT OR IGNORE INTO communities (id,name,capacity) VALUES (?,?,16)",
      )
      .bind(community.id, community.name),
    ...Array.from({ length: 16 }, (_, slot) => {
      const point = plotCoordinates(community.id, slot);
      return database()
        .prepare(
          "INSERT OR IGNORE INTO plots (id,community_id,slot,x,z) VALUES (?,?,?,?,?)",
        )
        .bind(`${community.id}:${slot}`, community.id, slot, point.x, point.z);
    }),
  ]);
  await database().batch(statements);
}

export async function listNeighborhoods() {
  await ensureNeighborhoods();
  const [communities, plots, expansions] = await database().batch([
    database()
      .prepare(`SELECT c.id,c.name,SUM(CASE WHEN l.rental_expansion_id IS NULL OR EXISTS (SELECT 1 FROM expansions e WHERE e.id=l.rental_expansion_id AND e.status='applied' AND e.rent_paid_until>${Date.now()}) THEN 1 ELSE 0 END) AS capacity,COUNT(p.id) AS occupied FROM communities c
      LEFT JOIN plots l ON l.community_id=c.id LEFT JOIN players p ON p.plot_id=l.id GROUP BY c.id`),
    database()
      .prepare(`SELECT l.id,l.community_id AS communityId,l.slot,l.x,l.z,p.id AS ownerId, CASE WHEN l.rental_expansion_id IS NULL OR EXISTS (SELECT 1 FROM expansions e WHERE e.id=l.rental_expansion_id AND e.status='applied' AND e.rent_paid_until>${Date.now()}) THEN 1 ELSE 0 END AS available
      FROM plots l LEFT JOIN players p ON p.plot_id=l.id ORDER BY l.community_id,l.slot`),
    database()
      .prepare(`SELECT id,community_id AS communityId,added_slots AS addedSlots,goal_cents AS goalCents,
      paid_cents AS paidCents,status,
      (SELECT COALESCE(SUM(amount_cents),0) FROM expansion_checkouts c WHERE c.expansion_id=expansions.id AND c.status IN ('creating','open')) AS reservedCents
      FROM expansions ORDER BY created_at DESC LIMIT 36`),
  ]);
  return {
    communities: communities.results,
    plots: plots.results,
    expansions: expansions.results,
    paymentsEnabled: stripeEnabled(),
    stripeProductId: STRIPE_PRODUCT_ID,
  };
}

export async function requestExpansion(playerId: string) {
  await ensureNeighborhoods();
  const member = await database()
    .prepare(
      `SELECT c.id,c.capacity FROM players p JOIN plots l ON p.plot_id=l.id
    JOIN communities c ON l.community_id=c.id WHERE p.id=?`,
    )
    .bind(playerId)
    .first<{ id: string; capacity: number }>();
  if (!member)
    throw new ApiError(
      "Primero elige una parcela para pertenecer a una comunidad.",
      409,
    );
  if (member.id === "libre")
    throw new ApiError(
      "La zona libre no admite alquileres de ampliación.",
      409,
    );
  const renewal = await database()
    .prepare(
      "SELECT id FROM expansions WHERE community_id=? AND status='awaiting_payment' ORDER BY created_at LIMIT 1",
    )
    .bind(member.id)
    .first<{ id: string }>();
  if (renewal) return renewal.id;
  if (member.capacity >= MAX_COMMUNITY_SLOTS)
    throw new ApiError(
      "Esta comunidad ha alcanzado el límite de esta versión.",
      409,
    );
  // Deterministic ID means concurrent requests for the same tier create only one campaign.
  const id = `${member.id}:${member.capacity}`;
  await database()
    .prepare(
      `INSERT OR IGNORE INTO expansions (id,community_id,added_slots,goal_cents,paid_cents,status,created_at)
    VALUES (?,?,?,?,0,'awaiting_payment',?)`,
    )
    .bind(id, member.id, EXPANSION_SLOTS, EXPANSION_PRICE_CENTS, Date.now())
    .run();
  return id;
}
