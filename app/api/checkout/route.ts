import {
  requireOrigin,
  json,
  failure,
  session,
  ApiError,
} from "../../../lib/server";
import { boundedRequestText } from "../../../lib/stripe-protocol";
import { createContribution, stripeEnabled } from "../../../lib/stripe-server";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    if (!stripeEnabled())
      throw new ApiError(
        "Los cobros aún no están activados. No se ha realizado ningún cargo.",
        503,
      );
    const user = await session(request);
    if (!user) throw new ApiError("Vincula tu cuenta para aportar.", 401);
    let text;
    try {
      text = await boundedRequestText(request, 1024);
    } catch {
      throw new ApiError("Petición demasiado grande.", 413);
    }
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiError("Petición no válida.");
    }
    if (
      !body ||
      typeof body.expansionId !== "string" ||
      !/^(alameda|mirador|ribera|club_[a-f0-9]{32}):\d{1,2}$/.test(
        body.expansionId,
      )
    )
      throw new ApiError("Solicitud no válida.");
    if (body.amountCents !== 50 && body.amountCents !== 100)
      throw new ApiError("La aportación debe ser de 0,50 € o 1 €.");
    return json(
      await createContribution(
        user.player_id,
        body.expansionId,
        body.amountCents,
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
