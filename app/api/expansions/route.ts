import { requestExpansion } from "../../../lib/community-server";
import {
  ApiError,
  session,
  requireOrigin,
  json,
  failure,
} from "../../../lib/server";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await session(request);
    if (!user)
      throw new ApiError(
        "Vincula tu cuenta para solicitar una ampliación.",
        401,
      );
    return json({
      id: await requestExpansion(user.player_id),
      paymentsEnabled: false,
    });
  } catch (error) {
    return failure(error);
  }
}
