import { database, json, failure, playerFromRow } from "../../../lib/server";
export async function GET() {
  try {
    const rows = await database()
      .prepare(
        `SELECT p.*,l.x AS plot_x,l.z AS plot_z,l.community_id FROM players p
        LEFT JOIN plots l ON l.id=p.plot_id ORDER BY p.updated_at DESC LIMIT 250`,
      )
      .all();
    const total = await database()
      .prepare("SELECT COUNT(*) AS total FROM players")
      .first<{ total: number }>();
    return json({
      players: rows.results.map(playerFromRow),
      total: total?.total ?? 0,
    });
  } catch (error) {
    return failure(error);
  }
}
