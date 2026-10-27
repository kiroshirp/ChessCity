import type { Plot } from "./neighborhoods";

export const LAND_LIMIT = 2048;
export const LAND_STEP = 16;
export function snapSite(x: number, z: number) {
  return {
    x: Math.round(x / LAND_STEP) * LAND_STEP,
    z: Math.round(z / LAND_STEP) * LAND_STEP,
  };
}
export function validSite(x: unknown, z: unknown): x is number {
  return (
    typeof x === "number" &&
    typeof z === "number" &&
    Number.isInteger(x) &&
    Number.isInteger(z) &&
    x % LAND_STEP === 0 &&
    z % LAND_STEP === 0 &&
    Math.max(Math.abs(x), Math.abs(z)) <= LAND_LIMIT &&
    Math.max(Math.abs(x), Math.abs(z)) >= 48
  );
}
export function siteAvailable(x: number, z: number, plots: Plot[]) {
  return (
    validSite(x, z) &&
    !plots.some((p) => Math.abs(p.x - x) < 15 && Math.abs(p.z - z) < 15)
  );
}
export function sitePlot(x: number, z: number): Plot {
  return {
    id: `site:${x}:${z}`,
    communityId: "abierta",
    slot: 0,
    x,
    z,
    ownerId: null,
  };
}
export class LandError extends Error {}

// Vacant pre-generated public lots are historical records, not obstacles or visible plots.
const occupied = `(l.rental_expansion_id IS NOT NULL OR EXISTS (SELECT 1 FROM players o WHERE o.plot_id=l.id))`;

/** Creation and ownership happen in the same serialized D1 batch. */
export async function claimSite(
  db: D1Database,
  playerId: string,
  x: number,
  z: number,
) {
  if (!validSite(x, z))
    throw new LandError(
      "Elige un punto dentro del terreno y fuera de la plaza central.",
    );
  const id = sitePlot(x, z).id;
  const result = await db.batch([
    db.prepare(
      "INSERT OR IGNORE INTO communities (id,name,capacity) VALUES ('abierta','Ciudad abierta',0)",
    ),
    db
      .prepare(
        `INSERT OR IGNORE INTO plots (id,community_id,slot,x,z)
      SELECT ?,'abierta',COALESCE((SELECT MAX(slot)+1 FROM plots WHERE community_id='abierta'),0),?,?
      WHERE EXISTS (SELECT 1 FROM players WHERE id=? AND claimed=1)
      AND NOT EXISTS (SELECT 1 FROM communities WHERE founder_id=?)
      AND NOT EXISTS (SELECT 1 FROM plots l WHERE ${occupied} AND ABS(l.x-?)<15 AND ABS(l.z-?)<15)`,
      )
      .bind(id, x, z, playerId, playerId, x, z),
    db
      .prepare(
        `UPDATE players SET plot_id=? WHERE id=? AND claimed=1
      AND NOT EXISTS (SELECT 1 FROM communities WHERE founder_id=?)
      AND EXISTS (SELECT 1 FROM plots WHERE id=? AND community_id='abierta' AND rental_expansion_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM plots l WHERE l.id<>? AND ${occupied} AND ABS(l.x-?)<15 AND ABS(l.z-?)<15)
      AND NOT EXISTS (SELECT 1 FROM players WHERE plot_id=? AND id<>?)`,
      )
      .bind(id, playerId, playerId, id, id, x, z, id, playerId),
  ]);
  if (!result[2].meta.changes)
    throw new LandError(
      "Ese sitio está ocupado o reservado. Si has fundado una comunidad, su edificio mantiene la ubicación.",
    );
  return id;
}

/** A community starts at its founder's existing house; no vacant plots are generated. */
export async function foundCommunity(
  db: D1Database,
  playerId: string,
  name: string,
) {
  const clean = name.trim();
  if (clean.length < 3 || clean.length > 50 || /[\x00-\x1f\x7f]/.test(clean))
    throw new LandError("El nombre debe tener entre 3 y 50 caracteres.");
  const id = `club_${crypto.randomUUID().replaceAll("-", "")}`;
  const results = await db.batch([
    db
      .prepare(
        `INSERT INTO communities (id,name,capacity,founder_id,origin_x,origin_z)
      SELECT ?,?,1,p.id,l.x,l.z FROM players p JOIN plots l ON p.plot_id=l.id WHERE p.id=? AND p.claimed=1 AND l.rental_expansion_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM communities WHERE founder_id=p.id)
      AND NOT EXISTS (SELECT 1 FROM players other JOIN plots ol ON other.plot_id=ol.id WHERE ol.community_id=l.community_id AND other.id<>p.id AND l.community_id NOT IN ('abierta','libre'))
      AND NOT EXISTS (SELECT 1 FROM rental_subscriptions s JOIN expansions e ON e.id=s.expansion_id WHERE e.community_id=l.community_id)`,
      )
      .bind(id, clean, playerId),
    db
      .prepare(
        `UPDATE plots SET community_id=?,slot=0 WHERE id=(SELECT plot_id FROM players WHERE id=?) AND EXISTS (SELECT 1 FROM communities WHERE id=? AND founder_id=?)`,
      )
      .bind(id, playerId, id, playerId),
  ]);
  if (!results[0].meta.changes)
    throw new LandError(
      "Necesitas tu propia casa en terreno gratuito y no pertenecer ya a una comunidad compartida.",
    );
  return id;
}

export function expansionCandidates(x: number, z: number) {
  const points: { x: number; z: number }[] = [];
  for (let ring = 1; ring <= 8; ring++)
    for (let dx = -ring; dx <= ring; dx++)
      for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const p = { x: x + dx * 16, z: z + dz * 16 };
        if (
          Math.max(Math.abs(p.x), Math.abs(p.z)) <= LAND_LIMIT &&
          Math.max(Math.abs(p.x), Math.abs(p.z)) >= 48
        )
          points.push(p);
      }
  return points;
}

/** Reserve adjacent sites before offering payment, never over another house. */
export async function reserveCommunityExpansion(
  db: D1Database,
  community: {
    id: string;
    capacity: number;
    origin_x: number;
    origin_z: number;
  },
  now = Date.now(),
) {
  const id = `${community.id}:${community.capacity}`;
  const statements = [
    db
      .prepare(
        "INSERT OR IGNORE INTO expansions (id,community_id,added_slots,goal_cents,paid_cents,status,created_at) VALUES (?,?,4,100,0,'awaiting_payment',?)",
      )
      .bind(id, community.id, now),
  ];
  const values = JSON.stringify(
    expansionCandidates(community.origin_x, community.origin_z),
  );
  for (let i = 0; i < 4; i++)
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO plots (id,community_id,slot,x,z,rental_expansion_id)
    SELECT ?,?,?,json_extract(j.value,'$.x'),json_extract(j.value,'$.z'),? FROM json_each(?) j
    WHERE NOT EXISTS (SELECT 1 FROM plots l WHERE ${occupied} AND ABS(l.x-json_extract(j.value,'$.x'))<15 AND ABS(l.z-json_extract(j.value,'$.z'))<15)
    ORDER BY CAST(j.key AS INTEGER) LIMIT 1`,
        )
        .bind(
          `${community.id}:${community.capacity + i}`,
          community.id,
          community.capacity + i,
          id,
          values,
        ),
    );
  await db.batch(statements);
  const count = await db
    .prepare("SELECT COUNT(*) n FROM plots WHERE rental_expansion_id=?")
    .bind(id)
    .first<{ n: number }>();
  if (count?.n !== 4)
    throw new LandError(
      "No queda espacio contiguo para ampliar aquí. No se ha creado ningún cobro.",
    );
  return id;
}
