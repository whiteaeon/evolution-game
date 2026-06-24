/**
 * Minimal, dependency-free audio: a soft click for UI and a rising chime for
 * milestones, synthesized with WebAudio. Off until the player enables it (and
 * until a user gesture exists, per browser autoplay rules).
 */
export class Audio {
  private ctx: AudioContext | null = null;
  enabled = false;

  private ensure(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    if (this.enabled) this.click();
    return this.enabled;
  }

  private tone(freq: number, dur: number, gain = 0.05, type: OscillatorType = "sine"): void {
    const ctx = this.ensure();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g).connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.start(t);
    osc.stop(t + dur);
  }

  click(): void {
    this.tone(440, 0.06, 0.03, "triangle");
  }

  chime(): void {
    [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 0.05), i * 110));
  }

  knell(): void {
    this.tone(140, 0.8, 0.06, "sawtooth");
  }
}
