/**
 * Minimal, dependency-free audio: a soft click for UI, a rising chime for
 * milestones, a gentle era-aware ambient pad, and a couple of SFX (birth,
 * discovery) — all synthesized with WebAudio. Off until the player enables it
 * (and until a user gesture exists, per browser autoplay rules).
 */

/** Live nodes of the ambient pad, kept so it can be retuned and stopped. */
interface Ambient {
  voices: OscillatorNode[];
  movers: OscillatorNode[];
  master: GainNode;
}

export class Audio {
  private ctx: AudioContext | null = null;
  enabled = false;
  private ambient: Ambient | null = null;
  private era = 0;

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
    if (this.enabled) {
      this.click();
      this.startAmbient();
    } else {
      this.stopAmbient();
    }
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

  /** Soft two-note rise marking a new birth. */
  birth(): void {
    this.tone(392, 0.18, 0.03, "sine");
    setTimeout(() => this.tone(523, 0.3, 0.03, "sine"), 90);
  }

  /** Bright little sparkle when the tribe discovers a technology. */
  discovery(): void {
    [659, 880, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 0.035, "triangle"), i * 70));
  }

  /** Root note of the pad: a gentle, consonant drift across the eras. */
  private rootFreq(): number {
    const base = 110; // A2, a warm low register
    const semis = [0, 2, 3, 5, 7, 8, 7, 5, 3];
    return base * Math.pow(2, (semis[this.era] ?? 0) / 12);
  }

  /**
   * Start a quiet, slowly evolving drone (root + fifth + octave) with two slow
   * LFOs breathing the volume and timbre. Only ever runs while sound is on.
   */
  private startAmbient(): void {
    const ctx = this.ensure();
    if (!ctx || this.ambient) return;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 600;
    filter.Q.value = 0.4;
    filter.connect(master).connect(ctx.destination);

    const root = this.rootFreq();
    const ratios = [1, 1.5, 2];
    const voices = ratios.map((mult, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? "sine" : "triangle";
      o.frequency.value = root * mult;
      o.detune.value = (i - 1) * 4; // slight spread for warmth
      const vg = ctx.createGain();
      vg.gain.value = 0.5 / ratios.length;
      o.connect(vg).connect(filter);
      o.start();
      return o;
    });

    // Slow breathing of overall volume.
    const breath = ctx.createOscillator();
    breath.frequency.value = 0.07;
    const breathGain = ctx.createGain();
    breathGain.gain.value = 0.012;
    breath.connect(breathGain).connect(master.gain);
    breath.start();

    // Slow timbral sweep of the filter cutoff.
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.05;
    const sweepGain = ctx.createGain();
    sweepGain.gain.value = 180;
    sweep.connect(sweepGain).connect(filter.frequency);
    sweep.start();

    const t = ctx.currentTime;
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(0.03, t + 3); // gentle fade-in

    this.ambient = { voices, movers: [breath, sweep], master };
  }

  private stopAmbient(): void {
    const a = this.ambient;
    const ctx = this.ctx;
    this.ambient = null;
    if (!a || !ctx) return;
    const t = ctx.currentTime;
    a.master.gain.cancelScheduledValues(t);
    a.master.gain.setValueAtTime(a.master.gain.value, t);
    a.master.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    const stopAt = t + 1.6;
    [...a.voices, ...a.movers].forEach((o) => {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    });
  }

  /** Shift the pad to the given era index; retunes live if the pad is playing. */
  setEra(eraIndex: number): void {
    const idx = Math.max(0, eraIndex);
    if (idx === this.era) return;
    this.era = idx;
    const a = this.ambient;
    const ctx = this.ctx;
    if (!a || !ctx) return;
    const root = this.rootFreq();
    const ratios = [1, 1.5, 2];
    a.voices.forEach((o, i) => {
      o.frequency.linearRampToValueAtTime(root * ratios[i], ctx.currentTime + 2);
    });
  }
}
