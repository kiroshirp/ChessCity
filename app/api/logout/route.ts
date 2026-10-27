import {
  requireOrigin,
  database,
  digest,
  cookie,
  cookieHeader,
  json,
  failure,
} from "../../../lib/server";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const token = cookie(request, "chesscity_session");
    if (token)
      await database()
        .prepare("DELETE FROM sessions WHERE hash = ?")
        .bind(await digest(token))
        .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": cookieHeader(request, "chesscity_session", "", 0),
    });
  } catch (error) {
    return failure(error);
  }
}
