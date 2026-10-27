import { database, ApiError } from "./server";
import { stripeEnabled, stripeProductId } from "./stripe-server";
import { reserveCommunityExpansion, LandError } from "./open-land";
import {
  EXPANSION_PRICE_CENTS,
  EXPANSION_SLOTS,
  MAX_COMMUNITY_SLOTS,
} from "./neighborhoods";

export async function listNeighborhoods() {
  const now = Date.now();
  const [communities, plots, expansions] = await database().batch([
    database()
      .prepare(`SELECT c.id,c.name,c.founder_id AS founderId,c.origin_x AS x,c.origin_z AS z,
      SUM(CASE WHEN l.id IS NOT NULL AND ((l.rental_expansion_id IS NULL AND (p.id IS NOT NULL OR c.founder_id IS NULL)) OR EXISTS (SELECT 1 FROM expansions e WHERE e.id=l.rental_expansion_id AND e.status='applied' AND e.rent_paid_until>${now})) THEN 1 ELSE 0 END) AS capacity,COUNT(p.id) AS occupied
      FROM communities c LEFT JOIN plots l ON l.community_id=c.id LEFT JOIN players p ON p.plot_id=l.id
      WHERE c.id NOT IN ('abierta','libre') AND (c.founder_id IS NOT NULL OR EXISTS (SELECT 1 FROM expansions e JOIN rental_subscriptions s ON s.expansion_id=e.id WHERE e.community_id=c.id))
      GROUP BY c.id`),
    database()
      .prepare(`SELECT l.id,l.community_id AS communityId,l.slot,l.x,l.z,p.id AS ownerId,
      CASE WHEN l.rental_expansion_id IS NULL OR EXISTS (SELECT 1 FROM expansions e WHERE e.id=l.rental_expansion_id AND e.status='applied' AND e.rent_paid_until>${now}) THEN 1 ELSE 0 END AS available
      FROM plots l LEFT JOIN players p ON p.plot_id=l.id
      WHERE p.id IS NOT NULL OR l.rental_expansion_id IS NOT NULL ORDER BY l.community_id,l.slot`),
    database()
      .prepare(`SELECT id,community_id AS communityId,added_slots AS addedSlots,goal_cents AS goalCents,paid_cents AS paidCents,status,
      (SELECT COALESCE(SUM(amount_cents),0) FROM expansion_checkouts c WHERE c.expansion_id=expansions.id AND c.status IN ('creating','open')) AS reservedCents
      FROM expansions ORDER BY created_at DESC LIMIT 36`),
  ]);
  return {
    communities: communities.results,
    plots: plots.results,
    expansions: expansions.results,
    paymentsEnabled: stripeEnabled(),
    stripeProductId: stripeProductId(),
  };
}

export async function requestExpansion(playerId: string) {
  const member = await database()
    .prepare(
      `SELECT c.* FROM players p JOIN plots l ON p.plot_id=l.id JOIN communities c ON l.community_id=c.id WHERE p.id=?`,
    )
    .bind(playerId)
    .first<{
      id: string;
      capacity: number;
      origin_x: number | null;
      origin_z: number | null;
    }>();
  if (!member || ["abierta", "libre"].includes(member.id))
    throw new ApiError(
      "Primero funda una comunidad alrededor de tu edificio.",
      409,
    );
  const renewal = await database()
    .prepare(
      "SELECT id FROM expansions WHERE community_id=? AND status='awaiting_payment' ORDER BY created_at LIMIT 1",
    )
    .bind(member.id)
    .first<{ id: string }>();
  if (member.origin_x !== null && member.origin_z !== null) {
    const base = renewal ? Number(renewal.id.split(":")[1]) : member.capacity;
    if (base + EXPANSION_SLOTS > MAX_COMMUNITY_SLOTS)
      throw new ApiError(
        "Esta comunidad ha alcanzado el límite de esta versión.",
        409,
      );
    try {
      return await reserveCommunityExpansion(database(), {
        ...member,
        capacity: base,
        origin_x: member.origin_x,
        origin_z: member.origin_z,
      });
    } catch (e) {
      if (e instanceof LandError) throw new ApiError(e.message, 409);
      throw e;
    }
  }
  if (renewal) return renewal.id;
  if (member.capacity + EXPANSION_SLOTS > MAX_COMMUNITY_SLOTS)
    throw new ApiError(
      "Esta comunidad ha alcanzado el límite de esta versión.",
      409,
    );
  const id = `${member.id}:${member.capacity}`;
  await database()
    .prepare(
      "INSERT OR IGNORE INTO expansions (id,community_id,added_slots,goal_cents,paid_cents,status,created_at) VALUES (?,?,?,?,0,'awaiting_payment',?)",
    )
    .bind(id, member.id, EXPANSION_SLOTS, EXPANSION_PRICE_CENTS, Date.now())
    .run();
  return id;
}
