/**
 * Seeded, deterministic RNG (mulberry32). Pure and reproducible: the same seed
 * always yields the same stream, which is what makes the whole sim replayable
 * and unit-testable.
 */
export class RNG {
  private s: number;

  constructor(seed: number) {
    // Avoid a zero state (mulberry32 would get stuck-ish); coerce to uint32.
    this.s = (seed >>> 0) || 0x9e3779b9;
  }

  /** Snapshot the internal state for save/load. */
  getState(): number {
    return this.s;
  }

  /** Restore a snapshotted state so the stream resumes identically. */
  setState(s: number): void {
    this.s = s >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, maxInclusive]. */
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length - 1)];
  }

  /** Gaussian (Box–Muller). Used for mutation noise. */
  gauss(mean = 0, sd = 1): number {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}
