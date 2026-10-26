import { requireOrigin, json, failure } from "../../../lib/server";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    return json(
      {
        error:
          "Los cobros reales aún no están activados. No se ha realizado ningún cargo.",
      },
      503,
    );
  } catch (error) {
    return failure(error);
  }
}
