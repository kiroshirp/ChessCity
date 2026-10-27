import { queueConstruction } from "../../../lib/city-events";
import {
  ApiError,
  database,
  session,
  requireOrigin,
  json,
  failure,
  findPlayer,
} from "../../../lib/server";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await session(request);
    if (!user)
      throw new ApiError("Vincula tu cuenta para elegir una parcela.", 401);
    const text = await request.text();
    if (text.length > 1024)
      throw new ApiError("Petición demasiado grande.", 413);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError("Petición no válida.");
    }
    if (
      !body ||
      typeof body.plotId !== "string" ||
      !/^(alameda|mirador|ribera|libre|abierta):\d{1,6}$/.test(body.plotId)
    )
      throw new ApiError("Parcela no válida.");
    const plot = await database()
      .prepare(
        "SELECT l.id FROM plots l LEFT JOIN expansions e ON e.id=l.rental_expansion_id WHERE l.id=? AND (l.rental_expansion_id IS NULL OR (e.status='applied' AND e.rent_paid_until>?))",
      )
      .bind(body.plotId, Date.now())
      .first();
    if (!plot)
      throw new ApiError("Esta parcela todavía no está desbloqueada.", 409);
    const previous = await findPlayer(user.player_id);
    const result = await database()
      .prepare(
        `UPDATE players SET plot_id=? WHERE id=? AND claimed=1
    AND EXISTS (SELECT 1 FROM plots l LEFT JOIN expansions e ON e.id=l.rental_expansion_id WHERE l.id=? AND (l.rental_expansion_id IS NULL OR (e.status='applied' AND e.rent_paid_until>?)))
    AND NOT EXISTS (SELECT 1 FROM players other WHERE other.plot_id=? AND other.id<>?)`,
      )
      .bind(
        body.plotId,
        user.player_id,
        body.plotId,
        Date.now(),
        body.plotId,
        user.player_id,
      )
      .run();
    if (!result.meta.changes)
      throw new ApiError(
        "Otro jugador ha ocupado esa parcela. Elige otra.",
        409,
      );
    const player = (await findPlayer(user.player_id))!;
    const event =
      previous?.plot?.id !== player.plot?.id
        ? await queueConstruction(database(), player, "construction")
        : null;
    return json({ player, event });
  } catch (error) {
    return failure(error);
  }
}
