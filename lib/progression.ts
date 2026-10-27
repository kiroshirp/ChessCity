import { MODES, type Profile } from "./model";

export const DAILY_GAME_CAP = 5;
export const XP_PER_GAME = 20;
export const BUILDING_STAGES = [
  { id: "cottage", name: "Casita", xp: 0, days: 0, height: 7 },
  { id: "house", name: "Casa ampliada", xp: 120, days: 3, height: 10 },
  { id: "duplex", name: "Casa de dos plantas", xp: 360, days: 7, height: 15 },
  { id: "block", name: "Bloque residencial", xp: 800, days: 14, height: 26 },
  { id: "tower", name: "Edificio emblemático", xp: 1800, days: 30, height: 44 },
] as const;
export interface BuildingProgress {
  xp: number;
  activeDays: number;
  ratedBaseline: number | null;
  day: string | null;
  dailyGames: number;
}

/** Arithmetic mean of available, established ratings. Never inserts zero for a missing mode. */
export function combinedRating(profile: Profile) {
  const modes = MODES.filter((mode) => {
    const value = profile.perfs[mode];
    return (
      value &&
      value.games > 0 &&
      !value.provisional &&
      Number.isFinite(value.rating)
    );
  });
  return {
    rating: modes.length
      ? Math.round(
          modes.reduce((sum, mode) => sum + profile.perfs[mode]!.rating, 0) /
            modes.length,
        )
      : null,
    modes,
  };
}

export function buildingStage(
  progress: Pick<BuildingProgress, "xp" | "activeDays">,
) {
  let index = 0;
  for (let i = 1; i < BUILDING_STAGES.length; i++)
    if (
      progress.xp >= BUILDING_STAGES[i].xp &&
      progress.activeDays >= BUILDING_STAGES[i].days
    )
      index = i;
  const stage = BUILDING_STAGES[index],
    next = BUILDING_STAGES[index + 1] ?? null;
  return {
    index,
    stage,
    next,
    fraction: next
      ? Math.min(1, progress.xp / next.xp, progress.activeDays / next.days)
      : 1,
  };
}

/** Snapshot-based rewards: activity is credited on sync day (UTC), not inferred historical dates. */
export function advanceProgress(
  previous: BuildingProgress,
  ratedGames: number,
  now: number,
): BuildingProgress {
  const total = Math.max(0, Math.floor(ratedGames));
  if (previous.ratedBaseline === null)
    return { ...previous, ratedBaseline: total };
  const day = new Date(now).toISOString().slice(0, 10);
  const sameDay = previous.day === day;
  const used = sameDay ? previous.dailyGames : 0;
  const newGames = Math.max(0, total - previous.ratedBaseline);
  const credited = Math.min(newGames, Math.max(0, DAILY_GAME_CAP - used));
  return {
    xp: previous.xp + credited * XP_PER_GAME,
    activeDays: previous.activeDays + (credited > 0 && !sameDay ? 1 : 0),
    ratedBaseline: Math.max(total, previous.ratedBaseline),
    day: credited > 0 ? day : previous.day,
    dailyGames: credited > 0 ? used + credited : previous.dailyGames,
  };
}
