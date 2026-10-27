import {
  NEIGHBORHOODS,
  MAX_COMMUNITY_SLOTS,
  plotCoordinates,
} from "./neighborhoods";

export const PUBLIC_LAND_BATCH = 256;
export const PUBLIC_LAND_RESERVE = 64;

// Fixed addresses outside the plaza and every possible community expansion.
// Adding another ring never changes an existing player's address.
export function publicPlotCoordinates(start: number, count: number) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(count) ||
    start < 0 ||
    count < 0 ||
    start + count > 100000
  )
    throw new Error("Rango de parcelas no válido.");
  const reserved = NEIGHBORHOODS.flatMap((community) =>
    Array.from({ length: MAX_COMMUNITY_SLOTS }, (_, slot) =>
      plotCoordinates(community.id, slot),
    ),
  );
  const result: { x: number; z: number }[] = [];
  let index = 0;
  for (let ring = 1; result.length < count; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      const edge =
        Math.abs(dx) === ring
          ? Array.from({ length: ring * 2 + 1 }, (_, i) => i - ring)
          : [-ring, ring];
      for (const dz of edge) {
        const x = dx * 16,
          z = dz * 16;
        if (
          Math.hypot(x, z) < 110 ||
          reserved.some((p) => Math.abs(p.x - x) < 15 && Math.abs(p.z - z) < 15)
        )
          continue;
        if (index++ >= start) result.push({ x, z });
        if (result.length === count) return result;
      }
    }
  }
  return result;
}

export async function ensurePublicLand(db: D1Database) {
  const state = await db
    .prepare(
      "SELECT COUNT(*) AS total,COALESCE(MAX(l.slot)+1,0) AS next,COUNT(p.id) AS occupied FROM plots l LEFT JOIN players p ON p.plot_id=l.id WHERE l.community_id='abierta'",
    )
    .first<{ total: number; next: number; occupied: number }>();
  if (state && state.total - state.occupied >= PUBLIC_LAND_RESERVE) return;
  const start = state?.next ?? 0;
  const coordinates = publicPlotCoordinates(start, PUBLIC_LAND_BATCH);
  const statements = [
    db.prepare(
      "INSERT OR IGNORE INTO communities (id,name,capacity) VALUES ('abierta','Ciudad abierta',0)",
    ),
  ];
  // Keep each statement below D1's parameter limit. Concurrent requests use the same IDs.
  for (let offset = 0; offset < coordinates.length; offset += 16) {
    const chunk = coordinates.slice(offset, offset + 16);
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO plots (id,community_id,slot,x,z) VALUES ${chunk.map(() => "(?,'abierta',?,?,?)").join(",")}`,
        )
        .bind(
          ...chunk.flatMap((point, i) => [
            `abierta:${start + offset + i}`,
            start + offset + i,
            point.x,
            point.z,
          ]),
        ),
    );
  }
  statements.push(
    db.prepare(
      "UPDATE communities SET capacity=(SELECT COUNT(*) FROM plots WHERE community_id='abierta') WHERE id='abierta'",
    ),
  );
  await db.batch(statements);
}
