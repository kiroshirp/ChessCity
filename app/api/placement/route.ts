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
      !/^(alameda|mirador|ribera):\d{1,2}$/.test(body.plotId)
    )
      throw new ApiError("Parcela no válida.");
    const plot = await database()
      .prepare("SELECT id FROM plots WHERE id=?")
      .bind(body.plotId)
      .first();
    if (!plot)
      throw new ApiError("Esta parcela todavía no está desbloqueada.", 409);
    const result = await database()
      .prepare(
        `UPDATE players SET plot_id=? WHERE id=? AND claimed=1
    AND NOT EXISTS (SELECT 1 FROM players other WHERE other.plot_id=? AND other.id<>?)`,
      )
      .bind(body.plotId, user.player_id, body.plotId, user.player_id)
      .run();
    if (!result.meta.changes)
      throw new ApiError(
        "Otro jugador ha ocupado esa parcela. Elige otra.",
        409,
      );
    return json({ player: await findPlayer(user.player_id) });
  } catch (error) {
    return failure(error);
  }
}
