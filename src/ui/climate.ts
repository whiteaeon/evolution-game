const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Compact climate readout for the survival HUD. The sim already simulates a
 * turning season every economy tick ({@link updateWorld}): `world.cold` (0..1,
 * the seasonal chill that drives exposure deaths — above 0.5 the sim can roll a
 * hard winter) and `world.abundance` (the multiplier the season + biome apply to
 * every forage/event food gain). The played world showed only the bare season
 * *name*, so the player could read "❄ Winter" but not how harsh that winter is
 * or how much it suppresses food output. This turns those two dormant numbers
 * into a legible read on the pressure of "now". Pure string assembly — no DOM,
 * no sim reads beyond its arguments — so the WorldScene HUD and its unit tests
 * share one source of truth.
 */
export function climateReadout(cold: number, abundance: number): string {
  const chill = Math.round(clamp01(cold) * 100);
  const harsh = cold > 0.5 ? " harsh" : ""; // mirrors the sim's hardWinter threshold
  return `🌡 ${chill}%${harsh} · 🌾 ×${abundance.toFixed(2)}`;
}
