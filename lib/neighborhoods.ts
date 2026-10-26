export const EXPANSION_PRICE_CENTS = 100;
export const EXPANSION_SLOTS = 16;
export const MAX_COMMUNITY_SLOTS = 64;
export const PAYMENTS_ENABLED = false;
export const NEIGHBORHOODS = [
  {
    id: "alameda",
    name: "Alameda",
    description: "Una comunidad entre jardines.",
    x: -88,
    z: -80,
    color: "#84e4bd",
  },
  {
    id: "mirador",
    name: "El Mirador",
    description: "Una urbanización con horizonte propio.",
    x: 88,
    z: -80,
    color: "#d6b987",
  },
  {
    id: "ribera",
    name: "La Ribera",
    description: "Una plaza para compartir el camino.",
    x: 0,
    z: 104,
    color: "#82c8df",
  },
] as const;
export interface Plot {
  id: string;
  communityId: string;
  slot: number;
  x: number;
  z: number;
  ownerId: string | null;
}
export interface Community {
  id: string;
  name: string;
  capacity: number;
  occupied: number;
}
export interface Expansion {
  id: string;
  communityId: string;
  addedSlots: number;
  goalCents: number;
  paidCents: number;
  status: string;
}
export function plotCoordinates(communityId: string, slot: number) {
  const community = NEIGHBORHOODS.find((item) => item.id === communityId);
  if (
    !community ||
    !Number.isInteger(slot) ||
    slot < 0 ||
    slot >= MAX_COMMUNITY_SLOTS
  )
    throw new Error("Parcela no válida.");
  const sector = Math.floor(slot / 16),
    local = slot % 16;
  return {
    x: community.x + ((local % 4) - 1.5) * 16 + (sector % 2) * 72,
    z:
      community.z +
      (Math.floor(local / 4) - 1.5) * 16 +
      Math.floor(sector / 2) * 72,
  };
}
export function previewPlots(
  communities: Community[],
  occupied: Record<string, string> = {},
): Plot[] {
  return communities.flatMap((community) =>
    Array.from({ length: community.capacity }, (_, slot) => {
      const id = `${community.id}:${slot}`;
      return {
        id,
        communityId: community.id,
        slot,
        ...plotCoordinates(community.id, slot),
        ownerId: occupied[id] ?? null,
      };
    }),
  );
}
