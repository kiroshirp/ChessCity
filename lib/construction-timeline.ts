export const ANIMATION_DURATION = 9000;
export function constructionTimeline(
  kind: "construction" | "upgrade" | "demolition",
  elapsed: number,
  reducedMotion = false,
) {
  const t = Math.max(0, Math.min(1, elapsed / ANIMATION_DURATION));
  if (reducedMotion)
    return {
      done: true,
      progress: kind === "demolition" ? 0 : 1,
      swing: 0,
      dust: 0,
    };
  const progress =
    kind === "demolition"
      ? 1 - Math.max(0, Math.min(1, (t - 0.38) / 0.47))
      : Math.max(0, Math.min(1, (t - 0.12) / 0.72));
  return {
    done: t >= 1,
    progress,
    swing: Math.sin(t * Math.PI * 4),
    dust:
      kind === "demolition"
        ? Math.sin(Math.max(0, Math.min(1, (t - 0.34) / 0.6)) * Math.PI)
        : 0,
  };
}
