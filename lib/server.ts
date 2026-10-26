import { env } from "cloudflare:workers";
import { normalizeProfile, experience, type Player } from "./model";
import { advanceProgress } from "./progression";

export function database() {
  if (!env.DB) throw new Error("El almacenamiento aún no está disponible.");
  return env.DB;
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
export function json(
  data: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
}
export function failure(error: unknown) {
  const known = error instanceof ApiError;
  return json(
    {
      error: known
        ? error.message
        : "No se ha podido completar la operación. Inténtalo de nuevo.",
    },
    known ? error.status : 503,
    known && error.retryAfter
      ? { "Retry-After": String(error.retryAfter) }
      : {},
  );
}
export function cookie(request: Request, key: string) {
  return (
    request.headers
      .get("cookie")
      ?.split(";")
      .map((value) => value.trim())
      .find((value) => value.startsWith(key + "="))
      ?.slice(key.length + 1) ?? null
  );
}
export function cookieHeader(
  request: Request,
  name: string,
  value: string,
  maxAge: number,
) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}
export async function digest(value: string) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function randomToken() {
  return btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export async function session(request: Request) {
  const token = cookie(request, "chesscity_session");
  if (!token || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
  return database()
    .prepare("SELECT player_id FROM sessions WHERE hash = ? AND expires_at > ?")
    .bind(await digest(token), Date.now())
    .first<{ player_id: string }>();
}
export function requireOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    throw new ApiError("Origen no válido.", 403);
}

/** One global D1 lease prevents parallel requests across Worker instances. */
async function acquireLichessSlot() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const now = Date.now();
    const slot = await database()
      .prepare(
        `INSERT INTO limits (key, next_at) VALUES ('lichess', ?)
      ON CONFLICT(key) DO UPDATE SET next_at = excluded.next_at WHERE limits.next_at <= ? RETURNING next_at`,
      )
      .bind(now + 15000, now)
      .first();
    if (slot) return now + 15000;
    const current = await database()
      .prepare("SELECT next_at FROM limits WHERE key = 'lichess'")
      .first<{ next_at: number }>();
    const remaining = Math.max(1, (current?.next_at ?? now) - now);
    if (remaining > 1500 || attempt === 2)
      throw new ApiError(
        "Lichess está ocupado. Espera un momento antes de sincronizar.",
        429,
        Math.ceil(remaining / 1000),
      );
    await new Promise((resolve) => setTimeout(resolve, remaining));
  }
  throw new ApiError("La sincronización está ocupada.", 429, 15);
}
export async function lichess(path: string, init: RequestInit = {}) {
  const lease = await acquireLichessSlot();
  try {
    const response = await fetch("https://lichess.org" + path, {
      ...init,
      signal: AbortSignal.timeout(12000),
      headers: { Accept: "application/json", ...init.headers },
    });
    if (response.status === 429) {
      await database()
        .prepare("UPDATE limits SET next_at = ? WHERE key = 'lichess'")
        .bind(Date.now() + 60000)
        .run();
      throw new ApiError(
        "Lichess ha solicitado una pausa. Vuelve a intentarlo dentro de un minuto.",
        429,
        60,
      );
    }
    if (response.status === 404)
      throw new ApiError("No se ha encontrado ese jugador en Lichess.", 404);
    if (!response.ok)
      throw new ApiError(
        "Lichess no ha podido devolver los datos. Prueba más tarde.",
        502,
      );
    if (response.status === 204) return null;
    return await response.json();
  } finally {
    await database()
      .prepare(
        "UPDATE limits SET next_at = ? WHERE key = 'lichess' AND next_at = ?",
      )
      .bind(Date.now() + 1000, lease)
      .run();
  }
}
export function playerFromRow(row: Record<string, any>): Player {
  return {
    id: row.id,
    username: row.username,
    profile: JSON.parse(row.profile),
    xp: row.xp,
    accent: row.accent,
    roof: row.roof,
    claimed: Boolean(row.claimed),
    updatedAt: row.updated_at,
    buildingXp: row.building_xp ?? 0,
    activeDays: row.active_days ?? 0,
    progressStartedAt: row.progress_started_at ?? null,
    plot:
      row.plot_id && row.plot_x !== null
        ? {
            id: row.plot_id,
            communityId: row.community_id,
            x: row.plot_x,
            z: row.plot_z,
          }
        : null,
  };
}
export async function findPlayer(id: string) {
  const row = await database()
    .prepare(
      `SELECT p.*,l.x AS plot_x,l.z AS plot_z,l.community_id FROM players p
      LEFT JOIN plots l ON l.id=p.plot_id WHERE p.id = ?`,
    )
    .bind(id.toLowerCase())
    .first();
  return row ? playerFromRow(row) : null;
}
export async function saveProfile(raw: unknown, claimed = false) {
  let profile;
  try {
    profile = normalizeProfile(raw);
  } catch (error) {
    throw new ApiError((error as Error).message);
  }
  await database()
    .prepare(
      `INSERT OR IGNORE INTO players (id, username, profile, xp, updated_at, claimed)
    VALUES (?, ?, ?, ?, ?, 0)`,
    )
    .bind(
      profile.id,
      profile.username,
      JSON.stringify(profile),
      experience(profile.rated),
      Date.now(),
    )
    .run();
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await database()
      .prepare("SELECT * FROM players WHERE id=?")
      .bind(profile.id)
      .first<Record<string, any>>();
    if (!row) throw new ApiError("No se ha podido guardar el perfil.", 503);
    const now = Date.now();
    const active = Boolean(row.claimed) || claimed;
    const initial = {
      xp: row.building_xp ?? 0,
      activeDays: row.active_days ?? 0,
      ratedBaseline: row.rated_baseline ?? null,
      day: row.progress_day ?? null,
      dailyGames: row.daily_games ?? 0,
    };
    const progress = active
      ? advanceProgress(initial, profile.rated, now)
      : initial;
    const result = await database()
      .prepare(
        `UPDATE players SET username=?,profile=?,xp=MAX(xp,?),updated_at=?,
      claimed=MAX(claimed,?),building_xp=?,active_days=?,rated_baseline=?,progress_day=?,daily_games=?,progress_started_at=?
      WHERE id=? AND updated_at=? AND building_xp=? AND active_days=? AND rated_baseline IS ?`,
      )
      .bind(
        profile.username,
        JSON.stringify(profile),
        experience(profile.rated),
        now,
        claimed ? 1 : 0,
        progress.xp,
        progress.activeDays,
        progress.ratedBaseline,
        progress.day,
        progress.dailyGames,
        active ? (row.progress_started_at ?? now) : null,
        profile.id,
        row.updated_at,
        initial.xp,
        initial.activeDays,
        initial.ratedBaseline,
      )
      .run();
    if (result.meta.changes) break;
    if (attempt === 3)
      throw new ApiError(
        "El perfil se ha actualizado en otra petición. Vuelve a sincronizar.",
        409,
      );
  }
  return (await findPlayer(profile.id))!;
}
