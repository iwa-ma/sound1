import {
  centsBetween,
  detectPitch,
  freqFromMidi,
  midiFromFreq,
  noteNameFromMidi,
} from "./pitch";
import { Metronome } from "./metronome";

const STRING_DEFS = [
  { label: "6弦 E", midi: 40 },
  { label: "5弦 A", midi: 45 },
  { label: "4弦 D", midi: 50 },
  { label: "3弦 G", midi: 55 },
  { label: "2弦 B", midi: 59 },
  { label: "1弦 E", midi: 64 },
] as const;

const STORAGE_KEYS = {
  bpm: "sound1.bpm",
  a4: "sound1.a4",
  string: "sound1.stringIdx",
  accent: "sound1.accent",
  timeSig: "sound1.timeSig",
} as const;

function loadNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function loadBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1" || raw === "true";
}

function loadInt(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function main(): void {
  const micToggle = document.querySelector<HTMLButtonElement>("#micToggle")!;
  const micStatus = document.querySelector<HTMLElement>("#micStatus")!;
  const refPitchInput = document.querySelector<HTMLInputElement>("#refPitch")!;
  const stringRow = document.querySelector<HTMLDivElement>(".string-row")!;
  const needle = document.querySelector<HTMLElement>("#needle")!;
  const freqDisplay = document.querySelector<HTMLElement>("#freqDisplay")!;
  const noteDisplay = document.querySelector<HTMLElement>("#noteDisplay")!;
  const centsDisplay = document.querySelector<HTMLElement>("#centsDisplay")!;
  const bpmInput = document.querySelector<HTMLInputElement>("#bpm")!;
  const timeSig = document.querySelector<HTMLSelectElement>("#timeSig")!;
  const accentCheck = document.querySelector<HTMLInputElement>("#accent")!;
  const metroToggle = document.querySelector<HTMLButtonElement>("#metroToggle")!;
  const tapTempo = document.querySelector<HTMLButtonElement>("#tapTempo")!;
  const beatDot = document.querySelector<HTMLElement>("#beatDot")!;
  const beatLabel = document.querySelector<HTMLElement>("#beatLabel")!;

  refPitchInput.value = String(loadNumber(STORAGE_KEYS.a4, 440));
  bpmInput.value = String(loadNumber(STORAGE_KEYS.bpm, 120));
  accentCheck.checked = loadBool(STORAGE_KEYS.accent, true);
  const savedSig = loadInt(STORAGE_KEYS.timeSig, 4);
  timeSig.value = savedSig === 3 || savedSig === 6 ? String(savedSig) : "4";

  let selectedStringIdx = Math.min(
    STRING_DEFS.length - 1,
    Math.max(0, loadInt(STORAGE_KEYS.string, 0)),
  );

  const audioCtx = new AudioContext();
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 8192;
  analyser.smoothingTimeConstant = 0.35;
  const bufferLen = analyser.fftSize;
  const timeDomain = new Float32Array(bufferLen);

  let mediaStream: MediaStream | null = null;
  let micActive = false;
  let rafId = 0;

  const metro = new Metronome(audioCtx);
  metro.setCallback((beatInBar, beatsPerBar) => {
    beatDot.classList.remove("pulse");
    void beatDot.offsetWidth;
    beatDot.classList.add("pulse");
    beatLabel.textContent = `${beatInBar + 1} / ${beatsPerBar}`;
  });

  function targetHz(): number {
    const a4 = Number(refPitchInput.value);
    return freqFromMidi(STRING_DEFS[selectedStringIdx].midi, a4);
  }

  function renderStringButtons(): void {
    stringRow.replaceChildren();
    STRING_DEFS.forEach((s, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "string-btn" + (idx === selectedStringIdx ? " active" : "");
      btn.textContent = s.label;
      btn.addEventListener("click", () => {
        selectedStringIdx = idx;
        localStorage.setItem(STORAGE_KEYS.string, String(idx));
        renderStringButtons();
      });
      stringRow.appendChild(btn);
    });
  }

  renderStringButtons();

  const smoothed = { hz: 0, has: false };
  const smoothAlpha = 0.22;

  function tickTuner(): void {
    if (!micActive) return;
    analyser.getFloatTimeDomainData(timeDomain);
    const a4 = Number(refPitchInput.value);
    const hint = freqFromMidi(STRING_DEFS[selectedStringIdx].midi, a4);
    const raw = detectPitch(timeDomain, audioCtx.sampleRate, hint);

    if (raw === null) {
      smoothed.has = false;
      freqDisplay.textContent = "—";
      noteDisplay.textContent = "—";
      centsDisplay.textContent = "—";
      needle.style.left = "50%";
    } else {
      const hz = smoothed.has
        ? smoothed.hz + smoothAlpha * (raw - smoothed.hz)
        : raw;
      smoothed.hz = hz;
      smoothed.has = true;

      freqDisplay.textContent = `${hz.toFixed(1)} Hz`;
      const midi = midiFromFreq(hz, a4);
      noteDisplay.textContent = noteNameFromMidi(midi);

      const target = targetHz();
      const cents = centsBetween(hz, target);
      const cStr = cents >= 0 ? `+${cents.toFixed(1)}` : cents.toFixed(1);
      centsDisplay.textContent = cStr;

      const clamped = Math.max(-50, Math.min(50, cents));
      const pct = 50 + clamped;
      needle.style.left = `${pct}%`;
    }

    rafId = requestAnimationFrame(tickTuner);
  }

  async function toggleMic(): Promise<void> {
    if (micActive) {
      micActive = false;
      cancelAnimationFrame(rafId);
      mediaStream?.getTracks().forEach((t) => t.stop());
      mediaStream = null;
      micToggle.textContent = "マイクを開始";
      micStatus.textContent = "マイクは停止しています。";
      needle.style.left = "50%";
      freqDisplay.textContent = "—";
      noteDisplay.textContent = "—";
      centsDisplay.textContent = "—";
      return;
    }

    try {
      await audioCtx.resume();
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const src = audioCtx.createMediaStreamSource(mediaStream);
      src.connect(analyser);
      micActive = true;
      micToggle.textContent = "マイクを停止";
      micStatus.textContent =
        "入力を監視中です。弦を鳴らしてチューニングしてください。";
      tickTuner();
    } catch {
      micStatus.textContent =
        "マイクを利用できませんでした。ブラウザの許可と HTTPS / localhost を確認してください。";
    }
  }

  micToggle.addEventListener("click", () => void toggleMic());

  refPitchInput.addEventListener("change", () => {
    let v = Number(refPitchInput.value);
    if (!Number.isFinite(v)) v = 440;
    v = Math.min(460, Math.max(420, v));
    refPitchInput.value = String(v);
    localStorage.setItem(STORAGE_KEYS.a4, String(v));
  });

  function syncMetroOptions(): void {
    const bpm = Math.round(Number(bpmInput.value));
    const clamped = Math.min(240, Math.max(40, bpm));
    bpmInput.value = String(clamped);
    metro.setBpm(clamped);
    localStorage.setItem(STORAGE_KEYS.bpm, String(clamped));

    const sig = Number(timeSig.value) as 3 | 4 | 6;
    metro.setBeatsPerBar(sig);
    localStorage.setItem(STORAGE_KEYS.timeSig, String(sig));

    metro.setAccentFirst(accentCheck.checked);
    localStorage.setItem(STORAGE_KEYS.accent, accentCheck.checked ? "1" : "0");
  }

  bpmInput.addEventListener("change", syncMetroOptions);
  bpmInput.addEventListener("input", syncMetroOptions);
  timeSig.addEventListener("change", syncMetroOptions);
  accentCheck.addEventListener("change", syncMetroOptions);

  function updateMetroUi(): void {
    metroToggle.textContent = metro.isRunning() ? "停止" : "開始";
  }

  function toggleMetro(): void {
    syncMetroOptions();
    if (metro.isRunning()) {
      metro.stop();
    } else {
      metro.start();
    }
    updateMetroUi();
  }

  metroToggle.addEventListener("click", () => {
    void audioCtx.resume().then(() => {
      toggleMetro();
    });
  });

  const tapTimes: number[] = [];
  tapTempo.addEventListener("click", () => {
    const now = performance.now();
    tapTimes.push(now);
    while (tapTimes.length > 1 && now - tapTimes[0]! > 2500) {
      tapTimes.shift();
    }
    if (tapTimes.length < 2) return;
    const intervals: number[] = [];
    for (let i = 1; i < tapTimes.length; i++) {
      intervals.push(tapTimes[i]! - tapTimes[i - 1]!);
    }
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.round(60000 / avg);
    const clamped = Math.min(240, Math.max(40, bpm));
    bpmInput.value = String(clamped);
    syncMetroOptions();
  });

  syncMetroOptions();
  updateMetroUi();

  window.addEventListener("keydown", (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      (e.target as HTMLElement).isContentEditable
    ) {
      return;
    }

    if (e.code === "Space") {
      e.preventDefault();
      void audioCtx.resume().then(() => {
        toggleMetro();
      });
      return;
    }

    if (e.code === "ArrowUp") {
      e.preventDefault();
      bpmInput.value = String(Math.min(240, Number(bpmInput.value) + 1));
      syncMetroOptions();
      return;
    }
    if (e.code === "ArrowDown") {
      e.preventDefault();
      bpmInput.value = String(Math.max(40, Number(bpmInput.value) - 1));
      syncMetroOptions();
      return;
    }
    if (e.code === "ArrowRight") {
      e.preventDefault();
      bpmInput.value = String(Math.min(240, Number(bpmInput.value) + 5));
      syncMetroOptions();
      return;
    }
    if (e.code === "ArrowLeft") {
      e.preventDefault();
      bpmInput.value = String(Math.max(40, Number(bpmInput.value) - 5));
      syncMetroOptions();
    }
  });
}

main();
