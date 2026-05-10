/** Autocorrelation-based fundamental estimation (guitar-range). */

const RMS_THRESHOLD = 0.012;

export function detectPitch(
  samples: Float32Array,
  sampleRate: number,
  hintHz?: number,
): number | null {
  const n = samples.length;
  let rms = 0;
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    rms += s * s;
  }
  rms = Math.sqrt(rms / n);
  if (rms < RMS_THRESHOLD) return null;

  let minF = 65;
  let maxF = 1200;
  if (hintHz !== undefined && hintHz > 0) {
    const low = hintHz * 0.92;
    const high = hintHz * 1.08;
    minF = Math.min(low, hintHz / 2 * 0.92);
    maxF = Math.max(high, hintHz * 2 * 1.08);
    minF = Math.max(65, minF);
    maxF = Math.min(1200, maxF);
  }

  const minPeriod = Math.floor(sampleRate / maxF);
  const maxPeriod = Math.floor(sampleRate / minF);
  if (minPeriod >= maxPeriod || minPeriod < 2) return null;

  let bestTau = minPeriod;
  let bestCorr = -Infinity;

  for (let tau = minPeriod; tau <= maxPeriod; tau++) {
    let corr = 0;
    const lim = n - tau;
    for (let i = 0; i < lim; i++) {
      corr += samples[i] * samples[i + tau];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestTau = tau;
    }
  }

  if (bestCorr <= 0 || bestTau <= 0) return null;

  let refined = bestTau;
  if (bestTau > minPeriod && bestTau < maxPeriod) {
    const c0 =
      correlationAt(samples, n, bestTau - 1) -
      2 * correlationAt(samples, n, bestTau) +
      correlationAt(samples, n, bestTau + 1);
    const c1 =
      (correlationAt(samples, n, bestTau + 1) -
        correlationAt(samples, n, bestTau - 1)) /
      2;
    if (c0 !== 0) {
      refined = bestTau - c1 / (2 * c0);
    }
  }

  const hz = sampleRate / refined;
  if (!Number.isFinite(hz) || hz < minF || hz > maxF) return null;
  return hz;
}

function correlationAt(samples: Float32Array, n: number, tau: number): number {
  if (tau < 1 || tau >= n) return 0;
  let corr = 0;
  const lim = n - tau;
  for (let i = 0; i < lim; i++) {
    corr += samples[i] * samples[i + tau];
  }
  return corr;
}

export function midiFromFreq(freq: number, a4: number): number {
  return 69 + (12 * Math.log(freq / a4)) / Math.LN2;
}

export function noteNameFromMidi(midi: number): string {
  const names = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
  ];
  const rounded = Math.round(midi);
  const name = names[((rounded % 12) + 12) % 12];
  const octave = Math.floor(rounded / 12) - 1;
  return `${name}${octave}`;
}

export function centsBetween(freq: number, target: number): number {
  return (1200 * Math.log(freq / target)) / Math.LN2;
}

export function freqFromMidi(midi: number, a4: number): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}
