import { ACCENTS, ROOFS, unlockedRoofs } from "../../../lib/model";
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
      throw new ApiError(
        "Vincula tu cuenta para personalizar tu edificio.",
        401,
      );
    const text = await request.text();
    if (text.length > 1000)
      throw new ApiError("Petición demasiado grande.", 413);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError("Petición no válida.");
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new ApiError("Petición no válida.");
    const player = await findPlayer(user.player_id);
    if (
      !player ||
      !ACCENTS.includes(data.accent) ||
      !ROOFS.includes(data.roof) ||
      !unlockedRoofs(player).includes(data.roof)
    ) {
      throw new ApiError("Esa personalización todavía no está disponible.");
    }
    await database()
      .prepare("UPDATE players SET accent = ?, roof = ? WHERE id = ?")
      .bind(data.accent, data.roof, user.player_id)
      .run();
    return json({ player: await findPlayer(user.player_id) });
  } catch (error) {
    return failure(error);
  }
}
