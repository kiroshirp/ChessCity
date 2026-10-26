import { session, findPlayer, json, failure } from "../../../lib/server";
export async function GET(request: Request) {
  try {
    const user = await session(request);
    return json({ player: user ? await findPlayer(user.player_id) : null });
  } catch (error) {
    return failure(error);
  }
}
