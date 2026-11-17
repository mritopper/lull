/**
 * Procedural soundscape (Web Audio): a warm ambient pad, glassy chimes for
 * each jar, and a soft breath swell. No audio files needed.
 */
export class LullAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private padGain: GainNode | null = null;
  private breathGain: GainNode | null = null;
  private breathFilter: BiquadFilterNode | null = null;

  /** Must be called from a user gesture (button click / XR launch). */
  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 3);
    this.master = master;

    // Ambient pad: detuned triads through a slow low-pass.
    const pad = ctx.createGain();
    pad.gain.value = 0.06;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.Q.value = 0.4;
    pad.connect(lp).connect(master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 350;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start();
    for (const f of [110, 164.81, 220, 277.18, 329.63]) {
      for (const detune of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f;
        o.detune.value = detune;
        o.connect(pad);
        o.start();
      }
    }
    this.padGain = pad;

    // Breath: pink-ish noise through a band-pass, gain driven per frame.
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = 0.97 * last + 0.03 * (Math.random() * 2 - 1);
      data[i] = last * 6;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 500;
    bp.Q.value = 0.7;
    const bg = ctx.createGain();
    bg.gain.value = 0;
    noise.connect(bp).connect(bg).connect(master);
    noise.start();
    this.breathGain = bg;
    this.breathFilter = bp;
  }

  /** 0..1 inhale amount; drives the breath swell. */
  setBreath(amount: number, active: boolean): void {
    if (!this.ctx || !this.breathGain || !this.breathFilter) return;
    const t = this.ctx.currentTime;
    this.breathGain.gain.setTargetAtTime(active ? 0.05 + amount * 0.12 : 0, t, 0.15);
    this.breathFilter.frequency.setTargetAtTime(350 + amount * 700, t, 0.2);
  }

  /** Lower the pad as the room dims, so the end of the ritual feels quieter. */
  setCalm(amount: number): void {
    if (!this.ctx || !this.padGain) return;
    this.padGain.gain.setTargetAtTime(0.06 * (1 - amount * 0.55), this.ctx.currentTime, 0.5);
  }

  chime(note: number, volume = 0.18): void {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const f = 440 * Math.pow(2, (note - 69) / 12);
    for (const [mult, amp, decay] of [
      [1, 1, 2.6],
      [2.76, 0.35, 1.2],
      [5.4, 0.12, 0.6],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(volume * amp, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  fadeOut(seconds: number): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.25, t + seconds);
  }

  fadeIn(): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.9, t + 2);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    void this.ctx?.resume();
  }
}

export const audio = new LullAudio();
