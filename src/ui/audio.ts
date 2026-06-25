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
  /** Output bus for the generative melodic bed (plucked notes mix here). */
  music: GainNode;
  /** Pending handle for the next scheduled note step, so it can be cancelled. */
  timer: ReturnType<typeof setTimeout> | null;
}

/** Era-specific musical character of the generative bed. */
export interface EraMusic {
  /** Scale degrees (semitones above the root) the melody may pick from — the mode. */
  scale: number[];
  /** Voice timbre, brightening across the eras. */
  wave: OscillatorType;
  /** How many melodic lines may sound per step — texture fullness. */
  voices: number;
  /** Average seconds between note steps — smaller is denser. */
  step: number;
}

/**
 * Per-era mode and instrumentation: Paleolithic is a sparse, dark minor drone
 * on a single soft voice; the texture fills out and brightens era by era toward
 * a denser, fuller Information-Age figure. Indexed by {@link ERAS} position.
 */
const ERA_MUSIC: readonly EraMusic[] = [
  { scale: [0, 3, 7, 10], wave: "sine", voices: 1, step: 3.4 }, // Paleolithic
  { scale: [0, 3, 5, 7, 10], wave: "sine", voices: 1, step: 3.0 }, // Neolithic
  { scale: [0, 2, 3, 5, 7, 10], wave: "triangle", voices: 1, step: 2.6 }, // Bronze Age
  { scale: [0, 2, 3, 5, 7, 8, 10], wave: "triangle", voices: 2, step: 2.3 }, // Iron Age
  { scale: [0, 2, 4, 5, 7, 9, 11], wave: "triangle", voices: 2, step: 2.0 }, // Classical
  { scale: [0, 2, 4, 5, 7, 9, 10], wave: "square", voices: 2, step: 1.8 }, // Medieval
  { scale: [0, 2, 4, 7, 9], wave: "square", voices: 3, step: 1.5 }, // Industrial
  { scale: [0, 2, 4, 6, 7, 9, 11], wave: "sawtooth", voices: 3, step: 1.3 }, // Modern
  { scale: [0, 2, 4, 7, 9, 11, 14], wave: "sawtooth", voices: 4, step: 1.1 }, // Information
];

/** Mode and instrumentation for the given era index, clamped into range. */
export function eraMusic(eraIndex: number): EraMusic {
  const i = Math.max(0, Math.min(ERA_MUSIC.length - 1, Math.floor(eraIndex)));
  return ERA_MUSIC[i];
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

    // Output bus for the generative melodic bed, softened by its own lowpass so
    // brighter later-era waves stay gentle. Per-note gains are small; this bus
    // sits near unity and just fades the whole layer in and out.
    const musicFilter = ctx.createBiquadFilter();
    musicFilter.type = "lowpass";
    musicFilter.frequency.value = 2000;
    const music = ctx.createGain();
    music.gain.value = 0.0001;
    musicFilter.connect(music).connect(ctx.destination);

    const t = ctx.currentTime;
    master.gain.setValueAtTime(0.0001, t);
    master.gain.linearRampToValueAtTime(0.03, t + 3); // gentle fade-in
    music.gain.setValueAtTime(0.0001, t);
    music.gain.linearRampToValueAtTime(0.9, t + 4);

    this.ambient = { voices, movers: [breath, sweep], master, music, timer: null };
    this.musicDest = musicFilter;
    this.scheduleNotes();
  }

  /** Lowpass feeding the music bus; plucked notes connect here while playing. */
  private musicDest: BiquadFilterNode | null = null;

  /**
   * Generative loop: each step, sound a few notes drawn at random from the
   * current era's scale, then schedule the next step. Reads {@link era} live, so
   * the mode and instrumentation shift the moment the tribe advances an era.
   */
  private scheduleNotes = (): void => {
    const a = this.ambient;
    const ctx = this.ctx;
    const dest = this.musicDest;
    if (!a || !ctx || !dest) return;
    const m = eraMusic(this.era);
    const root = this.rootFreq() * 2; // melody sits an octave above the drone
    for (let v = 0; v < m.voices; v++) {
      if (Math.random() < (v === 0 ? 0.85 : 0.5)) {
        const degree = m.scale[Math.floor(Math.random() * m.scale.length)];
        const octave = v > 0 && Math.random() < 0.5 ? 12 : 0;
        this.pluck(root * Math.pow(2, (degree + octave) / 12), m.wave, dest);
      }
    }
    const wait = m.step * 1000 * (0.85 + Math.random() * 0.3);
    a.timer = setTimeout(this.scheduleNotes, wait);
  };

  /** One soft plucked note with a gentle attack and a long decay. */
  private pluck(freq: number, wave: OscillatorType, dest: AudioNode): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    osc.connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 1.7);
  }

  private stopAmbient(): void {
    const a = this.ambient;
    const ctx = this.ctx;
    this.ambient = null;
    this.musicDest = null;
    if (a?.timer) clearTimeout(a.timer);
    if (!a || !ctx) return;
    const t = ctx.currentTime;
    a.master.gain.cancelScheduledValues(t);
    a.master.gain.setValueAtTime(a.master.gain.value, t);
    a.master.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    a.music.gain.cancelScheduledValues(t);
    a.music.gain.setValueAtTime(a.music.gain.value, t);
    a.music.gain.linearRampToValueAtTime(0.0001, t + 1.5);
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
