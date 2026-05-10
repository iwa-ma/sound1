export type BeatCallback = (beatIndexInBar: number, beatsPerBar: number) => void;

export class Metronome {
  private ctx: AudioContext;
  private running = false;
  private bpm = 120;
  private beatsPerBar = 4;
  private accentFirst = true;
  private nextBeatTime = 0;
  private beatCount = 0;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private readonly lookaheadMs = 25;
  private readonly scheduleAheadSec = 0.12;
  private onBeat?: BeatCallback;

  constructor(audioContext: AudioContext) {
    this.ctx = audioContext;
  }

  setCallback(cb: BeatCallback | undefined): void {
    this.onBeat = cb;
  }

  setBpm(bpm: number): void {
    const v = Math.round(bpm);
    this.bpm = Math.min(240, Math.max(40, v));
  }

  getBpm(): number {
    return this.bpm;
  }

  setBeatsPerBar(n: 3 | 4 | 6): void {
    this.beatsPerBar = n;
  }

  setAccentFirst(on: boolean): void {
    this.accentFirst = on;
  }

  start(): void {
    if (this.running) return;
    void this.ctx.resume();
    this.running = true;
    this.nextBeatTime = this.ctx.currentTime + 0.05;
    this.beatCount = 0;
    this.timerId = setInterval(() => this.schedulerTick(), this.lookaheadMs);
    this.schedulerTick();
  }

  stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private schedulerTick(): void {
    if (!this.running) return;
    while (this.nextBeatTime < this.ctx.currentTime + this.scheduleAheadSec) {
      const beatInBar = this.beatCount % this.beatsPerBar;
      const accent = this.accentFirst && beatInBar === 0;
      this.scheduleClick(this.nextBeatTime, accent);
      const uiDelay = Math.max(0, (this.nextBeatTime - this.ctx.currentTime) * 1000);
      const b = beatInBar;
      const barLen = this.beatsPerBar;
      window.setTimeout(() => this.onBeat?.(b, barLen), uiDelay);
      const spb = 60 / this.bpm;
      this.nextBeatTime += spb;
      this.beatCount++;
    }
  }

  private scheduleClick(startTime: number, accent: boolean): void {
    const t = startTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(accent ? 1040 : 780, t);
    const peak = accent ? 0.42 : 0.22;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }
}
