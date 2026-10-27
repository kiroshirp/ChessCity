import {
  database,
  digest,
  randomToken,
  cookie,
  cookieHeader,
  lichess,
  saveProfile,
} from "../../../lib/server";
export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const fail = () =>
    new Response(null, {
      status: 302,
      headers: {
        Location: origin + "/?auth=failed",
        "Cache-Control": "no-store",
        "Set-Cookie": cookieHeader(request, "chesscity_oauth", "", 0),
      },
    });
  try {
    const params = new URL(request.url).searchParams;
    const state = params.get("state");
    const code = params.get("code");
    if (
      params.has("error") ||
      !state ||
      !/^[a-zA-Z0-9_-]{43}$/.test(state) ||
      state !== cookie(request, "chesscity_oauth") ||
      !code ||
      code.length > 2048
    )
      return fail();
    const pending = await database()
      .prepare(
        "DELETE FROM oauth WHERE hash = ? AND expires_at > ? RETURNING verifier, redirect_uri",
      )
      .bind(await digest(state), Date.now())
      .first<{ verifier: string; redirect_uri: string }>();
    if (!pending || pending.redirect_uri !== origin + "/auth/lichess")
      return fail();
    const token = (await lichess("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: pending.verifier,
        redirect_uri: pending.redirect_uri,
        client_id: "chesscity-topchess",
      }),
    })) as { access_token?: string };
    if (typeof token?.access_token !== "string") return fail();
    const raw = await lichess("/api/account", {
      headers: { Authorization: "Bearer " + token.access_token },
    });
    const player = await saveProfile(raw, true);
    // We keep our own scoped session, never the Lichess token. Revoke the short-lived use when possible.
    try {
      await lichess("/api/token", {
        method: "DELETE",
        headers: { Authorization: "Bearer " + token.access_token },
      });
    } catch {
      /* User can also revoke grants from Lichess. */
    }
    const sessionToken = randomToken();
    await database()
      .prepare(
        "INSERT INTO sessions (hash, player_id, expires_at) VALUES (?, ?, ?)",
      )
      .bind(await digest(sessionToken), player.id, Date.now() + 7 * 86400000)
      .run();
    const headers = new Headers({
      Location: origin + "/?welcome=1",
      "Cache-Control": "no-store",
    });
    headers.append(
      "Set-Cookie",
      cookieHeader(request, "chesscity_session", sessionToken, 7 * 86400),
    );
    headers.append(
      "Set-Cookie",
      cookieHeader(request, "chesscity_oauth", "", 0),
    );
    return new Response(null, { status: 302, headers });
  } catch {
    return fail();
  }
}
