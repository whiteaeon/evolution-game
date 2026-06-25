/**
 * Surface the sim's dormant epidemics model into a readout the player can act on.
 * {@link Simulation.epidemicSeverity} is a pure, bounded gauge of how vulnerable
 * the tribe is to a disease outbreak right now — it climbs with crowding (so the
 * player's huts, which raise carrying capacity and thin the crowd, push it down),
 * with the biome and era, and falls with medical tech (medicine → sanitation →
 * vaccines). This maps that raw severity onto a compact, colour-banded label for
 * the survival HUD. Pure: no Phaser, no sim, no mutation.
 */

/** Severity ceiling — mirrors BALANCE.epidemicMaxSeverity, the hard cap on severity. */
const MAX_SEVERITY = 0.7;

export interface OutbreakRisk {
  /** Qualitative band shown to the player. */
  label: string;
  /** Severity as a 0–100 reading (severity normalised against the model's cap). */
  pct: number;
}

/**
 * Band a raw epidemic severity (0 … {@link MAX_SEVERITY}) into a player-facing
 * gauge. `pct` is the severity as a share of the model's ceiling, so a fully
 * mitigated tribe reads ~0 and the worst possible outbreak reads ~100.
 */
export function outbreakRisk(severity: number): OutbreakRisk {
  const sev = severity < 0 ? 0 : severity > MAX_SEVERITY ? MAX_SEVERITY : severity;
  const pct = Math.round((sev / MAX_SEVERITY) * 100);
  const label = pct < 15 ? "Low" : pct < 40 ? "Moderate" : pct < 70 ? "High" : "Severe";
  return { label, pct };
}
