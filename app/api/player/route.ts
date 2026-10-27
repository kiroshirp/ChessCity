import {
  ApiError,
  json,
  failure,
  findPlayer,
  lichess,
  saveProfile,
} from "../../../lib/server";
export async function GET(request: Request) {
  try {
    const username = new URL(request.url).searchParams.get("username")?.trim();
    if (!username || !/^[a-z0-9_-]{2,30}$/i.test(username))
      throw new ApiError("Introduce un nombre de usuario de Lichess válido.");
    const cached = await findPlayer(username);
    if (cached && Date.now() - cached.updatedAt < 15 * 60000)
      return json({ player: cached, cached: true });
    const profile = await lichess("/api/user/" + encodeURIComponent(username));
    return json({ player: await saveProfile(profile), cached: false });
  } catch (error) {
    return failure(error);
  }
}
