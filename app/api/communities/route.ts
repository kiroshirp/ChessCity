import {
  ApiError,
  database,
  failure,
  findPlayer,
  json,
  requireOrigin,
  session,
} from "../../../lib/server";
import { foundCommunity, LandError } from "../../../lib/open-land";
import { boundedRequestText } from "../../../lib/stripe-protocol";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await session(request);
    if (!user)
      throw new ApiError("Vincula Lichess para fundar una comunidad.", 401);
    const text = await boundedRequestText(request, 1024);
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError("Petición no válida.");
    }
    if (typeof body?.name !== "string")
      throw new ApiError("Escribe el nombre de tu comunidad.");
    await foundCommunity(database(), user.player_id, body.name);
    return json({ player: await findPlayer(user.player_id) });
  } catch (e) {
    return failure(e instanceof LandError ? new ApiError(e.message, 409) : e);
  }
}
