import { type Player } from "./model";
import { createLayout } from "./city-layout";

export interface CityEvent {
  id: string;
  playerId: string;
  kind: "construction" | "upgrade" | "demolition";
  createdAt: number;
  building: {
    x: number;
    z: number;
    width: number;
    depth: number;
    height: number;
    accent: Player["accent"];
    fromHeight?: number;
  };
}
export async function queueConstruction(
  db: D1Database,
  player: Player,
  kind: "construction" | "upgrade",
  fromHeight = 0,
) {
  if (!player.claimed || !player.plot) return;
  const building = createLayout([player], "rapid")[0];
  const event: CityEvent = {
    id: crypto.randomUUID(),
    playerId: player.id,
    kind,
    createdAt: Date.now(),
    building: {
      x: building.x,
      z: building.z,
      width: building.width,
      depth: building.depth,
      height: building.height,
      accent: player.accent,
      fromHeight,
    },
  };
  await db
    .prepare(
      "INSERT INTO city_events (id,player_id,kind,payload,created_at) VALUES (?,?,?,?,?)",
    )
    .bind(
      event.id,
      event.playerId,
      event.kind,
      JSON.stringify(event.building),
      event.createdAt,
    )
    .run();
  return event;
}

/** Server-owned expiry only. Never accepts an expiry date asserted by a browser. */
export async function demolishExpiredRentals(
  db: D1Database,
  now = Date.now(),
  verifiedExpansions?: Set<string>,
) {
  const rentals = await db
    .prepare(
      "SELECT id,rent_paid_until FROM expansions WHERE status='applied' AND rent_paid_until IS NOT NULL AND rent_paid_until<=?",
    )
    .bind(now)
    .all<{ id: string; rent_paid_until: number }>();
  for (const rental of rentals.results) {
    if (verifiedExpansions && !verifiedExpansions.has(rental.id)) continue;
    const rows = await db
      .prepare(
        `SELECT p.*,l.x AS plot_x,l.z AS plot_z,l.community_id FROM players p JOIN plots l ON p.plot_id=l.id WHERE l.rental_expansion_id=?`,
      )
      .bind(rental.id)
      .all<Record<string, any>>();
    const eligible =
      "EXISTS (SELECT 1 FROM expansions WHERE id=? AND status='applied' AND rent_paid_until IS NOT NULL AND rent_paid_until<=?)";

    const freePlot = `SELECT l.id FROM plots l WHERE l.rental_expansion_id IS NULL AND NOT EXISTS (SELECT 1 FROM players p WHERE p.plot_id=l.id)
       AND NOT EXISTS (SELECT 1 FROM plots other WHERE other.id<>l.id AND ABS(other.x-l.x)<15 AND ABS(other.z-l.z)<15 AND
         (other.rental_expansion_id IS NOT NULL OR EXISTS (SELECT 1 FROM players op WHERE op.plot_id=other.id))) ORDER BY l.community_id,l.slot LIMIT 1`;
    const statements: D1PreparedStatement[] = [];
    for (const row of rows.results) {
      const player: Player = {
        id: row.id,
        username: row.username,
        profile: JSON.parse(row.profile),
        xp: row.xp,
        accent: row.accent,
        roof: row.roof,
        claimed: !!row.claimed,
        updatedAt: row.updated_at,
        buildingXp: row.building_xp,
        activeDays: row.active_days,
        plot: {
          id: row.plot_id,
          communityId: row.community_id,
          x: row.plot_x,
          z: row.plot_z,
        },
      };
      const b = createLayout([player], "rapid")[0];
      const payload = JSON.stringify({
        x: b.x,
        z: b.z,
        width: b.width,
        depth: b.depth,
        height: b.height,
        accent: player.accent,
      });
      const prefix = `${rental.id}:${rental.rent_paid_until}:${player.id}`;
      statements.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO communities (id,name,capacity) SELECT 'libre','Zona libre',0 WHERE ${eligible} AND NOT EXISTS (${freePlot})`,
          )
          .bind(rental.id, now),
        db
          .prepare(
            `INSERT OR IGNORE INTO city_events (id,player_id,kind,payload,created_at) SELECT ?,?,'demolition',?,? WHERE ${eligible} AND EXISTS (SELECT 1 FROM players WHERE id=? AND plot_id=?)`,
          )
          .bind(
            prefix + ":demolition",
            player.id,
            payload,
            now,
            rental.id,
            now,
            player.id,
            row.plot_id,
          ),
        db
          .prepare(
            `INSERT INTO plots (id,community_id,slot,x,z)
             WITH RECURSIVE candidate(n) AS (SELECT COALESCE(MAX(slot)+1,0) FROM plots WHERE community_id='libre' UNION ALL SELECT n+1 FROM candidate WHERE n<65535)
             SELECT 'libre:'||n,'libre',n,-2048+(n%256)*16,-2048+(n/256)*16 FROM candidate
             WHERE ${eligible} AND EXISTS (SELECT 1 FROM players WHERE id=? AND plot_id=?) AND NOT EXISTS (${freePlot})
             AND MAX(ABS(-2048+(n%256)*16),ABS(-2048+(n/256)*16))>=48
             AND NOT EXISTS (SELECT 1 FROM plots other WHERE ABS(other.x-(-2048+(n%256)*16))<15 AND ABS(other.z-(-2048+(n/256)*16))<15 AND (other.rental_expansion_id IS NOT NULL OR EXISTS (SELECT 1 FROM players op WHERE op.plot_id=other.id))) LIMIT 1`,
          )
          .bind(rental.id, now, player.id, row.plot_id),
        db
          .prepare(
            `UPDATE players SET plot_id=(${freePlot}) WHERE id=? AND plot_id=? AND ${eligible}`,
          )
          .bind(player.id, row.plot_id, rental.id, now),
        db
          .prepare(
            `INSERT OR IGNORE INTO city_events (id,player_id,kind,payload,created_at) SELECT ?,?,'construction',json_set(?,'$.x',l.x,'$.z',l.z,'$.fromHeight',0),? FROM players p JOIN plots l ON p.plot_id=l.id WHERE p.id=? AND l.rental_expansion_id IS NULL AND EXISTS (SELECT 1 FROM city_events WHERE id=?)`,
          )
          .bind(
            prefix + ":construction",
            player.id,
            payload,
            now + 9000,
            player.id,
            prefix + ":demolition",
          ),
      );
    }
    statements.push(
      db.prepare(
        "UPDATE communities SET capacity=(SELECT COUNT(*) FROM plots WHERE community_id='libre') WHERE id='libre'",
      ),
      db
        .prepare(
          "UPDATE expansions SET status='awaiting_payment',rent_paid_until=NULL WHERE id=? AND status='applied' AND rent_paid_until<=?",
        )
        .bind(rental.id, now),
    );
    await db.batch(statements);
  }
}
