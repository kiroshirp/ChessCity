import { database, ApiError } from "./server";
import {
  NEIGHBORHOODS,
  plotCoordinates,
  EXPANSION_PRICE_CENTS,
  EXPANSION_SLOTS,
  MAX_COMMUNITY_SLOTS,
} from "./neighborhoods";

export async function ensureNeighborhoods() {
  const count = await database()
    .prepare("SELECT COUNT(*) AS count FROM communities")
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
      .prepare(`SELECT c.id,c.name,c.capacity,COUNT(p.id) AS occupied FROM communities c
      LEFT JOIN plots l ON l.community_id=c.id LEFT JOIN players p ON p.plot_id=l.id GROUP BY c.id`),
    database()
      .prepare(`SELECT l.id,l.community_id AS communityId,l.slot,l.x,l.z,p.id AS ownerId
      FROM plots l LEFT JOIN players p ON p.plot_id=l.id ORDER BY l.community_id,l.slot`),
    database()
      .prepare(`SELECT id,community_id AS communityId,added_slots AS addedSlots,goal_cents AS goalCents,
      paid_cents AS paidCents,status FROM expansions ORDER BY created_at DESC LIMIT 12`),
  ]);
  return {
    communities: communities.results,
    plots: plots.results,
    expansions: expansions.results,
    paymentsEnabled: false,
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
