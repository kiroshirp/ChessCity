import { buildingStage } from "./progression";
export const MODES = ["rapid", "blitz", "bullet", "classical"] as const;
export type Mode = (typeof MODES)[number];
export const BUILDING_COLORS = {
  jade: "#63d9bb",
  amber: "#efbc6b",
  violet: "#a39bdd",
  ice: "#82c8df",
};
export const ACCENTS = ["jade", "amber", "violet", "ice"] as const;
export const ROOFS = ["antenna", "crown", "garden"] as const;
export type Accent = (typeof ACCENTS)[number];
export type Roof = (typeof ROOFS)[number];

export interface Performance {
  rating: number;
  games: number;
  provisional: boolean;
}
export interface Profile {
  id: string;
  username: string;
  title: string | null;
  rated: number;
  total: number;
  wins: number;
  draws: number;
  losses: number;
  createdAt: number;
  seenAt: number | null;
  perfs: Partial<Record<Mode, Performance>>;
}
export interface Player {
  id: string;
  username: string;
  profile: Profile;
  xp: number;
  accent: Accent;
  roof: Roof;
  claimed: boolean;
  updatedAt: number;
  buildingXp?: number;
  activeDays?: number;
  progressStartedAt?: number | null;
  plot?: { id: string; communityId: string; x: number; z: number } | null;
  demo?: boolean;
}

const finite = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);
const count = (value: unknown) =>
  finite(value) ? Math.max(0, Math.floor(value as number)) : 0;

/** Store only the public fields the product actually uses. */
export function normalizeProfile(input: unknown): Profile {
  if (!input || typeof input !== "object")
    throw new Error("Perfil de Lichess no válido.");
  const data = input as Record<string, any>;
  if (
    typeof data.id !== "string" ||
    !/^[a-z0-9_-]{2,30}$/i.test(data.id) ||
    typeof data.username !== "string" ||
    data.disabled ||
    data.tosViolation ||
    data.title === "BOT"
  ) {
    throw new Error("Esta cuenta no está disponible para ChessCity.");
  }
  const perfs: Profile["perfs"] = {};
  for (const mode of MODES) {
    const perf = data.perfs?.[mode];
    if (perf && finite(perf.rating) && count(perf.games) > 0) {
      perfs[mode] = {
        rating: count(perf.rating),
        games: count(perf.games),
        provisional: perf.prov === true,
      };
    }
  }
  return {
    id: data.id.toLowerCase(),
    username: data.username.slice(0, 30),
    title: typeof data.title === "string" ? data.title.slice(0, 6) : null,
    rated: count(data.count?.rated),
    total: count(data.count?.all),
    wins: count(data.count?.win),
    draws: count(data.count?.draw),
    losses: count(data.count?.loss),
    createdAt: count(data.createdAt),
    seenAt: finite(data.seenAt) ? data.seenAt : null,
    perfs,
  };
}

/** Diminishing returns; rating never controls permanent height. No invented match results. */
export function experience(ratedGames: number) {
  return Math.floor(240 * Math.log2(1 + Math.max(0, ratedGames) / 20));
}
export function levelFor(xp: number) {
  return Math.min(30, 1 + Math.floor(Math.sqrt(Math.max(0, xp) / 18)));
}
export function xpForLevel(level: number) {
  return 18 * Math.max(0, level - 1) ** 2;
}
export function progressFor(player: Player) {
  const current = buildingStage({
    xp: player.buildingXp ?? 0,
    activeDays: player.activeDays ?? 0,
  });
  return {
    level: current.index + 1,
    name: current.stage.name,
    next: current.next?.xp ?? null,
    nextDays: current.next?.days ?? null,
    nextName: current.next?.name ?? null,
    fraction: current.fraction,
  };
}
export function unlockedRoofs(player: Player): Roof[] {
  const level = progressFor(player).level;
  return [
    "antenna",
    ...(level >= 2 ? ["garden"] : []),
    ...(level >= 4 ? ["crown"] : []),
  ] as Roof[];
}
export function identitySeed(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++)
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  return Math.abs(hash);
}
