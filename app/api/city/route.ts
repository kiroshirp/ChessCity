import { database, json, failure, playerFromRow } from "../../../lib/server";
export async function GET() {
  try {
    const rows = await database()
      .prepare(
        `SELECT p.*,l.x AS plot_x,l.z AS plot_z,l.community_id FROM players p
        JOIN plots l ON l.id=p.plot_id WHERE p.claimed=1 ORDER BY p.updated_at DESC LIMIT 250`,
      )
      .all();
    const total = await database()
      .prepare(
        "SELECT COUNT(*) AS total FROM players WHERE claimed=1 AND plot_id IS NOT NULL",
      )
      .first<{ total: number }>();
    const now = Date.now();
    const events = await database()
      .prepare(
        "SELECT id,player_id AS playerId,kind,payload,created_at AS createdAt FROM city_events WHERE created_at>? ORDER BY created_at DESC LIMIT 12",
      )
      .bind(now - 30000)
      .all<Record<string, any>>();
    return json({
      events: events.results.map(({ payload, ...event }) => ({
        ...event,
        building: JSON.parse(payload),
      })),
      players: rows.results.map(playerFromRow),
      total: total?.total ?? 0,
    });
  } catch (error) {
    return failure(error);
  }
}
