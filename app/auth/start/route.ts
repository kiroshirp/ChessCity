import {
  database,
  digest,
  randomToken,
  cookieHeader,
  failure,
} from "../../../lib/server";
export async function GET(request: Request) {
  try {
    const state = randomToken();
    const verifier = randomToken();
    const origin = new URL(request.url).origin;
    const redirectUri = origin + "/auth/lichess";
    const now = Date.now();
    await database().batch([
      database().prepare("DELETE FROM oauth WHERE expires_at < ?").bind(now),
      database().prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now),
      database()
        .prepare(
          "INSERT INTO oauth (hash, verifier, redirect_uri, expires_at) VALUES (?, ?, ?, ?)",
        )
        .bind(await digest(state), verifier, redirectUri, now + 10 * 60000),
    ]);
    const url = new URL("https://lichess.org/oauth");
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: "chesscity-topchess",
      redirect_uri: redirectUri,
      code_challenge_method: "S256",
      code_challenge: await digest(verifier),
      state,
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.toString(),
        "Cache-Control": "no-store",
        "Set-Cookie": cookieHeader(request, "chesscity_oauth", state, 600),
      },
    });
  } catch (error) {
    return failure(error);
  }
}
