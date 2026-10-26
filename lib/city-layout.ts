// SPDX-License-Identifier: AGPL-3.0-only
// Identity hashing follows srizzon/git-city city-layout-core.ts (d09d505).
import { identitySeed, type Player, type Mode } from "./model";
import { buildingStage } from "./progression";
import { NEIGHBORHOODS } from "./neighborhoods";

export interface CityBuilding {
  player: Player;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  band: number;
}

export function createLayout(
  players: Player[],
  mode: Mode,
  now = Date.now(),
): CityBuilding[] {
  // Sort by ID, not skill. Existing players retain their relative order across rating changes.
  const ordered = [...players].sort((a, b) => a.id.localeCompare(b.id));
  const lots: [number, number][] = [];
  for (let radius = 1; lots.length < ordered.length; radius++) {
    for (let z = -radius; z <= radius; z++)
      for (let x = -radius; x <= radius; x++) {
        if (
          Math.max(Math.abs(x), Math.abs(z)) !== radius ||
          (Math.abs(x) <= 1 && Math.abs(z) <= 1)
        )
          continue;
        if (
          NEIGHBORHOODS.some(
            (community) =>
              x * 16 >= community.x - 36 &&
              x * 16 <= community.x + 108 &&
              z * 16 >= community.z - 36 &&
              z * 16 <= community.z + 108,
          )
        )
          continue;
        lots.push([x, z]);
      }
  }
  return ordered.map((player, index) => {
    const seed = identitySeed(player.id);
    const seen = player.profile.seenAt;
    const days = seen ? Math.max(0, (now - seen) / 86400000) : 100;
    return {
      player,
      x: player.plot?.x ?? lots[index][0] * 16,
      z: player.plot?.z ?? lots[index][1] * 16,
      width:
        6 +
        buildingStage({
          xp: player.buildingXp ?? 0,
          activeDays: player.activeDays ?? 0,
        }).index +
        (seed % 2),
      depth:
        6 +
        buildingStage({
          xp: player.buildingXp ?? 0,
          activeDays: player.activeDays ?? 0,
        }).index +
        ((seed >>> 3) % 2),
      height: buildingStage({
        xp: player.buildingXp ?? 0,
        activeDays: player.activeDays ?? 0,
      }).stage.height,
      band: days < 1 ? 5 : days < 7 ? 4 : days < 30 ? 2 : 0,
    };
  });
}

export function demoPlayers(): Player[] {
  // These are scenic miniatures, explicitly labelled in the UI, not imported accounts.
  return Array.from({ length: 80 }, (_, index) => ({
    id: `demo:${String(index + 1).padStart(3, "0")}`,
    username: `Maqueta ${index + 1}`,
    demo: true,
    profile: {
      id: `sample-${index}`,
      username: `Maqueta ${index + 1}`,
      title: null,
      rated: 0,
      total: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      createdAt: 0,
      seenAt: Date.now() - (index % 10) * 86400000,
      perfs: {},
    },
    xp: 180 + (identitySeed(String(index * 7)) % 2200),
    buildingXp: [0, 150, 400, 900, 2000][index % 5],
    activeDays: [0, 3, 7, 14, 30][index % 5],
    accent: ["jade", "amber", "violet", "ice"][index % 4] as Player["accent"],
    roof: "antenna",
    claimed: false,
    updatedAt: 0,
  }));
}
