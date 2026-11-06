import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ASL,
  AslNotes,
  SignGlyph,
  SignReference,
  SignVariantPicker,
  asSignVariant,
  type SignVariantId,
} from "../asl-signs";
import {
  LETTER_ORDER,
  byLetter,
  buildTiming,
  freqOf,
  letterOfMorse,
  patternMs,
  vibrationPattern,
  unitOfWpm,
  WPM_CHOICES,
  STANDARD_DEFAULT_WPM,
  MORBRAI_UNIT_CHOICES,
  MORBRAI_DEFAULT_UNIT,
  DATA,
  type Timing,
  type ProfileId,
} from "../lib/morbrai";

export const Route = createFileRoute("/")({
  component: Home,
});


/* Lesson 2 word list + round picker (module scope — no deps) */
const L2_WORDS = ["CAB", "BAD", "BED", "CAD", "FACE", "DEAF", "BAG", "BIG"];

function pickL2Round(target: string): string[] {
  const others = L2_WORDS.filter((w) => w !== target);
  const shuffled = [...others].sort(() => Math.random() - 0.5).slice(0, 3);
  return [...shuffled, target].sort(() => Math.random() - 0.5);
}

function randomL2(): string {
  return L2_WORDS[Math.floor(Math.random() * L2_WORDS.length)];
}

/* Lesson 3 word list + round picker — 4–5 letter words, same pattern
   as Lesson 2 (module scope, no deps). */
const L3_WORDS = [
  "CABIN",
  "BADGE",
  "FACE",
  "DECAF",
  "MAGIC",
  "BEACH",
  "CHIME",
  "FIELD",
];

function pickL3Round(target: string): string[] {
  const others = L3_WORDS.filter((w) => w !== target);
  const shuffled = [...others].sort(() => Math.random() - 0.5).slice(0, 3);
  return [...shuffled, target].sort(() => Math.random() - 0.5);
}

function randomL3(): string {
  return L3_WORDS[Math.floor(Math.random() * L3_WORDS.length)];
}

/* ------------------------------------------------------------------ */
/* Free typing (the §3 melody box and Lesson 4) — ONE normaliser.      */
/*                                                                     */
/* A–Z letters survive, everything else is ignored. A run of           */
/* whitespace — including a line break, so a new line is a word        */
/* boundary — collapses to ONE space, and a leading space is dropped.  */
/* A single trailing space is deliberately kept: the box is edited on  */
/* every keystroke, and trimming it would make the space bar look      */
/* broken while typing the second word. Playback strips it (see        */
/* phraseTokens), so a trailing space never adds a pause.              */
/* The cap is a hard cap and it is stated in the UI — never a silent   */
/* truncation.                                                         */
/* ------------------------------------------------------------------ */
const PHRASE_MAX = 240; // characters per line / per phrase box
const L4_MAX_ROWS = 6; // lines a Lesson 4 stack may hold

/* One typed line of Lesson 4: its text, already normalised, plus whether
   its letters are currently shown (each line reveals independently). */
type L4Row = { text: string; revealed: boolean };

function normalizePhrase(raw: string, max = PHRASE_MAX): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^ +/, "")
    .slice(0, max);
}

/* What actually plays: one token per letter, " " = word gap. This is the
   exact array contract playWordMelody already consumes, so a space typed
   in either box becomes a real word gap on the one shared timeline. */
function phraseTokens(raw: string, max = PHRASE_MAX): string[] {
  return normalizePhrase(raw, max)
    .replace(/ +$/, "")
    .split("");
}

const countLetters = (tokens: string[]): number =>
  tokens.filter((t) => t !== " ").length;

const countWords = (tokens: string[]): number =>
  tokens.join("").split(" ").filter(Boolean).length;

/* Group flat tokens into words, keeping each token's index in the flat
   array so active-token highlighting still works. Used to lay a long
   phrase out one word per box instead of one enormous wrapping row. */
function groupByWord(tokens: string[]): { t: string; i: number }[][] {
  const groups: { t: string; i: number }[][] = [];
  let cur: { t: string; i: number }[] = [];
  tokens.forEach((t, i) => {
    if (t === " ") {
      if (cur.length > 0) groups.push(cur);
      cur = [];
      return;
    }
    cur.push({ t, i });
  });
  if (cur.length > 0) groups.push(cur);
  return groups;
}


/* Lesson 5 — the flagship phrase. Split into playback tokens where a
   space is a word gap (playWordMelody treats " " as a pause). */
const L5_PHRASE = "MIRACLES HAPPEN EVERY SECOND";
const L5_WORDS = L5_PHRASE.split(" ");

/* "C -.-.  ·  A .-" — the Morse code a round is training, de-duplicated. */
function morseLegend(tokens: string[] | string): string {
  const list = typeof tokens === "string" ? tokens.split("") : tokens;
  const seen = new Set<string>();
  const out: string[] = [];
  list.forEach((t) => {
    if (t === " " || seen.has(t)) return;
    seen.add(t);
    out.push(`${t} ${byLetter(t).morse}`);
  });
  return out.join("  ·  ");
}

/* Every player on the page receives `timing` from the Home component's
   single derived Timing object — there is no implicit default, so a
   missing profile is a compile error rather than a wrong rhythm. */


/* Honest arithmetic, not a guess: how long a token list will take to
   play, computed from the SAME timings the players use — a letter costs
   its own Morse pattern, plus one letter gap when another letter
   follows, and a " " token costs exactly one word gap (the player adds
   no letter gap before a space). Shown live next to the input so a
   paragraph never surprises anyone at learning speed. */
function estimateMs(tokens: string[], timing: Timing): number {
  let t = 0;
  tokens.forEach((tok, i) => {
    if (tok === " ") {
      t += timing.wordGapMs;
      return;
    }
    const letterMs = patternMs(byLetter(tok).morse, timing);
    const next = tokens[i + 1];
    t += next !== undefined && next !== " " ? letterMs + timing.letterGapMs : letterMs;
  });
  return t;
}

function fmtDuration(ms: number): string {
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs} s`;
  const m = Math.floor(secs / 60);
  const r = secs % 60;
  return r === 0 ? `${m} min` : `${m} min ${r} s`;
}

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

/* ------------------------------------------------------------------ */
/* Light emitter: the second sensory channel. The SAME timeline that   */
/* drives vibration and melody also drives the light panel — one       */
/* emitLight() call per Morse element step inside playMorse /          */
/* playWordMelody, plus one "off" event at the end of each element so  */
/* the gaps stay dark. There is no second engine and no parallel       */
/* timer: the light is a subscriber to the element timeline, exactly   */
/* like onStep is.                                                     */
/* ------------------------------------------------------------------ */
type LightState = "off" | "dot" | "dash" | "gap";
type LightFrame = {
  state: LightState;
  morse: string; // the letter currently playing ("" = idle / word gap)
  idx: number; // active element inside morse (-1 = nothing lit)
  seq: number; // bumps per frame
};
let lightSink: ((f: LightFrame) => void) | null = null;
let lightSeq = 0;
function emitLight(state: LightState, morse = "", idx = -1) {
  lightSeq += 1;
  lightSink?.({ state, morse, idx, seq: lightSeq });
}



/* ------------------------------------------------------------------ */
/* TONE REACH — register, hearing ceiling, waveform.                   */
/*                                                                     */
/* The per-letter pitch ladder is one walk, C4 -> G7. Its top is       */
/* G7 ~= 3136 Hz, and age-related high-frequency loss makes that end   */
/* inaudible: roughly half the alphabet can go silent for exactly the  */
/* people this product is for. Two controls answer that, and the order */
/* matters — the measurement comes first, the preset second:           */
/*                                                                     */
/*  1. HEARING CHECK (the fix). An ascending ladder of test tones; the */
/*     user marks the highest one they hear, and that becomes their    */
/*     CEILING. The whole letter ladder is then transposed down by     */
/*     whole octaves until nothing sits above the ceiling. Octaves —   */
/*     not an arbitrary scale factor — keep the interval between two   */
/*     letters exactly as it was (the melody keeps its shape, only its */
/*     pitch drops) and keep the tones on real musical pitches.        */
/*  2. REGISTER. The band the 26 letters are laid out in, log-evenly,  */
/*     so every letter keeps its own distinct pitch and the band's top */
/*     is used rather than wasted. "wide" is the ORIGINAL C4-G7 ladder */
/*     (derived from NOTE_FREQ / LETTER_NOTE, not copied), kept        */
/*     reachable and labelled honestly as the one whose top half ages  */
/*     out first.                                                      */
/*                                                                     */
/* Both are tone-only. They cannot touch the rhythm (dot/dash/gaps are */
/* built by buildTiming and nothing here reads them) and they cannot   */
/* touch vibration: the web Vibration API is on/off only, so a web     */
/* page cannot frequency-tune a phone's actuator at all.               */
/* ------------------------------------------------------------------ */
const NOTE_NAMES = [
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

/* Nearest equal-tempered note name (A4 = 440 Hz). Only the "wide"
   register lands exactly on notes; the narrowed bands spread 26 pitches
   over little more than an octave, so there the name is an approximation
   and is always shown with "approx". */
function noteNameOf(hz: number): string {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  return `${name}${Math.floor(midi / 12) - 1}`;
}

type RegisterId = "low" | "mid" | "high" | "wide";
/* A VOICE is what the one tone path can carry: the three original
   waveforms, plus the synthesised piano, guitar, drum and 8-bit the games
   add. Each plugs in the same way — one more entry in VOICES, never a
   second engine. A voice may change TIMBRE only: the gate, the
   dot and dash lengths and every gap come from `timing`, so no voice
   can change the rhythm of the code. */
type WaveformId = "sine" | "triangle" | "square";
type VoiceId = WaveformId | "piano" | "guitar" | "drum" | "eightbit";

type RegisterPreset = {
  id: RegisterId;
  label: string;
  lo: number;
  hi: number;
  blurb: string;
};

const REGISTERS: Record<RegisterId, RegisterPreset> = {
  low: {
    id: "low",
    label: "Low",
    lo: 220,
    hi: 520,
    blurb:
      "Deep and speech-like. The safest band if high tones have gone quiet.",
  },
  mid: {
    id: "mid",
    label: "Mid",
    lo: 520,
    hi: 1200,
    blurb:
      "The default: inside the range most hearing keeps longest, and every letter still has its own pitch.",
  },
  high: {
    id: "high",
    label: "High",
    lo: 1200,
    hi: 3100,
    blurb:
      "Bright. Use it only if the hearing check says you reach this far up — this is where the old ladder used to sit.",
  },
  wide: {
    id: "wide",
    label: "Wide",
    lo: 261.63,
    hi: 3135.96,
    blurb:
      "The original C4-G7 ladder, one note per letter, exactly as it played before. Its top half is the part that ages out first.",
  },
};
const REGISTER_ORDER: RegisterId[] = ["low", "mid", "high", "wide"];
const TONE_DEFAULT_REGISTER: RegisterId = "mid";

type VoiceInfo = { id: VoiceId; label: string; blurb: string };

const VOICES: Record<VoiceId, VoiceInfo> = {
  sine: {
    id: "sine",
    label: "Sine",
    blurb: "One pure frequency, no harmonics — the gentlest to listen to.",
  },
  triangle: {
    id: "triangle",
    label: "Triangle",
    blurb:
      "A little richer than sine, still soft. The default, and closest to the voice this page used before.",
  },
  square: {
    id: "square",
    label: "Square",
    blurb:
      "Richer and harsher: strong odd harmonics, so it cuts through background noise, but it sounds buzzy and tires the ear faster.",
  },
  /* PIANO — a VOICE on this same tone path, not a second engine.
     One oscillator carries a piano-like harmonic spectrum (a
     PeriodicWave) through the IDENTICAL gate, so the number of sound
     envelopes per element, the dot and dash lengths and every gap are
     exactly what they were with the other three. It is SYNTHESISED:
     no sample, no piano, nothing recorded. */
  piano: {
    id: "piano",
    label: "Piano",
    blurb:
      "Synthesised, not a sampled instrument: one oscillator carrying a piano-like harmonic spectrum through the same gate. The games' default voice.",
  },
  /* GUITAR — a second VOICE on the same tone path, built the same way:
     one oscillator carrying a plucked-string harmonic spectrum through
     the IDENTICAL gate. It changes timbre only. The games also give it a
     SKIN on the lane (strings and frets), which is paint, not a second
     engine. SYNTHESISED — no sample, no guitar, nothing recorded, and
     it is not a guitar: there are no strings and no fret positions. */
  guitar: {
    id: "guitar",
    label: "Guitar",
    blurb:
      "Synthesised, not a sampled guitar: a plucked-string harmonic spectrum — brighter than the piano, with far more upper partials — through the same gate. Pick it and the lane turns into five strings.",
  },
  /* DRUM — the third VOICE on the same tone path, built the same way:
     one oscillator carrying a struck-drum-like spectrum through the
     IDENTICAL gate. Its character is the SPECTRUM (a hollow, odd-heavy
     set of partials), never a shorter note: every element still sounds
     for its own full length, because the element length is the code.
     SYNTHESISED — no sample, no recording, and it is not a drum kit. */
  drum: {
    id: "drum",
    label: "Drum",
    blurb:
      "Synthesised, not a sampled drum: a hollow, odd-heavy struck spectrum through the same gate — percussive in colour, with every dot and dash still sounding its full length. No lane skin; the lane stays a keyboard.",
  },
  /* 8-BIT — the fourth game voice on the same tone path, built the same
     way: one oscillator carrying the harmonic spectrum of a narrow
     (quarter-width) pulse wave, which is the thin, buzzy chip voice.
     Through the IDENTICAL gate, so every element still sounds for its own
     full length. SYNTHESISED — no sample, no chip, nothing recorded, and
     it is not a console. No lane skin. */
  eightbit: {
    id: "eightbit",
    label: "8-bit",
    blurb:
      "Synthesised, not a sampled chip: one oscillator carrying the harmonic spectrum of a quarter-width pulse wave — thin, buzzy and bright, through the same gate, with every dot and dash still sounding its full length. No lane skin; the lane stays a keyboard.",
  },
};
const VOICE_ORDER: VoiceId[] = [
  "sine",
  "triangle",
  "square",
  "piano",
  "guitar",
  "drum",
  "eightbit",
];
const TONE_DEFAULT_VOICE: VoiceId = "triangle";

/* Relative partial amplitudes of the synthesised piano voice: a strong
   fundamental with the harmonics falling away quickly, which is what a
   struck string does. Plain numbers — no sample, no recording. */
const PIANO_PARTIALS = [1, 0.5, 0.3, 0.19, 0.12, 0.08, 0.05, 0.03];

let pianoWaveCache: { ctx: BaseAudioContext; wave: PeriodicWave } | null = null;
function pianoWave(ctx: BaseAudioContext): PeriodicWave | null {
  try {
    if (pianoWaveCache && pianoWaveCache.ctx === ctx) return pianoWaveCache.wave;
    const n = PIANO_PARTIALS.length + 1;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    PIANO_PARTIALS.forEach((a, i) => {
      imag[i + 1] = a;
    });
    const w = ctx.createPeriodicWave(real, imag);
    pianoWaveCache = { ctx, wave: w };
    return w;
  } catch {
    return null;
  }
}

/* Relative partial amplitudes of the synthesised guitar voice: a plucked
   string keeps far more of its upper harmonics than a struck key does, so
   the ladder above the fundamental falls away slowly instead of steeply.
   Plain numbers — no sample, no recording, no guitar. */
const GUITAR_PARTIALS = [
  1, 0.78, 0.62, 0.5, 0.41, 0.33, 0.27, 0.22, 0.17, 0.13,
];

let guitarWaveCache: { ctx: BaseAudioContext; wave: PeriodicWave } | null = null;
function guitarWave(ctx: BaseAudioContext): PeriodicWave | null {
  try {
    if (guitarWaveCache && guitarWaveCache.ctx === ctx)
      return guitarWaveCache.wave;
    const n = GUITAR_PARTIALS.length + 1;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    GUITAR_PARTIALS.forEach((a, i) => {
      imag[i + 1] = a;
    });
    const w = ctx.createPeriodicWave(real, imag);
    guitarWaveCache = { ctx, wave: w };
    return w;
  } catch {
    return null;
  }
}

/* Relative partial amplitudes of the synthesised drum voice: strong,
   uneven ODD harmonics over quiet even ones, which is the hollow,
   struck-metal colour rather than a plucked string's smooth taper. All
   integer multiples of the fundamental, because one oscillator can only
   produce harmonics of the note it is playing — no inharmonic partials
   are claimed here, and none are produced. Plain numbers — no sample,
   no recording, no drum. */
const DRUM_PARTIALS = [
  1, 0.16, 0.82, 0.11, 0.69, 0.08, 0.58, 0.06, 0.47, 0.05, 0.4, 0.04, 0.33,
  0.03, 0.27, 0.03, 0.22, 0.02, 0.18,
];
let drumWaveCache: { ctx: BaseAudioContext; wave: PeriodicWave } | null = null;
function drumWave(ctx: BaseAudioContext): PeriodicWave | null {
  try {
    if (drumWaveCache && drumWaveCache.ctx === ctx) return drumWaveCache.wave;
    const n = DRUM_PARTIALS.length + 1;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    DRUM_PARTIALS.forEach((a, i) => {
      imag[i + 1] = a;
    });
    const w = ctx.createPeriodicWave(real, imag);
    drumWaveCache = { ctx, wave: w };
    return w;
  } catch {
    return null;
  }
}
/* Relative partial amplitudes of the synthesised 8-bit voice: a pulse
   wave of one quarter the period wide has harmonic n at |sin(n*pi/4)|/n
   of the fundamental, so every fourth harmonic is missing — the thin,
   reedy chip tone. Plain numbers worked out from that formula — no
   sample, no recording, no console. */
const EIGHTBIT_PARTIALS = [
  0.7071, 0.5, 0.2357, 0, 0.1414, 0.1667, 0.101, 0, 0.0786, 0.1, 0.0643, 0,
  0.0544, 0.0714, 0.0471, 0, 0.0416, 0.0556, 0.0372, 0, 0.0337, 0.0455,
  0.0307, 0,
];
let eightbitWaveCache: { ctx: BaseAudioContext; wave: PeriodicWave } | null =
  null;
function eightbitWave(ctx: BaseAudioContext): PeriodicWave | null {
  try {
    if (eightbitWaveCache && eightbitWaveCache.ctx === ctx)
      return eightbitWaveCache.wave;
    const n = EIGHTBIT_PARTIALS.length + 1;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    EIGHTBIT_PARTIALS.forEach((a, i) => {
      imag[i + 1] = a;
    });
    const w = ctx.createPeriodicWave(real, imag);
    eightbitWaveCache = { ctx, wave: w };
    return w;
  } catch {
    return null;
  }
}

/* Every voice reaches the oscillator the same way, and the oscillator is
   the only thing a voice touches. The three waveforms set the built-in
   type; the piano, the guitar, the drum and the 8-bit each set a
   periodic wave.
   The gate, the lowpass, the durations and the gaps are untouched
   either way, so no voice can shorten or lengthen a single element. */
function applyVoice(
  osc: OscillatorNode,
  ctx: BaseAudioContext,
  voice: VoiceId,
) {
  if (
    voice === "piano" ||
    voice === "guitar" ||
    voice === "drum" ||
    voice === "eightbit"
  ) {
    const w = (
      voice === "guitar"
        ? guitarWave
        : voice === "drum"
          ? drumWave
          : voice === "eightbit"
            ? eightbitWave
            : pianoWave
    )(ctx);
    if (w) {
      osc.setPeriodicWave(w);
      return;
    }
    /* No PeriodicWave available: fall back to a real built-in voice so
       the note is still heard rather than silently lost. */
    osc.type = "triangle";
    return;
  }
  osc.type = voice;
}

/* A phone's tiny speaker stops reproducing anything below this. */
const MIN_TONE_HZ = 150;

/* The hearing check's ascending ladder: 250 Hz to 4 kHz, eight steps,
   all inside what a phone speaker can actually produce. The user's
   ceiling is the highest step they report hearing — never a guess at
   what lies between two steps. */
const HEARING_TEST_TONES = [250, 400, 600, 900, 1400, 2000, 2800, 4000];
const HEARING_TEST_MS = 700;

/* 26 log-even pitches across a band: same rise as the note ladder, but
   filling the chosen band edge to edge. */
function logEvenBand(lo: number, hi: number, n: number): number[] {
  return Array.from(
    { length: n },
    (_, i) => lo * Math.pow(hi / lo, i / (n - 1)),
  );
}


type TonePlan = {
  register: RegisterId;
  waveform: VoiceId;
  ceilingHz: number | null;
  hz: Record<string, number>; // letter -> frequency actually produced
  lo: number;
  hi: number;
  foldedOctaves: number; // whole-octave transpose forced by the ceiling
  compressed: boolean; // ceiling squeezed the span instead (very low ceiling)
};

/* The single tone mapping every tone output reads. Pure function of the
   three settings, so the UI can never disagree with what is played. */
function planTone(
  register: RegisterId,
  waveform: VoiceId,
  ceilingHz: number | null,
): TonePlan {
  const preset = REGISTERS[register];
  let freqs =
    register === "wide"
      ? LETTER_ORDER.map((l) => freqOf(l)) // the original ladder, verbatim
      : logEvenBand(preset.lo, preset.hi, LETTER_ORDER.length);

  let foldedOctaves = 0;
  let compressed = false;
  const top = freqs[freqs.length - 1];

  if (ceilingHz !== null && top > ceilingHz) {
    const k = Math.max(1, Math.ceil(Math.log2(top / ceilingHz)));
    if (freqs[0] / Math.pow(2, k) >= MIN_TONE_HZ) {
      /* Whole octaves: every letter keeps its own pitch, every interval
         survives, nothing is left above the measured ceiling. */
      foldedOctaves = k;
      freqs = freqs.map((f) => f / Math.pow(2, k));
    } else {
      /* Folding that far would push the bottom letter under the speaker
         floor, so squeeze the ladder between the floor and the ceiling. */
      compressed = true;
      freqs = logEvenBand(
        MIN_TONE_HZ,
        Math.max(ceilingHz, MIN_TONE_HZ * 2),
        LETTER_ORDER.length,
      );
    }
  }

  const hz: Record<string, number> = {};
  LETTER_ORDER.forEach((l, i) => {
    hz[l] = freqs[i];
  });

  return {
    register,
    waveform,
    ceilingHz,
    hz,
    lo: freqs[0],
    hi: freqs[freqs.length - 1],
    foldedOctaves,
    compressed,
  };
}

/* "520.0-1200.0 Hz (approx C5-D6)" — real numbers, honest note names. */
const bandText = (lo: number, hi: number): string =>
  `${lo.toFixed(1)}-${hi.toFixed(1)} Hz (\u2248 ${noteNameOf(lo)}-${noteNameOf(hi)})`;

/* ------------------------------------------------------------------ */
/* Preferences. Register, waveform, hearing ceiling and light colours  */
/* are remembered between visits. Reads and writes are guarded: SSR has */
/* no localStorage, and a blocked or full store must never break the    */
/* page — the setting simply stops being remembered.                    */
/* ------------------------------------------------------------------ */
const PREF_PREFIX = "morbrai.";

function loadPref(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREF_PREFIX + key);
  } catch {
    return null;
  }
}

function savePref(key: string, value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value === null) window.localStorage.removeItem(PREF_PREFIX + key);
    else window.localStorage.setItem(PREF_PREFIX + key, value);
  } catch {
    /* storage unavailable — keep working, just without memory */
  }
}

const asRegister = (v: string | null): RegisterId =>
  REGISTER_ORDER.includes(v as RegisterId)
    ? (v as RegisterId)
    : TONE_DEFAULT_REGISTER;

const asVoice = (v: string | null): VoiceId =>
  VOICE_ORDER.includes(v as VoiceId)
    ? (v as VoiceId)
    : TONE_DEFAULT_VOICE;

/* A stored ceiling is a frequency a person reported hearing. Anything
   outside 100-20000 Hz is not a measurement, so it is discarded. */
const asCeiling = (v: string | null): number | null => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 100 && n <= 20000 ? n : null;
};

/* ------------------------------------------------------------------ */
/* Light colour sets. Same rhythm, same 70 ms ramps, same steady fill  */
/* under reduced motion — only the two colours change. Each set keeps  */
/* dot and dash distinct in hue AND in brightness, and the dot/dash row */
/* below the surface still differs by SHAPE, so a set that is hard to   */
/* tell apart in your colour vision still reads by length.             */
/* ------------------------------------------------------------------ */
type ColourSet = {
  id: string;
  label: string;
  dotFill: string;
  dotGlow: string;
  dotChip: string;
  dashFill: string;
  dashGlow: string;
  dashChip: string;
  note: string;
};

const COLOUR_SETS: ColourSet[] = [
  {
    id: "cyanAmber",
    label: "Cyan dot / amber dash",
    dotFill: "rgba(34, 211, 238, 0.60)",
    dotGlow: "inset 0 0 30px rgba(34, 211, 238, 0.5)",
    dotChip: "border-cyan-300 bg-cyan-400/40",
    dashFill: "rgba(251, 191, 36, 0.70)",
    dashGlow: "inset 0 0 34px rgba(251, 191, 36, 0.55)",
    dashChip: "border-amber-300 bg-amber-400/40",
    note: "The original pair. Amber is the brighter of the two.",
  },
  {
    id: "blueMagenta",
    label: "Blue dot / magenta dash",
    dotFill: "rgba(59, 130, 246, 0.65)",
    dotGlow: "inset 0 0 30px rgba(59, 130, 246, 0.55)",
    dotChip: "border-blue-400 bg-blue-500/40",
    dashFill: "rgba(217, 70, 239, 0.70)",
    dashGlow: "inset 0 0 34px rgba(217, 70, 239, 0.6)",
    dashChip: "border-fuchsia-400 bg-fuchsia-500/40",
    note: "Darker blue against a lighter magenta — reads by brightness too.",
  },
  {
    id: "whiteRed",
    label: "White dot / red dash",
    dotFill: "rgba(241, 245, 249, 0.85)",
    dotGlow: "inset 0 0 30px rgba(241, 245, 249, 0.7)",
    dotChip: "border-slate-100 bg-slate-200/70",
    dashFill: "rgba(239, 68, 68, 0.75)",
    dashGlow: "inset 0 0 34px rgba(239, 68, 68, 0.6)",
    dashChip: "border-red-400 bg-red-500/50",
    note: "Highest contrast in brightness — the one to try if hue is hard to judge.",
  },
];

const asColourSet = (v: string | null): string =>
  COLOUR_SETS.some((c) => c.id === v) ? (v as string) : COLOUR_SETS[0].id;

const colourSetOf = (id: string): ColourSet =>
  COLOUR_SETS.find((c) => c.id === id) ?? COLOUR_SETS[0];

/* ------------------------------------------------------------------ */
/* Tone engine: shared AudioContext + one gated VOICE. The chosen      */
/* voice (a waveform, or the synthesised piano) runs through a soft     */
/* lowpass with a quick attack and an exponential ring-out (~0.6s after */
/* a dot-length note, ~1s after a dash-length). A voice changes timbre  */
/* only: the gate, the lowpass and the durations are the same for every */
/* voice, so dot and dash lengths are untouched by this choice.         */
/* ------------------------------------------------------------------ */
let audioCtx: AudioContext | null = null;
function getAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => undefined);
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(
  freq: number,
  durMs: number,
  dotMs: number,
  wave: VoiceId = TONE_DEFAULT_VOICE,
  vol = 0.15,
) {
  const ctx = getAudio();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime + 0.02;
    const body = Math.max(durMs / 1000, 0.09);
    /* Short decay for a dot-length note, long ring for anything longer —
       measured against the SELECTED profile's dot, not a fixed 100 ms. */
    const decay = durMs <= dotMs ? 0.6 : 1.0;
    const total = body + decay;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.linearRampToValueAtTime(vol, t0 + 0.008); // quick strike
    env.gain.exponentialRampToValueAtTime(0.0008, t0 + total); // ring-out

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.max(2500, Math.min(freq * 4, 6000));
    lp.Q.value = 0.5;

    /* ONE oscillator of the chosen waveform. The gate (envelope), the
       durations and the lowpass are identical for all three, so the
       waveform can change the timbre but never the rhythm. */
    const osc = ctx.createOscillator();
    applyVoice(osc, ctx, wave);
    osc.frequency.value = freq;
    const oscG = ctx.createGain();
    oscG.gain.value = 0.9;

    osc.connect(oscG).connect(lp);
    lp.connect(env).connect(ctx.destination);

    osc.start(t0);
    osc.stop(t0 + total + 0.05);
    osc.onended = () => {
      try {
        env.disconnect();
        lp.disconnect();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Rhythm player: fires vibration once, then steps through each Morse  */
/* element on a timer so the glyph lights up in sync (visual fallback  */
/* for devices like iPhones with no Vibration API). Optional beep.     */
/* ------------------------------------------------------------------ */
let liveTimers: ReturnType<typeof setTimeout>[] = [];
function stopRhythm() {
  liveTimers.forEach(clearTimeout);
  liveTimers = [];
  /* A carrier is a live audio voice, not a timer, so stopping the
     timeline has to stop it too — otherwise the drone would outlive the
     message and sit under whatever plays next. */
  stopCarrier();
}

let wordTimers: ReturnType<typeof setTimeout>[] = [];
function stopWordTimers() {
  wordTimers.forEach(clearTimeout);
  wordTimers = [];
  stopCarrier(); // same reason as stopRhythm: no drone outlives its message
}

function playMorse(
  morse: string,
  opts: {
    sound: boolean;
    freq?: number;
    wave: VoiceId;
    /* How the sound is delivered — discrete pings or the sustained
       carrier. Either way the timeline comes from `timing`. */
    toneMode: ToneMode;
    timing: Timing;
    onStep: (i: number) => void;
    onDone: () => void;
  },
) {
  stopRhythm();
  const timing = opts.timing;
  if (canVibrate()) {
    try {
      navigator.vibrate(vibrationPattern(morse, timing));
    } catch {
      /* ignore */
    }
  }
  let t = 0;
  if (opts.sound) getAudio(); // unlock/resume shared ctx inside the user gesture
  const sustained = opts.sound && opts.toneMode === "carrier";
  if (sustained) {
    // one continuous voice for the letter; the element steps below still
    // drive the glyph, the light and the buzz off the same `t` timeline
    startCarrier(
      carrierScheduleForMorse(morse, timing, opts.freq ?? 440),
      opts.wave,
    );
  }
  const beep = (dur: number) => {
    if (opts.sound && !sustained)
      playTone(opts.freq ?? 440, dur, timing.dotMs, opts.wave);
  };
  [...morse].forEach((s, i) => {
    const dur = s === "." ? timing.dotMs : timing.dashMs;
    liveTimers.push(
      setTimeout(() => {
        opts.onStep(i);
        emitLight(s === "." ? "dot" : "dash", morse, i); // light = same step
        beep(dur);
      }, t),
    );
    // element over -> dark for the gap (same timeline, no extra clock)
    liveTimers.push(setTimeout(() => emitLight("off", morse, i), t + dur));
    t += dur + timing.elementGapMs;
  });
  liveTimers.push(
    setTimeout(() => {
      opts.onStep(-1);
      opts.onDone();
    }, t),
  );
}

/* ------------------------------------------------------------------ */
/* Word melody player: steps through a word letter by letter. Each     */
/* letter plays its own tone (from the one tone plan) + fires its Morse */
/* vibration, and                                                      */
/* its tile + glyph highlight in sync.                                 */
/*                                                                     */
/* A " " token is a WORD GAP: it lights a "gap" frame and holds the    */
/* timeline dark for timing.wordGapMs (7 units standard / 14 Morbraii). */
/* A letter that is followed by another letter instead advances by     */
/* timing.letterGapMs (3u / 6u), and a letter followed by a space adds  */
/* no letter gap at all — the space owns the whole boundary, so the    */
/* real ITU ratio holds: 3 units between letters, 7 between words.     */
/* Letter boundaries can no longer be mistaken for word boundaries.    */
/* ------------------------------------------------------------------ */
function playWordMelody(
  word: string[],
  opts: {
    sound: boolean;
    tone: Record<string, number>; // letter -> Hz, from the one tone plan
    wave: VoiceId;
    /* "discrete" = the per-letter pings this player has always played;
       "carrier" hands the whole word to one continuous voice. Same
       `timing` and same tone plan either way. */
    toneMode: ToneMode;
    timing: Timing;
    onLetter: (i: number) => void;
    onStep: (i: number) => void;
    onDone: () => void;
  },
) {
  stopRhythm();
  stopWordTimers();
  const timing = opts.timing;
  if (opts.sound) getAudio(); // unlock shared ctx inside the user gesture

  /* Sustained mode: the whole word's swell/dip schedule goes to one
     continuous voice, built from the same token walk and the same
     `timing`. The per-letter pings below are silenced; nothing else
     changes, so the letter steps, the light, the buzz and the glyph
     highlight keep reading the identical timeline they always did. */
  const sustained = opts.sound && opts.toneMode === "carrier";
  if (sustained) {
    startCarrier(
      carrierSchedule(word, timing, (l) => opts.tone[l] ?? freqOf(l)),
      opts.wave,
    );
  }

  let t = 0;
  word.forEach((l, li) => {
    if (l === " ") {
      // word gap: silence + no buzz. The light goes (and stays) dark for
      // timing.wordGapMs, so the phrase rhythm reads in light alone.
      wordTimers.push(setTimeout(() => emitLight("gap"), t));
      wordTimers.push(setTimeout(() => emitLight("off"), t + timing.wordGapMs));
      t += timing.wordGapMs; // word gap: silence + no buzz between words
      return;
    }
    const e = byLetter(l);
    const letterMs = patternMs(e.morse, timing); // total incl. element gaps

    wordTimers.push(
      setTimeout(() => {
        opts.onLetter(li);
        if (opts.sound && !sustained) {
          playTone(
            opts.tone[l] ?? freqOf(l),
            letterMs,
            timing.dotMs,
            opts.wave,
          );
        }
        if (canVibrate()) {
          try {
            navigator.vibrate(vibrationPattern(e.morse, timing));
          } catch {
            /* ignore */
          }
        }
      }, t),
    );

    // step highlight through the morse elements of this letter
    let st = 0;
    [...e.morse].forEach((s, si) => {
      const dur = s === "." ? timing.dotMs : timing.dashMs;
      wordTimers.push(
        setTimeout(() => {
          opts.onStep(si);
          emitLight(s === "." ? "dot" : "dash", e.morse, si); // light = same step
        }, t + st),
      );
      wordTimers.push(
        setTimeout(() => emitLight("off", e.morse, si), t + st + dur),
      );
      st += dur + timing.elementGapMs;
    });

    /* Letter gap vs word gap. A space token right after this letter owns
       the whole boundary (word gap), so no letter gap is added there. */
    const next = word[li + 1];
    if (next !== undefined && next !== " ") {
      t += letterMs + timing.letterGapMs;
    } else {
      t += letterMs;
    }
  });

  wordTimers.push(
    setTimeout(() => {
      opts.onLetter(-1);
      opts.onStep(-1);
      opts.onDone();
    }, t),
  );
}

/* ------------------------------------------------------------------ */
/* TONE OUTPUT — discrete pings, or a sustained carrier ("resonance"). */
/*                                                                     */
/* Round 1 changed WHICH pitch a letter sounds at. This is the other   */
/* axis: HOW the sound is delivered. There is no third timing here.    */
/*                                                                     */
/*  · "discrete" — what the page has always done: one gated ping per   */
/*    Morse element, silence in between. This is on/off keying, the    */
/*    thing an ITU Morse channel actually does, and it is the one that */
/*    transfers.                                                       */
/*  · "carrier"  — OUR mode, explicitly NOT ITU. One continuous voice  */
/*    runs for the whole message and never goes silent: its amplitude  */
/*    SWELLS while a dot or a dash is sounding and DIPS (does not      */
/*    stop) through every gap. A boundary is heard as a drop in energy */
/*    instead of as silence, and a letter boundary is a deeper, longer */
/*    dip than an element boundary. Real Morse keys its carrier fully  */
/*    off, so this departs from the standard on purpose.               */
/*                                                                     */
/* The carrier reads the ONE timing model like every other output: the */
/* swell/dip schedule is built by walking vibrationPattern() — the same*/
/* function the buzz uses — so it consumes dotMs, dashMs,             */
/* elementGapMs, letterGapMs and wordGapMs from the shared Timing      */
/* object and owns no durations of its own. Pitch comes from the ONE   */
/* tone plan (letter -> Hz, hearing ceiling already applied); the      */
/* carrier adds no second Hz table.                                    */
/* ------------------------------------------------------------------ */
type ToneMode = "discrete" | "carrier";
const TONE_DEFAULT_MODE: ToneMode = "discrete";

type ToneModeInfo = {
  id: ToneMode;
  label: string;
  badge: string;
  blurb: string;
};

const TONE_MODES: ToneModeInfo[] = [
  {
    id: "discrete",
    label: "Discrete pings",
    badge: "on/off keying · standard",
    blurb:
      "A short ping per dot and dash, silence in every gap — the way a real Morse channel keys its carrier, and the one that transfers.",
  },
  {
    id: "carrier",
    label: "Sustained carrier",
    badge: "ours · not ITU",
    blurb:
      "One tone that never goes silent. It swells while a dot or dash sounds and dips in the gaps, so a boundary is heard as a drop in energy rather than as silence.",
  },
];

const asToneMode = (v: string | null): ToneMode =>
  TONE_MODES.some((m) => m.id === v) ? (v as ToneMode) : TONE_DEFAULT_MODE;

/* Carrier levels. The swell sits a little below the discrete ping's 0.15
   peak: energy that never stops reads louder than the same peak in short
   bursts, and the point of this mode is to be held, not endured. The dip
   ratio is the whole trick — 0.18 of the swell is still audible energy,
   so the message never falls silent, yet the swing is ~15 dB, which is
   plainly heard. */
const CARRIER_SWELL = 0.1;
const CARRIER_DIP_RATIO = 0.18;
const CARRIER_DIP_DB = 20 * Math.log10(CARRIER_DIP_RATIO); // ≈ -14.9 dB
/* Swell/dip ramp — fast enough to read as a boundary, slow enough not to
   click; never longer than half the shortest segment it has to fit in. */
const CARRIER_RAMP_S = 0.02;
const CARRIER_RELEASE_S = 0.12; // final fade, mirroring the ping's ring-out

type CarrierSeg = { atMs: number; durMs: number; on: boolean };
type CarrierPitch = { atMs: number; hz: number };
type CarrierSchedule = {
  segs: CarrierSeg[];
  pitch: CarrierPitch[];
  totalMs: number;
};

/* One letter's swell/dip schedule. Built from vibrationPattern(), so it
   is the same on/gap alternation the buzz uses — even indices are the
   elements (swell), odd indices the element gaps (dip). */
function carrierScheduleForMorse(
  morse: string,
  timing: Timing,
  hz: number,
): CarrierSchedule {
  const segs: CarrierSeg[] = [];
  let st = 0;
  vibrationPattern(morse, timing).forEach((d, k) => {
    segs.push({ atMs: st, durMs: d, on: k % 2 === 0 });
    st += d;
  });
  return {
    segs,
    pitch: morse.length > 0 ? [{ atMs: 0, hz }] : [],
    totalMs: st,
  };
}

/* A whole message's schedule, with exactly the boundary arithmetic the
   other players use: a letter followed by another letter advances by
   letterGapMs, a letter followed by a space adds nothing (the space owns
   the whole boundary as wordGapMs). Same timing object, no parallel
   table, so the carrier cannot drift from the buzz or the light. */
function carrierSchedule(
  tokens: string[],
  timing: Timing,
  hzFor: (l: string) => number,
): CarrierSchedule {
  const segs: CarrierSeg[] = [];
  const pitch: CarrierPitch[] = [];
  let t = 0;
  tokens.forEach((tok, i) => {
    if (tok === " ") {
      // word gap: the dip is held for the full 7 units (14 Morbraii)
      segs.push({ atMs: t, durMs: timing.wordGapMs, on: false });
      t += timing.wordGapMs;
      return;
    }
    const one = carrierScheduleForMorse(byLetter(tok).morse, timing, hzFor(tok));
    one.segs.forEach((s) =>
      segs.push({ atMs: t + s.atMs, durMs: s.durMs, on: s.on }),
    );
    one.pitch.forEach((p) => pitch.push({ atMs: t + p.atMs, hz: p.hz }));
    const next = tokens[i + 1];
    if (next !== undefined && next !== " ") {
      segs.push({ atMs: t + one.totalMs, durMs: timing.letterGapMs, on: false });
      t += one.totalMs + timing.letterGapMs;
    } else {
      t += one.totalMs;
    }
  });
  return { segs, pitch, totalMs: t };
}

/* The live carrier voice. One at a time, like every other output: a new
   message cancels the old one rather than layering a drone over it. */
let carrierVoice: {
  osc: OscillatorNode;
  gate: GainNode;
  lp: BiquadFilterNode;
} | null = null;

function stopCarrier() {
  const v = carrierVoice;
  carrierVoice = null;
  if (!v) return;
  const now = v.gate.context.currentTime;
  try {
    v.gate.gain.cancelScheduledValues(now);
    v.gate.gain.setValueAtTime(v.gate.gain.value, now);
    v.gate.gain.linearRampToValueAtTime(0.0001, now + 0.03);
  } catch {
    /* ignore */
  }
  try {
    v.osc.stop(now + 0.05);
  } catch {
    /* ignore */
  }
  v.osc.onended = () => {
    try {
      v.osc.disconnect();
      v.gate.disconnect();
      v.lp.disconnect();
    } catch {
      /* ignore */
    }
  };
}

/* Start the carrier for one schedule. Amplitude is automated from the
   schedule above; pitch is set once per letter, at the start of that
   letter's first element — the moment the gate is already down in the
   dip, so a pitch change can never click. */
function startCarrier(sched: CarrierSchedule, wave: VoiceId) {
  if (sched.segs.length === 0) return;
  const ctx = getAudio();
  if (!ctx) return;
  stopCarrier();

  const t0 = ctx.currentTime + 0.02;
  const dip = CARRIER_SWELL * CARRIER_DIP_RATIO;

  const gate = ctx.createGain();
  let prev = 0.0001;
  gate.gain.setValueAtTime(prev, t0);
  sched.segs.forEach((s) => {
    const a = t0 + s.atMs / 1000;
    const b = a + Math.max(s.durMs, 1) / 1000;
    const target = s.on ? CARRIER_SWELL : dip;
    const ramp = Math.min(CARRIER_RAMP_S, Math.max(0.004, (b - a) / 2));
    gate.gain.setValueAtTime(prev, a);
    gate.gain.linearRampToValueAtTime(target, a + ramp);
    gate.gain.setValueAtTime(target, b);
    prev = target;
  });
  const endT = t0 + sched.totalMs / 1000;
  gate.gain.setValueAtTime(prev, endT);
  gate.gain.linearRampToValueAtTime(0.0001, endT + CARRIER_RELEASE_S);

  /* Same lowpass idea as the ping, held at one setting for the whole
     message: it is derived from the top pitch this message actually
     uses, so it is still a function of the one tone plan. */
  const topHz = sched.pitch.reduce((m, p) => Math.max(m, p.hz), 0);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = Math.max(2500, Math.min(topHz * 4 || 2500, 6000));
  lp.Q.value = 0.5;

  const osc = ctx.createOscillator();
  applyVoice(osc, ctx, wave);
  osc.frequency.setValueAtTime(sched.pitch[0]?.hz ?? 440, t0);
  sched.pitch.forEach((p) => {
    osc.frequency.setValueAtTime(p.hz, t0 + p.atMs / 1000);
  });

  osc.connect(gate).connect(lp).connect(ctx.destination);
  osc.start(t0);
  osc.stop(endT + CARRIER_RELEASE_S + 0.05);

  carrierVoice = { osc, gate, lp };
}

/* ------------------------------------------------------------------ */
/* Glyphs: hybrid = Morse waveform on top, Braille 2x3 cell below.     */
/* Dots = small circles, dashes = horizontal bars. Filled braille dot  */
/* = raised, outline = flat. Pure inline SVG, no font files.           */
/* ------------------------------------------------------------------ */
function MorseWave({
  morse,
  active = -1,
  height = 44,
}: {
  morse: string;
  active?: number;
  height?: number;
}) {
  const gap = 18;
  const dotR = 10;
  const dashW = 42;
  const dashH = 18;
  let x = 6;
  const items: { s: string; x: number }[] = [];
  [...morse].forEach((s) => {
    items.push({ s, x });
    x += (s === "." ? dotR * 2 : dashW) + gap;
  });
  const w = Math.max(x - gap + 6, 20);
  const mid = height / 2;
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      style={{ height, maxWidth: "100%" }}
      role="img"
      aria-label={`Morse ${morse === "." ? "dot" : morse.split("").join(" ")}`}
    >
      {items.map((it, i) =>
        it.s === "." ? (
          <circle
            key={i}
            cx={it.x + dotR}
            cy={mid}
            r={i === active ? dotR + 2 : dotR}
            fill={i === active ? "#ffffff" : "#22d3ee"}
            style={
              i === active
                ? { filter: "drop-shadow(0 0 8px #22d3ee)" }
                : undefined
            }
          />
        ) : (
          <rect
            key={i}
            x={it.x}
            y={mid - dashH / 2}
            width={dashW}
            height={dashH}
            rx={dashH / 2}
            fill={i === active ? "#ffffff" : "#fbbf24"}
            style={
              i === active
                ? { filter: "drop-shadow(0 0 8px #fbbf24)" }
                : undefined
            }
          />
        ),
      )}
    </svg>
  );
}

const BRAILLE_POS: Record<number, [number, number]> = {
  1: [32, 30],
  2: [32, 75],
  3: [32, 120],
  4: [68, 30],
  5: [68, 75],
  6: [68, 120],
};

function BrailleCell({
  dots,
  height = 150,
  glow = true,
}: {
  dots: number[];
  height?: number;
  glow?: boolean;
}) {
  const set = new Set(dots);
  return (
    <svg
      viewBox="0 0 100 150"
      style={{ height, maxWidth: "100%" }}
      role="img"
      aria-label={`Braille dots ${dots.join(", ")}`}
    >
      {[1, 2, 3, 4, 5, 6].map((n) => {
        const [cx, cy] = BRAILLE_POS[n];
        const on = set.has(n);
        return on ? (
          <circle
            key={n}
            cx={cx}
            cy={cy}
            r={15}
            fill="#22d3ee"
            style={
              glow ? { filter: "drop-shadow(0 0 7px #22d3ee)" } : undefined
            }
          />
        ) : (
          <circle
            key={n}
            cx={cx}
            cy={cy}
            r={13}
            fill="none"
            stroke="#475569"
            strokeWidth={3}
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Glyph row: one tile per token, letter + dot/dash pattern + Morse    */
/* wave + Braille cell, all tapping the same glyph vocabulary as the   */
/* top of the page. " " renders as a word-gap marker. `hidden` blanks  */
/* the reading (Lesson 5 reveal), `activeIdx` is the playing letter.   */
/* ------------------------------------------------------------------ */
function GlyphRow({
  tokens,
  activeIdx = -1,
  size = "md",
  hidden = false,
  showBraille = true,
}: {
  tokens: string[];
  activeIdx?: number;
  size?: "sm" | "md" | "lg";
  hidden?: boolean;
  showBraille?: boolean;
}) {
  const dims = {
    sm: {
      tile: "min-w-[52px] px-1.5 py-1",
      letter: "text-xl leading-6",
      morse: "text-[10px]",
      wave: 18,
      braille: 46,
    },
    md: {
      tile: "min-w-[62px] px-2 py-1",
      letter: "text-2xl leading-7",
      morse: "text-[11px]",
      wave: 24,
      braille: 60,
    },
    lg: {
      tile: "min-w-[78px] px-2.5 py-2",
      letter: "text-4xl leading-9",
      morse: "text-sm",
      wave: 34,
      braille: 96,
    },
  }[size];

  /* One dashed box per word. This is also the layout that keeps a
     paragraph readable: a long phrase groups into words and wraps,
     instead of one enormous row of tiles. The ␣ chip between two boxes
     is the word gap itself, and it is still announced as "Word gap". */
  const words = groupByWord(tokens);

  return (
    <div className="flex flex-wrap items-stretch justify-center gap-2">
      {words.flatMap((w, wi) => {
        const chip =
          wi > 0 ? (
            <div
              key={`gap-${wi}`}
              aria-label="Word gap"
              className={`flex w-5 items-center justify-center self-stretch rounded-lg border border-dashed ${
                w[0] !== undefined && w[0].i - 1 === activeIdx
                  ? "border-cyan-400 text-cyan-300"
                  : "border-slate-700 text-slate-500"
              }`}
            >
              <span aria-hidden className="text-xs">
                ␣
              </span>
            </div>
          ) : null;
        return [
          chip,
          <div
            key={`word-${wi}`}
            className="flex flex-wrap items-stretch justify-center gap-1 rounded-xl border border-dashed border-slate-700/70 p-1"
          >
            {w.map(({ t, i }) => {
              const on = i === activeIdx;
              const e = byLetter(t);
              return (
                <div
                  key={`${i}-${t}`}
                  className={`flex flex-col items-center rounded-xl border-2 transition-colors ${dims.tile} ${
                    on
                      ? "quiz-glow border-cyan-300 bg-cyan-400/15"
                      : "border-slate-700 bg-slate-800"
                  }`}
                >
                  <span
                    className={`font-black ${dims.letter} ${
                      hidden ? "text-slate-600" : "text-white"
                    }`}
                  >
                    {hidden ? "•" : t}
                  </span>
                  <span
                    className={`font-mono tracking-tight ${dims.morse} ${
                      on ? "text-cyan-200" : "text-amber-200"
                    }`}
                  >
                    {hidden ? "· · ·" : e.morse.split("").join(" ")}
                  </span>
                  {!hidden && (
                    <span className="mt-0.5 flex justify-center">
                      <MorseWave morse={e.morse} height={dims.wave} />
                    </span>
                  )}
                  {!hidden && showBraille && (
                    <span className="mt-0.5 flex justify-center">
                      <BrailleCell
                        dots={e.braille}
                        height={dims.braille}
                        glow={on}
                      />
                    </span>
                  )}
                </div>
              );
            })}
          </div>,
        ];
      })}
      {words.length > 1 && (
        <p className="w-full text-center text-[11px] text-slate-400">
          Each dashed box is one word — the ␣ between two boxes is a word gap.
        </p>
      )}
    </div>
  );
}

/* Morse-only row: the dot/dash pattern of a word with the live letter
   lit. Used where the letters themselves must stay secret — the learner
   reads the rhythm they are feeling instead of the spelling. */
function MorseRun({
  tokens,
  activeIdx = -1,
  hidden = false,
}: {
  tokens: string[];
  activeIdx?: number;
  hidden?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-center gap-2">
      {tokens.map((t, i) =>
        t === " " ? (
          <span
            key={`gap-${i}`}
            aria-hidden
            className="w-4 self-stretch rounded border border-dashed border-slate-700"
          />
        ) : (
          <span
            key={`${i}-${t}`}
            role="img"
            aria-label={
              hidden
                ? "Morse pattern hidden"
                : `Morse ${byLetter(t).morse.split("").join(" ")}`
            }
            className={`rounded-lg border px-1.5 py-1 ${
              i === activeIdx
                ? "quiz-glow border-cyan-300 bg-cyan-400/15"
                : "border-slate-700 bg-slate-800"
            }`}
          >
            {hidden ? (
              <span aria-hidden className="font-mono text-xs text-slate-500">
                ●▬
              </span>
            ) : (
              <MorseWave morse={byLetter(t).morse} height={26} />
            )}
          </span>
        ),
      )}
    </div>
  );
}

/* Small reusable legend line: the dot/dash timing this demo trains.
   Reads the SELECTED profile — never hard-coded numbers. */
function TimingLegend({ timing }: { timing: Timing }) {
  return (
    <p className="mt-1 font-mono text-xs text-slate-400">
      <span className="text-cyan-300">● dot {timing.dotMs} ms</span>
      {"  ·  "}
      <span className="text-amber-300">▬ dash {timing.dashMs} ms</span>
      {"  ·  "}
      {timing.elementGapMs} ms gaps · letter gap {timing.letterGapMs} ms · word
      gap {timing.wordGapMs} ms ·{" "}
      {timing.profile === "standard" ? "standard ITU" : "Morbraii spacing"}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Timing profile panel — the ONE place the rhythm is chosen.          */
/* Both profiles are real: each one is just a Timing object handed to  */
/* the same timeline (playMorse / playWordMelody / light + glyph       */
/* steps). Switching changes durations only, so nothing can desync;    */
/* whatever is already playing finishes on the profile it started on.  */
/* ------------------------------------------------------------------ */
function TimingPanel({
  profile,
  wpm,
  morbraiUnit,
  timing,
  onProfile,
  onWpm,
  onMorbraiUnit,
}: {
  profile: ProfileId;
  wpm: number;
  morbraiUnit: number;
  timing: Timing;
  onProfile: (p: ProfileId) => void;
  onWpm: (w: number) => void;
  onMorbraiUnit: (u: number) => void;
}) {
  const isStd = profile === "standard";
  const btn = (on: boolean) =>
    `min-h-[56px] rounded-xl border-2 px-2 text-sm font-bold ${
      on
        ? "quiz-glow border-cyan-300 bg-slate-800 text-white"
        : "border-slate-600 bg-slate-800 text-slate-200"
    }`;
  /* Honest grid readout: every boundary the timeline actually uses. */
  const cells: { k: string; v: number; u: string }[] = [
    { k: "dot", v: timing.dotMs, u: "1u" },
    { k: "dash", v: timing.dashMs, u: "3u" },
    {
      k: "element gap",
      v: timing.elementGapMs,
      u: `${timing.elementGapMs / timing.unitMs}u`,
    },
    {
      k: "letter gap",
      v: timing.letterGapMs,
      u: `${timing.letterGapMs / timing.unitMs}u`,
    },
    {
      k: "word gap",
      v: timing.wordGapMs,
      u: `${timing.wordGapMs / timing.unitMs}u`,
    },
  ];
  return (
    <section aria-label="Timing profile" className="mt-5 text-left">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-bold">⏱ Timing profile</h2>
        <p className="mt-1 text-sm text-slate-300">
          Both profiles drive the same buzz, light and glyph rhythm. Pick the
          one you are learning.
        </p>

        {/* Profile */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onProfile("standard")}
            aria-pressed={isStd}
            aria-label="Standard Morse timing, ITU ratios"
            className={btn(isStd)}
          >
            {isStd ? "✓ " : ""}Standard Morse
            <span className="block text-xs font-normal text-slate-300">
              ITU · transfers
            </span>
          </button>
          <button
            type="button"
            onClick={() => onProfile("morbrai")}
            aria-pressed={!isStd}
            aria-label="Morbraii spacing timing, our own ratios, not ITU"
            className={btn(!isStd)}
          >
            {!isStd ? "✓ " : ""}Morbraii spacing
            <span className="block text-xs font-normal text-slate-300">
              ours · not ITU
            </span>
          </button>
        </div>

        {/* What is being acquired, in one plain sentence. */}
        <p
          className={`mt-3 rounded-xl p-3 text-sm ${
            isStd
              ? "bg-cyan-400/10 text-cyan-100"
              : "bg-amber-400/10 text-amber-100"
          }`}
        >
          {isStd ? (
            <>
              <span className="font-bold">You are acquiring the real code</span>{" "}
              — standard ITU Morse (1 : 3 : 1 : 3 : 7 units). It reads on any
              Morse channel: another app, another phone, a real operator.
            </>
          ) : (
            <>
              <span className="font-bold">
                Morbraii spacing — our own, not standard Morse and not ITU.
              </span>{" "}
              The dot/dash letters are identical to standard, but the boundaries
              are exaggerated (element 2 units, letter 6, word 14) so a boundary
              is felt instead of guessed. A real operator&rsquo;s spacing
              differs, so feeling this does not transfer as-is.
            </>
          )}
        </p>

        {/* Pace */}
        {isStd ? (
          <>
            <p className="mt-3 text-sm font-bold text-slate-200">
              Pace (50 units to the word — the PARIS standard)
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {WPM_CHOICES.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => onWpm(w)}
                  aria-pressed={wpm === w}
                  aria-label={`Standard Morse at ${w} words per minute, unit ${unitOfWpm(w)} milliseconds`}
                  className={btn(wpm === w)}
                >
                  {w} wpm
                  <span className="block text-xs font-normal text-slate-300">
                    unit {unitOfWpm(w)} ms
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm font-bold text-slate-200">
              Pace (unit = one dot, in ms)
            </p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {MORBRAI_UNIT_CHOICES.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => onMorbraiUnit(u)}
                  aria-pressed={morbraiUnit === u}
                  aria-label={`Morbraii spacing unit ${u} milliseconds`}
                  className={btn(morbraiUnit === u)}
                >
                  {u} ms
                </button>
              ))}
            </div>
          </>
        )}

        {/* Honest readout of the grid in ms. */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {cells.map((c) => (
            <div
              key={c.k}
              className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2"
            >
              <p className="text-xs uppercase tracking-wider text-slate-400">
                {c.k}
              </p>
              <p className="font-mono text-base font-bold text-white">
                {c.v} ms
              </p>
              <p className="font-mono text-xs text-slate-400">= {c.u}</p>
            </div>
          ))}
          <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2">
            <p className="text-xs uppercase tracking-wider text-slate-400">
              pace
            </p>
            <p className="font-mono text-base font-bold text-white">
              {timing.wpm.toFixed(timing.wpm % 1 === 0 ? 0 : 1)} wpm
            </p>
            <p className="font-mono text-xs text-slate-400">
              {isStd ? "PARIS equivalent" : "letters only — boundaries differ"}
            </p>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-400">
          {/* The same numbers drive the buzz, the tone length, the light
              panel ramps and the glyph highlight — one timeline, no
              per-channel timers. */}
          Applies from the next play. A change mid-playback cannot desync
          anything: the running playback finishes on the profile it started
          with. Vibration is on/off only in a web page, so these ms values are
          what we can honestly claim for the buzz.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Light mode — the channel for phones that cannot vibrate (iPhone).   */
/* The panel is a SUBSCRIBER to the mapping timeline (lightSink), so    */
/* the light is painted from the same emitLight() frames that drive the */
/* buzz: no second timer, and the subscription is kept while the toggle */
/* is OFF, so flipping it mid-playback changes only what is painted —   */
/* it can never desync the light from the vibration.                   */
/*                                                                     */
/* The safety rules here are hard constraints, not styling:            */
/*  · soft attack/release ramps (~70 ms) instead of hard on/off, so a  */
/*    100 ms dot reads as a glow and can never land as a strobe;       */
/*  · cyan (dot) / amber (dash) glow on a dark ground — never a pure   */
/*    white flash, and never the full viewport: the lit surface is a   */
/*    bounded panel at ≤0.7 fill, not the whole screen at full blast;  */
/*  · prefers-reduced-motion: the ramp is dropped and the panel holds  */
/*    a STEADY fill for as long as something is playing — a steady     */
/*    brightness change rather than a pulsing flash. The toggle still  */
/*    wins: light mode OFF is dark either way.                         */
/* ------------------------------------------------------------------ */
const LIGHT_RAMP_MS = 70; // soft attack + release, inside the 60–80 ms band

function LightPanel({
  lightOn,
  onToggle,
  playing,
  idleMorse,
  idleLetter,
  colourSet,
  onColourSet,
}: {
  lightOn: boolean;
  onToggle: () => void;
  playing: boolean;
  idleMorse: string;
  idleLetter: string;
  colourSet: ColourSet;
  onColourSet: (id: string) => void;
}) {
  const [frame, setFrame] = useState<LightFrame | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  /* Subscribe for as long as the panel is mounted — including while
     light mode is OFF. */
  useEffect(() => {
    const sink = (f: LightFrame) => setFrame(f);
    lightSink = sink;
    return () => {
      if (lightSink === sink) lightSink = null;
    };
  }, []);

  /* Respect the system's reduced-motion request. */
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
    mq.addListener(apply);
    return () => mq.removeListener(apply);
  }, []);

  const state = frame?.state ?? "off";
  /* What the timeline says is lit right now (dot / dash / nothing). */
  const element: "dot" | "dash" | null =
    frame && frame.morse !== "" && (state === "dot" || state === "dash")
      ? state
      : null;

  /* The dot/dash row doubles as the glyph: the letter playing right now
     (frame.morse stays populated through its gaps, so the pattern stays
     visible while it lights), or the selected letter before playback. */
  const rowMorse = frame && frame.morse !== "" ? frame.morse : idleMorse;
  const rowLetter =
    frame && frame.morse !== "" ? letterOfMorse(frame.morse) : idleLetter;
  const rowIdx = frame && frame.morse !== "" ? frame.idx : -1;

  /* Surface fill: one glow per element normally; under reduced motion the
     panel holds ONE steady fill for the whole playback — no per-element
     change at all, so nothing pulses. The dot/dash reading then comes from
     the row + label below, which change without strobing the big surface. */
  const lit = lightOn && (reduceMotion ? playing : element !== null);
  const dashLit = !reduceMotion && element === "dash";
  const elementName = element === "dash" ? "dash" : "dot";

  const label = !lightOn
    ? "Light mode OFF — vibration and tones only"
    : element !== null && lit
      ? `Letter ${rowLetter || "—"} · light is a ${elementName} ${
          element === "dash" ? "▬" : "●"
        }`
      : reduceMotion && playing
        ? "Steady light — reduced motion, no pulse"
        : state === "gap"
          ? "Word gap — light dark"
          : playing
            ? "Playing — light dark between elements"
            : "Ready — the light follows the buzz";

  return (
    <section aria-label="Light response" className="mt-5 text-left">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        {/* Bounded glow surface: a panel, never the whole viewport. */}
        <div
          role="img"
          aria-label={
            lit
              ? `Light ${elementName} for letter ${rowLetter || "—"}`
              : "Light dark"
          }
          className="flex h-24 items-center justify-center rounded-xl border border-slate-800"
          style={{
            backgroundColor: lit
              ? dashLit
                ? colourSet.dashFill // dash colour of the selected set
                : colourSet.dotFill // dot colour of the selected set
              : "rgba(2, 6, 23, 1)",
            boxShadow: lit
              ? dashLit
                ? colourSet.dashGlow
                : colourSet.dotGlow
              : "none",
            transitionProperty: "background-color, box-shadow",
            transitionDuration: `${LIGHT_RAMP_MS}ms`,
            transitionTimingFunction: "ease-in-out",
          }}
        >
          <span
            className={`text-4xl font-black ${
              lit ? "text-slate-950/70" : "text-slate-700"
            }`}
          >
            {rowLetter || "·"}
          </span>
        </div>

        {/* The current letter's dot/dash pattern stays visible while it
            lights; the active element is the one filled. */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          {[...rowMorse].map((s, i) => {
            const on = lit && i === rowIdx;
            return (
              <span
                key={`${i}-${s}`}
                aria-hidden
                className={`flex h-7 items-center justify-center rounded-md border ${
                  s === "." ? "w-7" : "w-14"
                } ${
                  on
                    ? s === "."
                      ? colourSet.dotChip
                      : colourSet.dashChip
                    : "border-slate-700 bg-slate-800/70"
                }`}
              >
                <span
                  className={`font-mono text-xs ${
                    on ? "text-white" : "text-slate-500"
                  }`}
                >
                  {s === "." ? "●" : "▬"}
                </span>
              </span>
            );
          })}
        </div>

        <p className="mt-2 text-center text-sm font-bold text-slate-200">
          {label}
        </p>

        <button
          type="button"
          onClick={onToggle}
          aria-pressed={lightOn}
          className={`mt-3 min-h-[56px] w-full rounded-xl border-2 px-4 text-base font-bold ${
            lightOn
              ? "quiz-glow border-cyan-300 bg-slate-800 text-white"
              : "border-slate-600 bg-slate-800 text-slate-200"
          }`}
        >
          {lightOn ? "💡 Light mode: ON" : "💡 Light mode: OFF"}
        </button>

        {/* Colour sets — the same rhythm in a different pair of colours.
            The swatches show exactly the two fills used on the surface
            above, and the aria-label carries the values. */}
        <div className="mt-4" aria-label="Light colour sets">
          <p className="text-sm font-bold text-slate-200">Light colours</p>
          <div className="mt-2 flex flex-col gap-2">
            {COLOUR_SETS.map((c) => {
              const on = c.id === colourSet.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onColourSet(c.id)}
                  aria-pressed={on}
                  aria-label={`Light colours: ${c.label} — dot ${c.dotFill}, dash ${c.dashFill}`}
                  className={`min-h-[56px] rounded-xl border-2 px-3 py-2 text-left ${
                    on
                      ? "quiz-glow border-cyan-300 bg-slate-800"
                      : "border-slate-600 bg-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="inline-block h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: c.dotFill }}
                    />
                    <span
                      aria-hidden
                      className="inline-block h-4 w-7 shrink-0 rounded-sm"
                      style={{ backgroundColor: c.dashFill }}
                    />
                    <span className="text-sm font-bold text-white">
                      {on ? "✓ " : ""}
                      {c.label}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {c.note}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <p className="mt-2 text-xs text-slate-400">
          Light is the channel for phones that{" "}
          <span className="font-semibold text-slate-300">cannot vibrate</span>{" "}
          (iPhone): the same Morse rhythm as the buzz, drawn as light. Soft{" "}
          {LIGHT_RAMP_MS} ms ramps so a dot glows instead of strobing,{" "}
          {colourSet.label.toLowerCase()} on one bounded panel — and a steady
          fill, never a pulse, when your system asks for reduced motion. Dot and
          dash also differ in shape in the row above, so a pair that is hard to
          tell apart in your colour vision still reads by length.{" "}
          {lightOn ? "" : "Currently off: vibration and tones only."}
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Tone reach panel — register, hearing check, waveform.               */
/*                                                                     */
/* The hearing check comes FIRST in the UI because it is the fix: it   */
/* measures a person instead of guessing at them. Nothing here touches  */
/* the rhythm — every button changes pitch or timbre only, so the       */
/* dot/dash/gap timeline built by buildTiming is untouched.             */
/* ------------------------------------------------------------------ */
function TonePanel({
  plan,
  register,
  waveform,
  ceiling,
  selected,
  mode,
  timing,
  onRegister,
  onWaveform,
  onCeiling,
  onMode,
}: {
  plan: TonePlan;
  register: RegisterId;
  waveform: VoiceId;
  ceiling: number | null;
  selected: string;
  mode: ToneMode;
  timing: Timing;
  onRegister: (r: RegisterId) => void;
  onWaveform: (w: VoiceId) => void;
  onCeiling: (hz: number | null) => void;
  onMode: (m: ToneMode) => void;
}) {
  /* null = the check is not running; otherwise the index of the test
     tone being offered right now. */
  const [checkIdx, setCheckIdx] = useState<number | null>(null);
  const [lastHeard, setLastHeard] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const preset = REGISTERS[register];
  const hz = plan.hz[selected] ?? freqOf(selected);

  const playTest = (f: number) => {
    stopRhythm();
    stopWordTimers();
    playTone(f, HEARING_TEST_MS, HEARING_TEST_MS, waveform, 0.18);
  };

  const startCheck = () => {
    setLastHeard(null);
    setCheckIdx(0);
    setMsg(
      `Test tone ${HEARING_TEST_TONES[0]} Hz. Tap “I can hear this” only if you actually hear it.`,
    );
    playTest(HEARING_TEST_TONES[0]);
  };

  const hearIt = () => {
    if (checkIdx === null) return;
    const f = HEARING_TEST_TONES[checkIdx];
    setLastHeard(f);
    if (checkIdx >= HEARING_TEST_TONES.length - 1) {
      onCeiling(f);
      setCheckIdx(null);
      setMsg(
        `Stored: your ceiling is ${f} Hz — the top of the ladder. No letter's tone goes above it.`,
      );
      return;
    }
    const next = HEARING_TEST_TONES[checkIdx + 1];
    setCheckIdx(checkIdx + 1);
    setMsg(`Heard ${f} Hz. Next: ${next} Hz.`);
    playTest(next);
  };

  const notThis = () => {
    if (checkIdx === null) return;
    if (lastHeard === null) {
      /* The lowest test tone is 250 Hz — well inside what a phone
         speaker reproduces. If that was inaudible, the check itself is
         suspect, so store nothing rather than store a wrong ceiling. */
      setCheckIdx(null);
      setMsg(
        "You marked the lowest tone (250 Hz) as inaudible. That usually means the volume or the speaker, not your hearing — turn the volume up, out of a pocket, and run the check again. Nothing was stored.",
      );
      return;
    }
    onCeiling(lastHeard);
    setCheckIdx(null);
    setMsg(
      `Stored: your ceiling is ${lastHeard} Hz. No letter's tone goes above it.`,
    );
  };

  const stopCheck = () => {
    setCheckIdx(null);
    setMsg(
      ceiling === null
        ? "Check stopped. Nothing stored."
        : `Check stopped. Your stored ceiling is still ${ceiling} Hz.`,
    );
  };

  const clearCeiling = () => {
    onCeiling(null);
    setCheckIdx(null);
    setLastHeard(null);
    setMsg("Ceiling cleared — tones use the whole register again.");
  };

  const foldNote = (() => {
    if (ceiling === null) {
      return `No ceiling measured yet. Run the check once and every letter's tone will be folded under the highest tone you actually hear.`;
    }
    if (plan.foldedOctaves > 0) {
      return `Your ${preset.label} register reaches ${preset.hi.toFixed(1)} Hz — above your ${ceiling} Hz ceiling — so the whole ladder is transposed down ${plan.foldedOctaves} octave${
        plan.foldedOctaves > 1 ? "s" : ""
      } (÷${Math.pow(2, plan.foldedOctaves)}). The intervals between letters are unchanged, so the melody keeps its shape; only its pitch drops.`;
    }
    if (plan.compressed) {
      return `Folding ${preset.label} far enough would push the lowest letter under the speaker floor (~${MIN_TONE_HZ} Hz), so the 26 letters are squeezed into ${bandText(
        plan.lo,
        plan.hi,
      )} instead — all below your ceiling, each still its own pitch.`;
    }
    return `Your ${preset.label} register (${bandText(
      preset.lo,
      preset.hi,
    )}) already sits at or below your ${ceiling} Hz ceiling — nothing needed folding.`;
  })();

  return (
    <section aria-label="Tone reach" className="mt-5 text-left">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-lg font-bold">Tone reach</h2>
        <p className="mt-1 text-sm text-slate-300">
          The pitch ladder used to climb to G7 ≈ 3136 Hz. That end is exactly
          what age-related hearing loss takes first, so half the alphabet can go
          silent. Measure your own hearing first, then pick a register that fits
          it.
        </p>

        {/* 1 — hearing check */}
        <div
          className="mt-4 rounded-xl border border-cyan-400/40 bg-slate-950/60 p-3"
          aria-label="Hearing check"
        >
          <p className="text-sm font-bold text-cyan-200">
            1 · Hearing check — measure first
          </p>

          {ceiling === null ? (
            <p className="mt-1 text-xs text-slate-400">
              No ceiling measured yet.
            </p>
          ) : (
            <p
              className="mt-1 text-sm font-bold text-white"
              role="status"
              aria-label={`Stored hearing ceiling ${ceiling} hertz`}
            >
              Your ceiling: {ceiling} Hz — tones stay below {ceiling} Hz.
            </p>
          )}

          {checkIdx === null ? (
            <button
              type="button"
              onClick={startCheck}
              aria-label="Run the hearing check"
              className="mt-3 min-h-[56px] w-full rounded-xl bg-cyan-400 px-4 text-base font-black text-slate-950"
            >
              {ceiling === null
                ? "▶ Run the hearing check"
                : "↻ Run the hearing check again"}
            </button>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-slate-200">
                Now playing:{" "}
                <span className="font-mono font-bold text-white">
                  {HEARING_TEST_TONES[checkIdx]} Hz
                </span>{" "}
                (step {checkIdx + 1} of {HEARING_TEST_TONES.length})
              </p>
              <div className="mt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={hearIt}
                  aria-label="I can hear this tone"
                  className="min-h-[56px] rounded-xl bg-emerald-400 px-4 text-base font-black text-slate-950"
                >
                  ✓ I can hear this
                </button>
                <button
                  type="button"
                  onClick={notThis}
                  aria-label="I cannot hear this one"
                  className="min-h-[56px] rounded-xl border-2 border-amber-300 bg-slate-800 px-4 text-base font-bold text-amber-100"
                >
                  ✕ Not this one
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => playTest(HEARING_TEST_TONES[checkIdx])}
                    aria-label="Play this test tone again"
                    className="min-h-[48px] flex-1 rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold"
                  >
                    ↻ Play again
                  </button>
                  <button
                    type="button"
                    onClick={stopCheck}
                    aria-label="Stop the hearing check"
                    className="min-h-[48px] flex-1 rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold"
                  >
                    ■ Stop
                  </button>
                </div>
              </div>
            </div>
          )}

          {msg !== null && (
            <p role="status" className="mt-2 text-xs text-cyan-200">
              {msg}
            </p>
          )}

          <p className="mt-2 text-xs text-slate-400">
            Eight ascending tones, {HEARING_TEST_TONES[0]}–
            {HEARING_TEST_TONES[HEARING_TEST_TONES.length - 1]} Hz,{" "}
            {HEARING_TEST_MS} ms each, played with your chosen waveform. The
            highest one you tap “I can hear this” on becomes your ceiling. Mark
            only what you truly hear — a ceiling that is too high leaves the
            ladder above your reach. You can re-run or clear it at any time.
          </p>

          {ceiling !== null && (
            <button
              type="button"
              onClick={clearCeiling}
              aria-label="Clear the stored hearing ceiling"
              className="mt-2 min-h-[48px] w-full rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold"
            >
              ✕ Clear the stored ceiling ({ceiling} Hz)
            </button>
          )}
        </div>

        {/* 2 — register */}
        <div className="mt-4" aria-label="Tone register">
          <p className="text-sm font-bold text-slate-200">
            2 · Register — the band the 26 letters sit in
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {REGISTER_ORDER.map((id) => {
              const p = REGISTERS[id];
              const on = id === register;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onRegister(id)}
                  aria-pressed={on}
                  aria-label={`${p.label} register, ${p.lo} to ${p.hi} hertz`}
                  className={`min-h-[56px] rounded-xl border-2 px-3 text-left ${
                    on
                      ? "quiz-glow border-cyan-300 bg-slate-800"
                      : "border-slate-600 bg-slate-800"
                  }`}
                >
                  <span className="block text-base font-black text-white">
                    {on ? "✓ " : ""}
                    {p.label} ·{" "}
                    <span className="font-mono text-sm">
                      {bandText(p.lo, p.hi)}
                    </span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {p.blurb}
                  </span>
                </button>
              );
            })}
          </div>

          <p
            className="mt-3 rounded-xl bg-slate-950/60 p-3 font-mono text-sm text-cyan-200"
            aria-label={`Tone plan: letter ${selected} sounds at ${hz.toFixed(1)} hertz, band ${plan.lo.toFixed(1)} to ${plan.hi.toFixed(1)} hertz, waveform ${waveform}`}
          >
            {selected} → {hz.toFixed(1)} Hz (≈ {noteNameOf(hz)})
            <span className="mt-1 block text-xs text-slate-400">
              producing {bandText(plan.lo, plan.hi)} ·{" "}
              {VOICES[waveform].label}
              {plan.foldedOctaves > 0
                ? ` · folded ÷${Math.pow(2, plan.foldedOctaves)} under your ceiling`
                : ""}
            </span>
          </p>

          <p
            className="mt-2 text-xs text-slate-300"
            aria-label="What the ceiling did to the tone plan"
          >
            {foldNote}
          </p>

          <button
            type="button"
            onClick={() => {
              stopRhythm();
              stopWordTimers();
              playTone(hz, 400, 400, waveform, 0.16);
            }}
            aria-label="Play the selected letter's tone"
            className="mt-2 min-h-[48px] w-full rounded-xl border-2 border-cyan-300/60 bg-slate-800 px-3 text-sm font-bold text-cyan-100"
          >
            ▶ Hear {selected} at {hz.toFixed(1)} Hz
          </button>
        </div>

        {/* 3 — waveform */}
        <div className="mt-4" aria-label="Tone voice">
          <p className="text-sm font-bold text-slate-200">
            3 · Voice — the shape of the same gated rhythm
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {VOICE_ORDER.map((id) => {
              const w = VOICES[id];
              const on = id === waveform;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onWaveform(id)}
                  aria-pressed={on}
                  aria-label={`${w.label} waveform`}
                  className={`min-h-[56px] rounded-xl border-2 px-3 text-left ${
                    on
                      ? "quiz-glow border-cyan-300 bg-slate-800"
                      : "border-slate-600 bg-slate-800"
                  }`}
                >
                  <span className="block text-base font-black text-white">
                    {on ? "✓ " : ""}
                    {w.label}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {w.blurb}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            All seven run the identical gate: the same attack, the same dot
            and dash lengths, the same gaps. The piano, the guitar, the drum
            and the 8-bit are <b>synthesised</b> voices — one oscillator with
            a harmonic spectrum each, not sampled instruments — and, like the
            other three, they change timbre only. Dot and dash durations
            cannot change here.
          </p>
        </div>

        {/* 4 — tone output: pings, or a carrier that never stops */}
        <div className="mt-4" aria-label="Tone output mode">
          <p className="text-sm font-bold text-slate-200">
            4 · Tone output — pings, or a carrier that never stops
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {TONE_MODES.map((m) => {
              const on = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onMode(m.id)}
                  aria-pressed={on}
                  aria-label={`${m.label} tone output`}
                  className={`min-h-[56px] rounded-xl border-2 px-3 text-left ${
                    on
                      ? "quiz-glow border-cyan-300 bg-slate-800"
                      : "border-slate-600 bg-slate-800"
                  }`}
                >
                  <span className="block text-base font-black text-white">
                    {on ? "✓ " : ""}
                    {m.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-bold uppercase tracking-wide text-cyan-200">
                    {m.badge}
                  </span>
                  <span className="mt-1 block text-xs text-slate-400">
                    {m.blurb}
                  </span>
                </button>
              );
            })}
          </div>

          {mode === "carrier" && (
            <>
              <p
                className="mt-3 rounded-xl bg-slate-950/60 p-3 font-mono text-sm text-cyan-200"
                aria-label={`Sustained carrier for letter ${selected}: ${hz.toFixed(1)} hertz, band ${plan.lo.toFixed(1)} to ${plan.hi.toFixed(1)} hertz, trough ${Math.abs(CARRIER_DIP_DB).toFixed(1)} decibels below the swell, waveform ${waveform}`}
              >
                {selected} → {hz.toFixed(1)} Hz carried continuously
                <span className="mt-1 block text-xs text-slate-400">
                  swells to a dot or dash · dips {Math.abs(CARRIER_DIP_DB).toFixed(1)}{" "}
                  dB in every gap, never to silence · band {bandText(plan.lo, plan.hi)}{" "}
                  · {VOICES[waveform].label}
                  {plan.foldedOctaves > 0
                    ? ` · folded ÷${Math.pow(2, plan.foldedOctaves)} under your ceiling`
                    : ""}
                </span>
              </p>
              <button
                type="button"
                onClick={() => {
                  stopRhythm();
                  stopWordTimers();
                  startCarrier(
                    carrierScheduleForMorse(byLetter(selected).morse, timing, hz),
                    waveform,
                  );
                }}
                aria-label={`Hear the sustained carrier for the letter ${selected}`}
                className="mt-2 min-h-[48px] w-full rounded-xl border-2 border-cyan-300/60 bg-slate-800 px-3 text-sm font-bold text-cyan-100"
              >
                ▶ Hear {selected} as a sustained carrier at {hz.toFixed(1)} Hz
              </button>
            </>
          )}

          <p className="mt-2 text-xs text-slate-400">
            {mode === "carrier"
              ? `Same rhythm, same pitches, same hearing ceiling as the pings — only the delivery changes. This mode is ours: a real Morse channel keys its carrier fully off between elements, which is why the pings stay the default and the one that transfers to any other Morse channel. Vibration and light are untouched by it.`
              : `The standard delivery, and the one that transfers: energy for the length of each dot or dash and nothing in the gaps. Vibration and light already work this way and are untouched by this choice.`}
          </p>
        </div>

        {/* 4 — honest limit */}
        <div
          className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3"
          aria-label="Vibration limit"
        >
          <p className="text-sm font-bold text-amber-100">
            What this cannot do
          </p>
          <p className="mt-1 text-xs text-amber-100/90">
            Vibration is on/off only. The web Vibration API takes durations and
            nothing else, so a web page cannot choose a frequency for a phone's
            actuator — register and waveform change the{" "}
            <span className="font-semibold">tone channel only</span>, and the
            buzz carries the same Morse durations no matter what is selected
            here. Frequency-tuned haptics would need a native app with direct
            access to the actuator, which a browser does not have.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Sections. The page's areas are grouped into tabs so a phone never   */
/* has to scroll past everything to reach one of them; "classic" keeps */
/* the original long-scroll order, with nothing removed from it.       */
/* ------------------------------------------------------------------ */
type ViewId =
  | "letters"
  | "melody"
  | "lessons"
  | "games"
  | "reference"
  | "setup"
  | "classic";

const VIEWS: { id: ViewId; label: string }[] = [
  { id: "letters", label: "Letters" },
  { id: "melody", label: "Melody" },
  { id: "lessons", label: "Lessons" },
  { id: "games", label: "Games" },
  { id: "reference", label: "A\u2013Z & signs" },
  { id: "setup", label: "Setup" },
  { id: "classic", label: "Classic" },
];

/* One plain line under the buttons saying what the open section holds.
   Tabs hide things, so where you are should never be a guess. */
const VIEW_NOTE: Record<ViewId, string> = {
  letters: "One letter in every channel: pick it, see the glyph, feel it.",
  melody: "Type a word, a phrase or a paragraph and play it as melody.",
  lessons: "Lessons 1\u20135, ending in the flagship phrase.",
  games:
    "The games: a round by ear, a play-along lane, free play and Acorn Tap — in the piano, the guitar, the drum, the 8-bit or a plain voice.",
  reference: "The full A\u2013Z list and all 26 manual-alphabet signs.",
  setup: "Timing profile and tone reach \u2014 how the code is timed and pitched.",
  classic: "Everything on one page, in the original long-scroll order.",
};

const asView = (v: string | null): ViewId =>
  VIEWS.some((x) => x.id === v) ? (v as ViewId) : "letters";

/* A tab's content. Hidden sections stay MOUNTED \u2014 display:none, never
   unmounted \u2014 so every control keeps its own state and a rhythm that is
   playing is not cut short by switching tabs. */
function TabSection({
  show,
  children,
}: {
  show: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ display: show ? "contents" : "none" }} aria-hidden={!show}>
      {children}
    </div>
  );
}

/* ==================================================================== */
/* GAMES — the piano game, and the SHELL the other voices plug into.    */
/*                                                                     */
/* Rules this tab is built to (the owner's, 2026-09-30/2026-10-19):    */
/*  1. No game-specific timing table and no game-specific Hz table,    */
/*     ever. Every note here is an element of the letter's own Morse,  */
/*     placed by the shared `timing` and pitched by the shared tone    */
/*     plan's own hz record — the same object the rest of the page     */
/*     sounds.                                                         */
/*  2. The instrument is a VOICE on the one tone path (see VOICES):    */
/*     envelope + timbre only, one sound envelope per element. Guitar  */
/*     is built as a voice PLUS a skin on the lane (strings, frets,    */
/*     plectrum notes) - paint over this same lane, not a rewrite.     */
/*     The drum is a fourth voice with NO skin, and the 8-bit a fifth,  */
/*     also with none.                                                 */
/*  3. Honest copy: every voice is synthesised, not sampled; nothing   */
/*     here is measured to improve learning, retention or instrument   */
/*     playing, and the page says so rather than hinting at it.        */
/*  4. The shell carries a play-along LANE, not only a quiz: notes     */
/*     arrive at a strike line and a hit is judged on WHEN it landed.  */
/*  5. Playable with mouse and keyboard alone; no phone, no camera,    */
/*     and nothing reads the learner's input.                          */
/*                                                                     */
/* Progress is kept in localStorage only (no analytics, nothing sent). */
/* ==================================================================== */

type GameProgress = {
  roundScore: number;
  roundRounds: number;
  roundCorrect: number;
  bestStreak: number;
  laneRuns: number;
  laneBestCombo: number;
  laneDeadOn: number;
  laneOk: number;
  laneWrongFret: number;
  laneMissed: number;
  laneStray: number;
};

/* ONE PROGRESS BUCKET PER VOICE. A run is written under the voice it was
   played in — morbrai.game.piano, morbrai.game.guitar, morbrai.game.drum,
   morbrai.game.eightbit — so the same run
   can never be counted against two voices. "game.piano" is the historic
   key, so progress saved by earlier sessions still loads unchanged. */
const gameProgressKey = (v: VoiceId) => `game.${v}`;
const GAME_VOICE_KEY = "game.voice";
const GAME_DEFAULT_VOICE: VoiceId = "piano";

const EMPTY_PROGRESS: GameProgress = {
  roundScore: 0,
  roundRounds: 0,
  roundCorrect: 0,
  bestStreak: 0,
  laneRuns: 0,
  laneBestCombo: 0,
  laneDeadOn: 0,
  laneOk: 0,
  laneWrongFret: 0,
  laneMissed: 0,
  laneStray: 0,
};

/* A stored progress record is numbers a previous session actually
   counted. Anything missing, negative or not finite is dropped back to
   zero rather than trusted — a score we cannot stand behind is worse
   than no score. */
function loadProgress(key: string): GameProgress {
  const raw = loadPref(key);
  if (!raw) return { ...EMPTY_PROGRESS };
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof GameProgress, unknown>>;
    const out: GameProgress = { ...EMPTY_PROGRESS };
    (Object.keys(out) as (keyof GameProgress)[]).forEach((k) => {
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0)
        out[k] = Math.floor(v);
    });
    return out;
  } catch {
    return { ...EMPTY_PROGRESS };
  }
}

/* The round's letter pools. "just A" exists so the game can be measured
   on a known letter as well as played. */
const ROUND_POOLS: { id: string; label: string; letters: string[] }[] = [
  { id: "A", label: "just A", letters: ["A"] },
  { id: "AE", label: "A\u2013E", letters: ["A", "B", "C", "D", "E"] },
  { id: "AZ", label: "A\u2013Z", letters: LETTER_ORDER },
];

/* The lane's frets: the NUMBER ROW 1-5. Chosen over the F-key row (what
   Frets on Fire uses) because no laptop needs a Fn key for these, and
   over the home row because those keys are also letters — the round and
   free play both read letters. Matched on event.code (Digit1..Digit5) so
   the same physical keys work on AZERTY and QWERTZ too. */
const LANE_FRETS: { code: string; label: string }[] = [
  { code: "Digit1", label: "1" },
  { code: "Digit2", label: "2" },
  { code: "Digit3", label: "3" },
  { code: "Digit4", label: "4" },
  { code: "Digit5", label: "5" },
];

/* Lane drills. Each set uses at most five DIFFERENT letters, so every
   letter in the lane owns its own fret — no letter is collapsed onto
   another, and no pitch is invented: the fret order is the shared pitch
   plan's own order (low pitch first). */
const LANE_SETS: { id: string; label: string; word: string; blurb: string }[] = [
  { id: "A", label: "A", word: "A", blurb: "one letter \u2014 dot, then dash" },
  { id: "HI", label: "HI", word: "HI", blurb: "two letters, two frets" },
  { id: "SOS", label: "SOS", word: "SOS", blurb: "the classic call" },
  {
    id: "MORSE",
    label: "MORSE",
    word: "MORSE",
    blurb: "five letters \u2014 all five frets",
  },
  {
    id: "TOUCH",
    label: "TOUCH",
    word: "TOUCH",
    blurb: "five letters \u2014 all five frets",
  },
];

/* How a hit is judged. These two windows are OUR hand-tuned numbers, not
   measurements of anything; the page says so where it shows them. */
const LANE_WINDOW_DEAD_ON_MS = 90;
const LANE_WINDOW_OK_MS = 220;
/* Lane geometry: 1 ms of time = this many px of fall. The strike line is
   where a note is due. */
const LANE_PX_PER_MS = 0.09;
const LANE_STRIKE_Y = 196;
const LANE_HEIGHT = 260;
/* A LEAD-IN before the first note is due. Without one, chart zero is the
   instant the button is pressed, so the opening note is already on the
   strike line before a learner can react — it could only ever be hit
   inside the first 220 ms, which is not a human reaction. The count-in is
   three beats of 600 ms: 1.8 s, the same at every timing profile, because
   it is a count-in and not part of the code's own timing. Nothing is
   scored during it. */
const LANE_LEAD_IN_MS = 1800;
const LANE_COUNT_STEP_MS = 600;

type LaneNote = {
  key: string;
  letter: string;
  morse: string;
  i: number; // element index inside the letter
  sym: "." | "-";
  durMs: number;
  atMs: number;
  hz: number;
  fret: number; // 0-based
};

/* Which fret each distinct letter of a lane sits on: the shared pitch
   plan's own order, low pitch first. Never a second Hz table — the order
   is read from the very `hz` record the page sounds. */
function laneFretMap(
  word: string,
  hz: Record<string, number>,
): { letter: string; fret: number }[] {
  const distinct = Array.from(new Set(word.split(""))).filter((c) => c !== " ");
  distinct.sort((a, b) => (hz[a] ?? freqOf(a)) - (hz[b] ?? freqOf(b)));
  return distinct.map((l, i) => ({
    letter: l,
    fret: Math.min(i, LANE_FRETS.length - 1),
  }));
}

/* THE CHART IS THE CODE. One note per Morse element of the word, placed
   by walking the same timeline playMorse uses: element, gap, element...;
   a letter costs its own pattern plus one letter gap. There is no second
   notation here and no chart data of any kind — change the timing
   profile and the whole lane moves with it. */
function buildLane(
  word: string,
  timing: Timing,
  hz: Record<string, number>,
): { notes: LaneNote[]; totalMs: number; frets: { letter: string; fret: number }[] } {
  const frets = laneFretMap(word, hz);
  const fretOf = (l: string) =>
    frets.find((f) => f.letter === l)?.fret ?? 0;
  const letters = word.split("");
  const notes: LaneNote[] = [];
  let t = 0;
  letters.forEach((l, li) => {
    const e = byLetter(l);
    let st = 0;
    [...e.morse].forEach((s, i) => {
      const dur = s === "." ? timing.dotMs : timing.dashMs;
      notes.push({
        key: `${li}-${i}`,
        letter: l,
        morse: e.morse,
        i,
        sym: s === "." ? "." : "-",
        durMs: dur,
        atMs: t + st,
        hz: hz[l] ?? freqOf(l),
        fret: fretOf(l),
      });
      st += dur + timing.elementGapMs;
    });
    const letterMs = patternMs(e.morse, timing);
    const next = letters[li + 1];
    t += next !== undefined ? letterMs + timing.letterGapMs : letterMs;
  });
  return { notes, totalMs: t, frets };
}

type LaneJudge = {
  key: string;
  kind: "dead" | "ok" | "wrong" | "stray";
  deltaMs: number;
  fret: number;
  letter: string;
  note: string;
  text: string;
};

function PianoGame({
  timing,
  hz,
  sound,
}: {
  timing: Timing;
  hz: Record<string, number>;
  sound: boolean;
}) {
  const [voice, setVoice] = useState<VoiceId>(GAME_DEFAULT_VOICE);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<GameProgress>(EMPTY_PROGRESS);
  /* Which voice the loaded `progress` belongs to. Writes are gated on it,
     so switching voice can never copy one voice's numbers into another's
     bucket. */
  const [progressVoice, setProgressVoice] = useState<VoiceId | null>(null);

  /* ---- Mode A: the round ---- */
  const [poolId, setPoolId] = useState("AE");
  const [roundLetter, setRoundLetter] = useState<string | null>(null);
  const [roundPlaying, setRoundPlaying] = useState(false);
  const [roundAnswered, setRoundAnswered] = useState<{
    letter: string;
    said: string;
    ok: boolean;
  } | null>(null);
  const [streak, setStreak] = useState(0);
  const [typed, setTyped] = useState("");

  /* ---- Mode B: the play-along lane ---- */
  const [laneSetId, setLaneSetId] = useState("A");
  const [laneRunning, setLaneRunning] = useState(false);
  const [laneNow, setLaneNow] = useState(0);
  const [laneStartAt, setLaneStartAt] = useState(0);
  const [noteStates, setNoteStates] = useState<
    Record<string, "dead" | "ok" | "wrong">
  >({});
  const [tally, setTally] = useState({
    deadOn: 0,
    ok: 0,
    wrongFret: 0,
    missed: 0,
    stray: 0,
  });
  const [combo, setCombo] = useState(0);
  const [judge, setJudge] = useState<LaneJudge | null>(null);

  /* ---- free play ---- */
  const [freeLetter, setFreeLetter] = useState<string | null>(null);

  /* The running lane is driven from refs: the keyboard listener, the
     animation frame and the audio must agree on ONE start instant and
     ONE note list, no matter how React re-renders underneath them. */
  const gameTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const laneNotesRef = useRef<LaneNote[]>([]);
  const laneTotalRef = useRef(0);
  const laneStartRef = useRef(0);
  const laneRunningRef = useRef(false);
  const judgedRef = useRef<Record<string, "dead" | "ok" | "wrong">>({});

  const laneSet = LANE_SETS.find((s) => s.id === laneSetId) ?? LANE_SETS[0];
  const lane = buildLane(laneSet.word, timing, hz);
  const roundPool = ROUND_POOLS.find((p) => p.id === poolId) ?? ROUND_POOLS[1];

  const clearGameTimers = () => {
    gameTimers.current.forEach(clearTimeout);
    gameTimers.current = [];
  };
  const stopGame = () => {
    clearGameTimers();
    stopRhythm();
    stopWordTimers();
    setRoundPlaying(false);
  };

  /* One letter, one envelope per element, in the game's voice — the same
     playMorse every other surface on the page uses, so the element, the
     letter gap and the word gap are untouched by the game. */
  const hearLetter = (letter: string, onDone?: () => void) => {
    playMorse(byLetter(letter).morse, {
      sound,
      toneMode: "discrete",
      timing,
      freq: hz[letter] ?? freqOf(letter),
      wave: voice,
      onStep: () => undefined,
      onDone: () => {
        if (onDone) onDone();
      },
    });
  };

  /* Remembered voice and progress, read after hydration like every other
     setting on the page, then written only once loaded. */
  useEffect(() => {
    const stored = loadPref(GAME_VOICE_KEY);
    setVoice(stored === null ? GAME_DEFAULT_VOICE : asVoice(stored));
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    savePref(GAME_VOICE_KEY, voice);
  }, [ready, voice]);
  /* Load THAT voice's own bucket whenever the voice changes. The save
     below only runs once the load for this voice has happened, so the
     outgoing voice's numbers are never written into the incoming key. */
  useEffect(() => {
    if (!ready) return;
    setProgress(loadProgress(gameProgressKey(voice)));
    setProgressVoice(voice);
    /* A run summary belongs to the voice it was played in, so it goes
       with the switch instead of sitting above another voice's tally. */
    setJudge(null);
  }, [ready, voice]);
  useEffect(() => {
    if (!ready || progressVoice !== voice) return;
    savePref(gameProgressKey(voice), JSON.stringify(progress));
  }, [ready, voice, progressVoice, progress]);
  useEffect(() => {
    if (combo > progress.laneBestCombo)
      setProgress((p) => ({ ...p, laneBestCombo: combo }));
  }, [combo, progress.laneBestCombo]);
  useEffect(
    () => () => {
      clearGameTimers();
    },
    [],
  );

  /* ---------------------------------------------------------------- */
  /* Mode A — the round                                                */
  /* ---------------------------------------------------------------- */
  const playRound = () => {
    stopGame();
    const letters = roundPool.letters;
    const letter = letters[Math.floor(Math.random() * letters.length)];
    setRoundLetter(letter);
    setRoundAnswered(null);
    setTyped("");
    setRoundPlaying(true);
    setProgress((p) => ({ ...p, roundRounds: p.roundRounds + 1 }));
    hearLetter(letter, () => setRoundPlaying(false));
  };

  const replayRound = () => {
    if (!roundLetter) return;
    stopGame();
    setRoundPlaying(true);
    hearLetter(roundLetter, () => setRoundPlaying(false));
  };

  const answerRound = (said: string) => {
    if (!roundLetter || roundAnswered) return;
    const ok = said === roundLetter;
    setRoundAnswered({ letter: roundLetter, said, ok });
    setTyped(said);
    setStreak((s) => (ok ? s + 1 : 0));
    setProgress((p) => ({
      ...p,
      roundScore: p.roundScore + (ok ? 1 : 0),
      roundCorrect: p.roundCorrect + (ok ? 1 : 0),
      bestStreak: Math.max(p.bestStreak, ok ? streak + 1 : 0),
    }));
  };

  const onTyped = (raw: string) => {
    const v = raw.replace(/[^A-Za-z]/g, "").slice(-1).toUpperCase();
    if (v.length === 1) answerRound(v);
  };

  /* ---------------------------------------------------------------- */
  /* Mode B — the play-along lane                                      */
  /* ---------------------------------------------------------------- */
  const stopLaneRun = (finished: boolean) => {
    if (!laneRunningRef.current) return;
    laneRunningRef.current = false;
    clearGameTimers();
    stopRhythm();
    if (finished) {
      /* Honest tally: a note that was never pressed is a note that was
         missed. It is counted, not quietly dropped. */
      const unjudged = laneNotesRef.current.filter(
        (n) => !judgedRef.current[n.key],
      ).length;
      const total = judgedRef.current;
      const dead = Object.values(total).filter((v) => v === "dead").length;
      const ok = Object.values(total).filter((v) => v === "ok").length;
      const wrong = Object.values(total).filter((v) => v === "wrong").length;
      setTally((prev) => ({ ...prev, missed: prev.missed + unjudged }));
      setProgress((p) => ({
        ...p,
        laneRuns: p.laneRuns + 1,
        laneDeadOn: p.laneDeadOn + dead,
        laneOk: p.laneOk + ok,
        laneWrongFret: p.laneWrongFret + wrong,
        laneMissed: p.laneMissed + unjudged,
      }));
      setCombo(0);
      setLaneNow(laneTotalRef.current);
      setJudge({
        key: "",
        kind: "dead",
        deltaMs: 0,
        fret: 0,
        letter: "",
        note: "",
        text: `run over · dead-on ${dead} · early/late ${ok} · wrong fret ${wrong} · missed ${unjudged}`,
      });
    }
    setLaneRunning(false);
  };

  const startLane = () => {
    stopGame();
    stopLaneRun(false);
    const built = buildLane(laneSet.word, timing, hz);
    laneNotesRef.current = built.notes;
    laneTotalRef.current = built.totalMs;
    judgedRef.current = {};
    setNoteStates({});
    setTally({ deadOn: 0, ok: 0, wrongFret: 0, missed: 0, stray: 0 });
    setCombo(0);
    setJudge(null);
    setLaneNow(0);
    /* The chart's zero sits LANE_LEAD_IN_MS in the future, so the first
       note is due one count-in after the press. Every atMs in the chart is
       untouched — the whole timeline simply starts later, which is what
       keeps the judge, the spacing and the frets exactly as they were. */
    laneStartRef.current = performance.now() + LANE_LEAD_IN_MS;
    setLaneStartAt(laneStartRef.current);
    laneRunningRef.current = true;
    setLaneRunning(true);

    /* The lane sounds as well as falls: the same elements, in the game's
       voice, chained at the same offsets the chart is built from. */
    if (sound) {
      let t = 0;
      laneSet.word.split("").forEach((l) => {
        const at = t;
        gameTimers.current.push(
          setTimeout(() => {
            playMorse(byLetter(l).morse, {
              sound: true,
              toneMode: "discrete",
              timing,
              freq: hz[l] ?? freqOf(l),
              wave: voice,
              onStep: () => undefined,
              onDone: () => undefined,
            });
          }, at + LANE_LEAD_IN_MS),
        );
        t += patternMs(byLetter(l).morse, timing) + timing.letterGapMs;
      });
    }
  };

  /* Animation frame: the fall is a function of elapsed time and the
     note's own scheduled ms, never of a scroll or a CSS animation. */
  useEffect(() => {
    if (!laneRunning) return;
    let raf = 0;
    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const now = performance.now() - laneStartRef.current;
      setLaneNow(now);
      if (now > laneTotalRef.current + 500) {
        stopLaneRun(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [laneRunning]);

  /* Changing the timing, the lane or the VOICE mid-run would leave the
     chart the learner is playing out of step with the sound (or split one
     run across two progress buckets), so a run stops instead. It never
     silently re-times itself, and an abandoned run is not tallied. */
  useEffect(() => {
    stopLaneRun(false);
  }, [timing, laneSetId, voice]);

  const pressFret = (fret: number) => {
    if (!laneRunningRef.current) return;
    const t = performance.now() - laneStartRef.current;
    /* Lead-in: no note is due, so a press here is not a press. It is not a
       stray, it cannot break a combo and it is not tallied — the learner
       is being told when to start, not judged. */
    if (t < 0) return;
    let bestNote: LaneNote | null = null;
    let bestAbs = Infinity;
    for (const n of laneNotesRef.current) {
      if (judgedRef.current[n.key]) continue;
      const d = Math.abs(t - n.atMs);
      if (d <= LANE_WINDOW_OK_MS && d < bestAbs) {
        bestAbs = d;
        bestNote = n;
      }
    }
    if (!bestNote) {
      /* Nothing was due here. Counted as a stray press, combo broken —
         a press that lands nowhere is not a hit. */
      setTally((prev) => ({ ...prev, stray: prev.stray + 1 }));
      setProgress((p) => ({ ...p, laneStray: p.laneStray + 1 }));
      setCombo(0);
      setJudge({
        key: "",
        kind: "stray",
        deltaMs: 0,
        fret,
        letter: "",
        note: "",
        text: `fret ${fret + 1} · no note within \u00b1${LANE_WINDOW_OK_MS} ms of the strike line \u2014 stray press`,
      });
      return;
    }
    const d = Math.round(t - bestNote.atMs); // + = late, - = early
    const noteNameText = laneNoteLabel(bestNote);
    if (bestNote.fret !== fret) {
      judgedRef.current[bestNote.key] = "wrong";
      setNoteStates((prev) => ({ ...prev, [bestNote!.key]: "wrong" }));
      setTally((prev) => ({ ...prev, wrongFret: prev.wrongFret + 1 }));
      setCombo(0);
      setJudge({
        key: bestNote.key,
        kind: "wrong",
        deltaMs: d,
        fret,
        letter: bestNote.letter,
        note: noteNameText,
        text: `wrong fret \u2014 you pressed ${fret + 1}, ${bestNote.letter} is on fret ${bestNote.fret + 1} (${noteNameText})`,
      });
      return;
    }
    const deadOn = Math.abs(d) <= LANE_WINDOW_DEAD_ON_MS;
    judgedRef.current[bestNote.key] = deadOn ? "dead" : "ok";
    setNoteStates((prev) => ({
      ...prev,
      [bestNote!.key]: deadOn ? "dead" : "ok",
    }));
    setTally((prev) =>
      deadOn
        ? { ...prev, deadOn: prev.deadOn + 1 }
        : { ...prev, ok: prev.ok + 1 },
    );
    setCombo((c) => c + 1);
    setJudge({
      key: bestNote.key,
      kind: deadOn ? "dead" : "ok",
      deltaMs: d,
      fret,
      letter: bestNote.letter,
      note: noteNameText,
      text: deadOn
        ? `dead-on · ${d >= 0 ? "+" : "\u2212"}${Math.abs(d)} ms · fret ${fret + 1} · ${bestNote.letter} ${bestNote.sym === "." ? "dot" : "dash"} (${noteNameText})`
        : `${d > 0 ? "late" : "early"} by ${Math.abs(d)} ms · fret ${fret + 1} · ${bestNote.letter} ${bestNote.sym === "." ? "dot" : "dash"} (${noteNameText})`,
    });
  };

  /* The keyboard is the instrument: the number row, matched on
     event.code. Bound only while a run is live, so it can never swallow
     keystrokes the rest of the page needs. */
  useEffect(() => {
    if (!laneRunning) return;
    const onKey = (e: KeyboardEvent) => {
      const i = LANE_FRETS.findIndex((f) => f.code === e.code);
      if (i < 0) return;
      e.preventDefault();
      pressFret(i);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [laneRunning]);

  /* The guitar SKIN follows the guitar VOICE: the same lane, the same
     notes, the same frets, the same judge — dressed as five strings and
     a fretboard. Paint only: no geometry, no timing, no scoring change. */
  const laneGuitar = voice === "guitar";
  const usedFrets = lane.frets.map((f) => ({
    ...f,
    noteName: noteNameOf(hz[f.letter] ?? freqOf(f.letter)),
    hz: hz[f.letter] ?? freqOf(f.letter),
  }));

  return (
    <section aria-label="Games" className="mt-8">
      <h2 className="text-lg font-bold">
        Games · one shell, many voices — {VOICES[voice].label}
      </h2>
      <p className="mt-1 text-sm text-slate-300">
        Play the code as music. Every note in this tab is one element of the
        letter's own Morse, placed by the page's one timing model and pitched by
        the page's one tone plan — the game has no timing table and no Hz table of
        its own.
      </p>
      <p className="mt-2 rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-xs text-amber-100">
        <b>Honest about the voices:</b> every voice here is{" "}
        <b>synthesised</b> — one oscillator carrying a harmonic spectrum,
        not a sampled instrument and not a recording. These games practise{" "}
        <b>recognising letters by ear</b> and{" "}
        <b>playing the letter's rhythm in time</b>. Whether that improves
        learning, retention or playing an instrument is <b>unmeasured</b>: we
        have no evidence for it and are not claiming it. Playable with a mouse
        and keyboard alone; no phone needed, no microphone, and nothing reads
        your input.
      </p>
      {laneGuitar && (
        <p className="mt-2 rounded-xl border border-cyan-400/40 bg-cyan-400/10 p-3 text-xs text-cyan-50">
          <b>The guitar voice:</b> synthesised — a plucked-string harmonic
          spectrum from one oscillator, <b>not a sampled guitar</b>. The lane is
          dressed as five strings and five frets, but there are no strings and
          no fret positions here: the frets are the number row. This practises
          rhythm, timing and pitch discrimination. It does <b>not</b> teach
          guitar — no strings, no fret positions, no chord shapes — and
          nothing on this page is measured to improve learning, retention or
          any skill.
        </p>
      )}
      {voice === "drum" && (
        <p className="mt-2 rounded-xl border border-fuchsia-400/40 bg-fuchsia-400/10 p-3 text-xs text-fuchsia-50">
          <b>The drum voice:</b> synthesised — a hollow, odd-heavy struck
          spectrum from the same <b>one oscillator</b> and the same{" "}
          <b>gated engine</b> as every other voice here, <b>not a sampled
          drum</b> and not a recording. The gate holds each dot for{" "}
          {timing.dotMs} ms and each dash for {timing.dashMs} ms before it
          rings out: the element length is the code, so this voice changes
          timbre only and never shortens a note. It practises rhythm, timing
          and pitch discrimination. It does <b>not</b> teach drums or any
          other instrument, and nothing on this page is measured to improve
          learning, retention or any skill.
        </p>
      )}
      {voice === "eightbit" && (
        <p className="mt-2 rounded-xl border border-emerald-400/40 bg-emerald-400/10 p-3 text-xs text-emerald-50">
          <b>The 8-bit voice:</b> synthesised — the harmonic spectrum of a
          quarter-width pulse wave from the same <b>one oscillator</b> and the
          same <b>gated engine</b> as every other voice here, <b>not a sample,
          not a recording and not a console</b>. The gate holds each dot for{" "}
          {timing.dotMs} ms and each dash for {timing.dashMs} ms before it
          rings out: the element length is the code, so this voice changes
          timbre only and never shortens a note. It practises rhythm, timing
          and pitch discrimination. It does <b>not</b> teach chip music,
          composition or any instrument, and nothing on this page is measured
          to improve learning, retention or any skill.
        </p>
      )}
      {!sound && (
        <p
          role="status"
          className="mt-2 rounded-xl border border-rose-400/50 bg-rose-500/10 p-3 text-xs text-rose-100"
        >
          Tone is switched off on this page. The games play through the tone
          path, so switch sound on (Letters tab) before playing.
        </p>
      )}

      <p
        aria-label="Piano game progress"
        className="mt-3 rounded-xl bg-slate-950/60 p-3 font-mono text-sm text-cyan-200"
      >
        score {progress.roundScore} · rounds {progress.roundRounds} · correct{" "}
        {progress.roundCorrect} · streak {streak} · best streak{" "}
        {progress.bestStreak}
        <span
          aria-label="Progress bucket"
          className="mt-1 block text-xs text-cyan-300"
        >
          {VOICES[voice].label} voice · kept separately under{" "}
          <code>morbrai.{gameProgressKey(voice)}</code>
        </span>
        <span className="mt-1 block text-xs text-slate-400">
          kept in this browser only (localStorage) · no analytics, nothing sent
          anywhere ·{" "}
          <button
            type="button"
            onClick={() => {
              setProgress({ ...EMPTY_PROGRESS });
              setStreak(0);
              setTally({ deadOn: 0, ok: 0, wrongFret: 0, missed: 0, stray: 0 });
              setCombo(0);
              setRoundAnswered(null);
              setJudge(null);
            }}
            aria-label="Reset the piano game's saved progress for this voice"
            className="underline decoration-dotted"
          >
            reset saved progress
          </button>
        </span>
      </p>

      {/* ------------------------------------------------ voice picker */}
      <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-3" aria-label="Game voice">
        <p className="text-sm font-bold text-slate-200">
          The voice — one shell, many voices
        </p>
        <p className="mt-1 text-xs text-slate-400">
          The game plays through the same tone path as everything else, so a
          voice changes timbre only — never the rhythm. Each voice keeps its
          own progress, and the guitar voice also brings its own skin: pick{" "}
          <b>Guitar</b> and the lane becomes five strings and five frets. The
          drum voice brings no skin — the lane stays a keyboard, and so does
          the 8-bit voice. All four are the same shell, the same chart, the
          same frets and the same judge.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {VOICE_ORDER.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setVoice(id)}
              aria-pressed={voice === id}
              aria-label={`Game voice: ${VOICES[id].label}`}
              className={`min-h-[44px] rounded-xl border-2 px-3 text-sm font-bold ${
                voice === id
                  ? "border-cyan-300 bg-slate-800 text-white"
                  : "border-slate-600 bg-slate-800 text-slate-200"
              }`}
            >
              {voice === id ? "✓ " : ""}
              {VOICES[id].label}
            </button>
          ))}
        </div>
      </div>

      {/* --------------------------------------------------- mode A */}
      <div
        className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-3"
        aria-label="Piano game round"
      >
        <h3 className="text-base font-bold">
          Mode A · the round — name the letter you hear
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          The game plays one letter's Morse in the {VOICES[voice].label} voice,
          one sound per element. Answer with the letter you heard; right or
          wrong is shown straight away and the streak and score keep counting.
        </p>
        <p
          aria-label="Round timing"
          className="mt-2 font-mono text-[11px] leading-5 text-slate-300"
        >
          {timing.profile === "standard"
            ? "Standard (ITU) Morse"
            : "Morbraii spacing (ours, not ITU)"}
          {" · "}dot {timing.dotMs} ms · dash {timing.dashMs} ms · element gap{" "}
          {timing.elementGapMs} ms · letter gap {timing.letterGapMs} ms ·{" "}
          {timing.wpm.toFixed(1)} wpm
        </p>
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Round letters">
          {ROUND_POOLS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPoolId(p.id);
                setRoundAnswered(null);
              }}
              aria-pressed={poolId === p.id}
              aria-label={`Round letters: ${p.label}`}
              className={`min-h-[44px] rounded-xl border-2 px-3 text-sm font-bold ${
                poolId === p.id
                  ? "border-cyan-300 bg-slate-800 text-white"
                  : "border-slate-600 bg-slate-800 text-slate-200"
              }`}
            >
              {poolId === p.id ? "✓ " : ""}
              {p.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={playRound}
          aria-label="Play the next round letter"
          className="mt-2 min-h-[48px] w-full rounded-xl border-2 border-cyan-300/60 bg-slate-800 px-3 text-sm font-bold text-cyan-100"
        >
          ▶ {roundLetter ? "Play another letter" : "Play a letter"}
        </button>
        {roundPlaying && (
          <p role="status" aria-label="Round status" className="mt-2 text-xs text-slate-300">
            playing…
          </p>
        )}
        <input
          type="text"
          value={typed}
          onChange={(e) => onTyped(e.target.value)}
          aria-label="Type the letter you heard"
          placeholder="type the letter you heard"
          className="mt-2 min-h-[48px] w-full rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-white"
        />
        <div className="mt-2 grid grid-cols-6 gap-2 sm:grid-cols-7">
          {LETTER_ORDER.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => answerRound(l)}
              aria-label={`Answer ${l}`}
              className={`min-h-[44px] rounded-xl text-base font-black ${
                roundAnswered && roundAnswered.said === l
                  ? roundAnswered.ok
                    ? "bg-emerald-400 text-slate-950"
                    : "bg-rose-400 text-slate-950"
                  : "bg-slate-800 text-slate-100"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <p
          role="status"
          aria-label="Round result"
          className={`mt-2 rounded-xl p-3 text-sm ${
            roundAnswered?.ok
              ? "bg-emerald-400/15 text-emerald-100"
              : roundAnswered
                ? "bg-rose-400/15 text-rose-100"
                : "bg-slate-950/60 text-slate-300"
          }`}
        >
          {roundAnswered
            ? `${roundAnswered.ok ? "✓ right" : "✗ not this time"} — it was ${roundAnswered.letter} (${byLetter(roundAnswered.letter).morse})${
                roundAnswered.ok ? "" : ` · you said ${roundAnswered.said}`
              }`
            : "No answer yet — play a letter, then answer."}
        </p>
        {roundLetter && (
          <button
            type="button"
            onClick={replayRound}
            aria-label="Play that letter again"
            className="mt-2 min-h-[44px] w-full rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-slate-100"
          >
            ▶ Hear that one again
          </button>
        )}
      </div>

      {/* --------------------------------------------------- mode B */}
      <div
        className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-3"
        aria-label="Play-along lane"
      >
        <h3 className="text-base font-bold">
          Mode B · the play-along lane — press each note at the strike line
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Notes fall to the strike line, one per Morse element of the lane's
          letters, at the shared unit and the shared pitches. The frets are the{" "}
          <b>number row 1–5</b> (read as <code>Digit1</code>–
          <code>Digit5</code>, so a non-US keyboard works) — click a fret with
          the mouse if you prefer. Each letter in a lane owns its own fret, low
          pitch first. A hit is judged on <b>when</b> you pressed — dead-on
          within ±{LANE_WINDOW_DEAD_ON_MS} ms, otherwise early or late within
          ±{LANE_WINDOW_OK_MS} ms — as well as on the fret. Those two windows
          are our own hand-tuned numbers, not measurements.
        </p>
        <p className="mt-1 text-xs text-slate-400">
          <b>Start runs a count-in</b> — three beats, {LANE_LEAD_IN_MS} ms
          in all, shown counting down over the lane — before the first note
          is due. A press during the count-in is ignored: it is not a stray,
          it cannot break a combo and it is not tallied.
        </p>
        <p aria-label="Lane skin" className="mt-1 text-xs text-cyan-200">
          {laneGuitar
            ? "Guitar skin on the lane: five strings, one per fret, a fretboard band at the strike line and a fret strip along the bottom. It is the SAME lane \u2014 same notes, same frets, same count-in, same judge \u2014 in guitar clothes."
            : "Keyboard skin on the lane. Pick the Guitar voice above and the same lane turns into five strings and five frets."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Lane letters">
          {LANE_SETS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setLaneSetId(s.id)}
              aria-pressed={laneSetId === s.id}
              aria-label={`Lane: ${s.label} — ${s.blurb}`}
              className={`min-h-[44px] rounded-xl border-2 px-3 text-sm font-bold ${
                laneSetId === s.id
                  ? "border-cyan-300 bg-slate-800 text-white"
                  : "border-slate-600 bg-slate-800 text-slate-200"
              }`}
            >
              {laneSetId === s.id ? "✓ " : ""}
              {s.label}
            </button>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-5 gap-2" aria-label="Frets">
          {LANE_FRETS.map((f, i) => {
            const used = usedFrets.find((u) => u.fret === i);
            return (
              <button
                key={f.code}
                type="button"
                onClick={() => pressFret(i)}
                aria-label={`Fret ${i + 1} (key ${f.label})${
                  used
                    ? `: ${used.letter} — ${used.noteName}, ${used.hz.toFixed(1)} hertz`
                    : ": unused by this lane"
                }`}
                className={`min-h-[52px] rounded-xl border-2 px-1 text-center text-[11px] font-bold leading-tight ${
                  used
                    ? "border-slate-600 bg-slate-800 text-slate-100"
                    : "border-slate-800 bg-slate-900 text-slate-600"
                }`}
              >
                <span className="block text-sm font-black">{f.label}</span>
                {used ? (
                  <span className="block font-mono text-[10px] text-cyan-200">
                    {used.letter} {used.noteName}
                  </span>
                ) : (
                  <span className="block font-mono text-[10px]">—</span>
                )}
                {used && (
                  <span className="block font-mono text-[10px] text-slate-400">
                    {used.hz.toFixed(0)} Hz
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={startLane}
            aria-label="Start the play-along lane"
            className="min-h-[48px] flex-1 rounded-xl border-2 border-cyan-300/60 bg-slate-800 px-3 text-sm font-bold text-cyan-100"
          >
            ▶ Start the lane
          </button>
          <button
            type="button"
            onClick={() => {
              stopLaneRun(false);
              stopGame();
              setJudge(null);
            }}
            aria-label="Stop the play-along lane"
            className="min-h-[48px] flex-1 rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-slate-100"
          >
            ■ Stop
          </button>
        </div>
        <div
          aria-label="Lane"
          data-lane-running={laneRunning ? "1" : "0"}
          data-lane-now={Math.round(laneNow)}
          data-lane-start={Math.round(laneStartAt)}
          data-lane-total={laneTotalRef.current || lane.totalMs}
          data-lane-notes={lane.notes.length}
          data-lane-lead-in={LANE_LEAD_IN_MS}
          data-lane-skin={laneGuitar ? "guitar" : "keys"}
          data-lane-voice={voice}
          className="relative mt-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-950"
          style={{ height: LANE_HEIGHT }}
        >
          {/* THE GUITAR SKIN — nothing but paint. Five strings, one per
              fret, a fretboard band behind the strike line and a fret
              marker strip along the bottom. Every note, every atMs and
              every fret below is the same lane the other voices play. */}
          {laneGuitar && (
            <>
              <div aria-hidden className="absolute inset-0">
                {LANE_FRETS.map((f, i) => {
                  const used = usedFrets.some((u) => u.fret === i);
                  return (
                    <div
                      key={f.code}
                      className="absolute top-0 bottom-0"
                      style={{
                        left: `${((i + 0.5) / LANE_FRETS.length) * 100}%`,
                        width: used ? 3 : 1,
                        transform: "translateX(-50%)",
                        backgroundColor: used
                          ? "rgba(148,163,184,0.75)"
                          : "rgba(71,85,105,0.45)",
                      }}
                    />
                  );
                })}
                <div
                  className="absolute left-0 right-0"
                  style={{
                    top: LANE_STRIKE_Y - 9,
                    height: 18,
                    backgroundColor: "rgba(30,41,59,0.85)",
                    borderTop: "1px solid rgba(148,163,184,0.35)",
                    borderBottom: "1px solid rgba(148,163,184,0.35)",
                  }}
                />
              </div>
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 flex border-t border-slate-700 bg-slate-950/80"
              >
                {LANE_FRETS.map((f, i) => {
                  const used = usedFrets.find((u) => u.fret === i);
                  return (
                    <div
                      key={f.code}
                      className="flex-1 px-1 text-center leading-tight"
                    >
                      <span className="text-[9px] font-black text-slate-400">
                        {f.label}
                      </span>
                      {used && (
                        <span className="block font-mono text-[8px] text-cyan-300">
                          {used.letter} {used.noteName}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {laneRunning && laneNow < 0 && (
            <div
              role="status"
              aria-label="Count-in"
              data-count-in={Math.max(
                1,
                Math.ceil(-laneNow / LANE_COUNT_STEP_MS),
              )}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/85"
            >
              <p className="text-5xl font-black leading-none text-cyan-200">
                {Math.max(1, Math.ceil(-laneNow / LANE_COUNT_STEP_MS))}
              </p>
              <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-300">
                get ready — first note after the count
              </p>
              <div
                aria-hidden
                className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-slate-700"
              >
                <div
                  className="h-full bg-cyan-300"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, (-laneNow / LANE_LEAD_IN_MS) * 100),
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div
            aria-hidden
            className="absolute left-0 right-0 border-t-2 border-cyan-300"
            style={{ top: LANE_STRIKE_Y }}
          />
          <span
            aria-hidden
            className="absolute left-1 text-[10px] font-bold uppercase tracking-widest text-cyan-300"
            style={{ top: LANE_STRIKE_Y + 4 }}
          >
            {laneGuitar ? "strings \u00b7 pick here" : "strike line"}
          </span>
          {lane.notes.map((n, i) => {
            const w = Math.max(18, n.durMs * LANE_PX_PER_MS);
            const top = LANE_STRIKE_Y - (n.atMs - laneNow) * LANE_PX_PER_MS;
            if (top < -30 || top > LANE_HEIGHT + 30) return null;
            const st = noteStates[n.key];
            return (
              <div
                key={n.key}
                data-note-key={n.key}
                data-note-index={i}
                data-note-letter={n.letter}
                data-note-sym={n.sym}
                data-note-at={n.atMs}
                data-note-dur={n.durMs}
                data-note-fret={n.fret + 1}
                data-note-hz={n.hz.toFixed(1)}
                data-note-note={noteNameOf(n.hz)}
                data-note-state={st ?? "pending"}
                data-note-skin={laneGuitar ? "pick" : "note"}
                className={`absolute flex items-center justify-center overflow-hidden rounded-md border text-[9px] font-black ${
                  st === "dead"
                    ? "border-emerald-200 bg-emerald-400 text-slate-950"
                    : st === "ok"
                      ? "border-amber-200 bg-amber-400 text-slate-950"
                      : st === "wrong"
                        ? "border-rose-200 bg-rose-500 text-slate-950"
                        : "border-cyan-200 bg-cyan-400/80 text-slate-950"
                }`}
                style={{
                  top,
                  height: 18,
                  width: w,
                  left: `${((n.fret + 0.5) / LANE_FRETS.length) * 100}%`,
                  transform: "translateX(-50%)",
                  /* Guitar skin only: the note is drawn as a plectrum.
                     Same box, same top, same width, same state colours. */
                  ...(laneGuitar
                    ? {
                        clipPath:
                          "polygon(0% 0%, 100% 0%, 100% 55%, 50% 100%, 0% 55%)",
                      }
                    : {}),
                }}
                title={`${n.letter} ${n.sym === "." ? "dot" : "dash"} · ${noteNameOf(n.hz)} ${n.hz.toFixed(1)} Hz · fret ${n.fret + 1} · due ${n.atMs} ms`}
              >
                {w >= 44 ? `${n.letter} ${noteNameOf(n.hz)}` : ""}
              </div>
            );
          })}
        </div>
        <p
          role="status"
          aria-label="Lane judge"
          className={`mt-2 rounded-xl p-3 text-sm ${
            judge?.kind === "dead"
              ? "bg-emerald-400/15 text-emerald-100"
              : judge?.kind === "wrong" || judge?.kind === "stray"
                ? "bg-rose-400/15 text-rose-100"
                : judge?.kind === "ok"
                  ? "bg-amber-400/15 text-amber-100"
                  : "bg-slate-950/60 text-slate-300"
          }`}
        >
          {judge ? judge.text : "No key pressed yet."}
        </p>
        <p
          aria-label="Lane tally"
          className="mt-1 font-mono text-[11px] leading-5 text-slate-300"
        >
          dead-on {tally.deadOn} · early/late {tally.ok} · wrong fret{" "}
          {tally.wrongFret} · missed {tally.missed} · stray {tally.stray} · combo{" "}
          {combo} · best combo {progress.laneBestCombo} · runs {progress.laneRuns}
        </p>
        <p
          aria-label="Lane chart"
          className="mt-1 font-mono text-[10px] leading-4 text-slate-400"
        >
          {laneSet.label} · {lane.notes.length} notes ·{" "}
          {lane.notes
            .map(
              (n) =>
                `${n.letter}${n.sym} @${n.atMs}ms (${n.durMs}ms) f${n.fret + 1} ${noteNameOf(n.hz)}`,
            )
            .join(" · ")}
        </p>
      </div>

      {/* ------------------------------------------------ free play */}
      <div
        className="mt-4 rounded-2xl border border-slate-700 bg-slate-900/60 p-3"
        aria-label="Free play"
      >
        <h3 className="text-base font-bold">
          Free play — press a key, hear that letter
        </h3>
        <p className="mt-1 text-xs text-slate-400">
          Any letter A–Z played in the {VOICES[voice].label} voice: one note per
          element, at the page's timing and the page's pitch.
        </p>
        <input
          type="text"
          readOnly
          value=""
          onKeyDown={(e) => {
            const k = e.key.toUpperCase();
            if (/^[A-Z]$/.test(k)) {
              e.preventDefault();
              stopGame();
              setFreeLetter(k);
              hearLetter(k);
            }
          }}
          aria-label="Free play: press a letter from A to Z"
          placeholder="press a letter A–Z here"
          className="mt-2 min-h-[48px] w-full rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-white"
        />
        <p
          aria-label="Free play letter"
          className="mt-2 rounded-xl bg-slate-950/60 p-3 font-mono text-sm text-cyan-200"
        >
          {freeLetter
            ? `${freeLetter} · ${byLetter(freeLetter).morse} · ${noteNameOf(
                hz[freeLetter] ?? freqOf(freeLetter),
              )} · ${(hz[freeLetter] ?? freqOf(freeLetter)).toFixed(1)} Hz`
            : "nothing played yet"}
        </p>
      </div>
      {/* ------------------------------------------- Morbraii Mission */}
      <AcornGame timing={timing} hz={hz} sound={sound} voice={voice} />
    </section>
  );
}

/* ==================================================================== */
/* MORBRAII MISSION — ACORN TAP (the owner's game, asked for 2026-10-27: */
/* "acorns falling and you have to tap the Morse letter or phrase").    */
/*                                                                     */
/* Two directions, ONE judge:                                          */
/*   A · read the code  — the acorn shows the letter's Morse elements  */
/*                        as shapes; the player taps the letter.       */
/*   B · know the code  — the acorn shows the letter; the player taps  */
/*                        the matching Morse pattern.                  */
/*                                                                     */
/* Rules this game keeps, the same ones the whole tab keeps:           */
/*  1. The acorn's sound is the letter's own Morse — one envelope per   */
/*     element, placed by the shared `timing`, pitched by the shared    */
/*     tone plan's own hz record, in the voice the player picked. No    */
/*     timing table of its own and no pitch table of its own.          */
/*  2. The acorn's FALL is UI pacing only: how long the player has to   */
/*     answer. It is never fed back into the sound, and no code value   */
/*     changes with difficulty.                                        */
/*  3. Difficulty moves the number of choices (3 → 4 → 6) and the fall  */
/*     time, and nothing else.                                         */
/*  4. Progress is one bucket per MODE — morbrai.game.acorn.read and    */
/*     morbrai.game.acorn.know — the per-voice pattern, so a run is     */
/*     never counted twice.                                            */
/*  5. No camera, no microphone, no hand tracking, no new promise. The  */
/*     answer check is ONE function, `judgeAcornAnswer`, so a later ASL */
/*     hand-landmark input can call exactly the same check. Nothing on  */
/*     this page reads your hand and nothing here is ASL recognition.   */
/* ==================================================================== */
type AcornMode = "read" | "know";

const ACORN_MODES: { id: AcornMode; label: string; blurb: string }[] = [
  {
    id: "read",
    label: "A · read the code",
    blurb: "the acorn shows the Morse — tap the letter",
  },
  {
    id: "know",
    label: "B · know the code",
    blurb: "the acorn shows the letter — tap the Morse",
  },
];

/* One bucket per MODE, following the per-voice pattern. The two
   directions ask different questions, so their numbers are never added
   together and a catch is never counted in both. */
const acornBucket = (m: AcornMode) => `game.acorn.${m}`;

type AcornProgress = {
  caught: number;
  wrongTaps: number;
  missed: number;
  bestStreak: number;
};

const EMPTY_ACORN_PROGRESS: AcornProgress = {
  caught: 0,
  wrongTaps: 0,
  missed: 0,
  bestStreak: 0,
};

/* Same rules as loadProgress: a stored number we cannot stand behind
   (missing, negative, not finite) is dropped back to zero. */
function loadAcornProgress(key: string): AcornProgress {
  const raw = loadPref(key);
  if (!raw) return { ...EMPTY_ACORN_PROGRESS };
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof AcornProgress, unknown>>;
    const out: AcornProgress = { ...EMPTY_ACORN_PROGRESS };
    (Object.keys(out) as (keyof AcornProgress)[]).forEach((k) => {
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v) && v >= 0)
        out[k] = Math.floor(v);
    });
    return out;
  } catch {
    return { ...EMPTY_ACORN_PROGRESS };
  }
}

/* The letter pools an acorn can be drawn from. "just A" and "just E"
   exist so a run can be measured on a known letter as well as played. */
const ACORN_POOLS: { id: string; label: string; letters: string[] }[] = [
  { id: "A", label: "just A", letters: ["A"] },
  { id: "E", label: "just E", letters: ["E"] },
  { id: "AE", label: "A–E", letters: ["A", "B", "C", "D", "E"] },
  { id: "AZ", label: "A–Z", letters: LETTER_ORDER },
];

/* THE JUDGE. One function, and the only place a tap is called right or
   wrong. `mode` says which way the round runs, `target` is the letter
   the acorn carries, `answer` is what the player offered — a letter in
   mode A, a Morse string in mode B. It returns the verdict AND what the
   right answer was, so the screen can say both.
   A future ASL hand-landmark input resolves a hand to a letter and calls
   THIS function; there is no second copy of this rule anywhere, and no
   camera code exists to call it with. */
function judgeAcornAnswer(
  mode: AcornMode,
  target: string,
  answer: string,
): { ok: boolean; expected: string } {
  const expected = mode === "read" ? target : byLetter(target).morse;
  return { ok: answer === expected, expected };
}

/* Difficulty: more choices and a shorter fall, and nothing else. Both
   read only how many acorns this mode has already caught. */
const acornChoiceCount = (caught: number) =>
  caught < 3 ? 3 : caught < 8 ? 4 : 6;
const ACORN_FALL_MS_START = 7000; // the longest a player gets to answer
const ACORN_FALL_MS_MIN = 4200;
const acornFallMs = (caught: number) =>
  Math.max(ACORN_FALL_MS_MIN, ACORN_FALL_MS_START - caught * 350);

/* The answers offered for one acorn: the right one plus distractors
   whose PATTERN differs, so no two buttons ever mean the same thing.
   A pool too small for the choice count (e.g. "just A") falls back to
   the whole alphabet rather than offering a duplicate button. */
function acornChoices(
  mode: AcornMode,
  target: string,
  count: number,
  pool: string[],
): string[] {
  const answerOf = (l: string) => (mode === "read" ? l : byLetter(l).morse);
  const right = answerOf(target);
  const seen = new Set<string>([right]);
  const others: string[] = [];
  const take = (letters: string[]) => {
    for (const l of [...letters].sort(() => Math.random() - 0.5)) {
      const a = answerOf(l);
      if (seen.has(a)) continue;
      seen.add(a);
      others.push(a);
      if (others.length >= count - 1) return;
    }
  };
  take(pool.filter((l) => l !== target));
  if (others.length < count - 1) take(LETTER_ORDER);
  return [right, ...others].sort(() => Math.random() - 0.5);
}

/* Dots and dashes as SHAPES — the same shapes on the acorn and on the
   answer buttons, so mode B can be answered without reading Morse text
   anywhere. */
function MorseShapes({ morse, big }: { morse: string; big?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" aria-hidden="true">
      {[...morse].map((s, i) =>
        s === "." ? (
          <span
            key={i}
            className={`inline-block rounded-full bg-current ${
              big ? "h-3.5 w-3.5" : "h-3 w-3"
            }`}
          />
        ) : (
          <span
            key={i}
            className={`inline-block rounded-full bg-current ${
              big ? "h-3.5 w-10" : "h-3 w-8"
            }`}
          />
        ),
      )}
    </span>
  );
}

/* Chute geometry in CSS px: the box, and how far an acorn travels in it. */
const ACORN_CHUTE_PX = 240;
const ACORN_TRAVEL_PX = 132;

function AcornGame({
  timing,
  hz,
  sound,
  voice,
}: {
  timing: Timing;
  hz: Record<string, number>;
  sound: boolean;
  voice: VoiceId;
}) {
  const [mode, setMode] = useState<AcornMode>("read");
  const [poolId, setPoolId] = useState("AE");
  const [running, setRunning] = useState(false);
  const [letter, setLetter] = useState<string | null>(null);
  const [choices, setChoices] = useState<string[]>([]);
  const [ruledOut, setRuledOut] = useState<string[]>([]);
  const [frac, setFrac] = useState(0);
  const [streak, setStreak] = useState(0);
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [progress, setProgress] = useState<AcornProgress>(
    EMPTY_ACORN_PROGRESS,
  );
  const [ready, setReady] = useState(false);
  /* Which mode the loaded `progress` belongs to: writes are gated on it,
     so switching mode can never copy one mode's numbers into another's. */
  const [bucketMode, setBucketMode] = useState<AcornMode | null>(null);

  const chuteRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef(0); // performance.now() the acorn started falling
  const fallRef = useRef(ACORN_FALL_MS_START); // UI pacing only
  const fracRef = useRef(0);
  const acornRef = useRef<string | null>(null);
  const runningRef = useRef(false);
  const modeRef = useRef<AcornMode>("read");
  const streakRef = useRef(0);
  const ruledOutRef = useRef<string[]>([]);
  const progressRef = useRef<AcornProgress>(EMPTY_ACORN_PROGRESS);
  const spawnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pool = ACORN_POOLS.find((p) => p.id === poolId) ?? ACORN_POOLS[2];
  const modeLabel = ACORN_MODES.find((m) => m.id === mode)?.label ?? "A";

  /* Remembered progress, read after hydration like every other setting
     on the page, then written only once it has loaded. */
  useEffect(() => {
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const loaded = loadAcornProgress(acornBucket(mode));
    progressRef.current = loaded;
    setProgress(loaded);
    setBucketMode(mode);
    modeRef.current = mode;
  }, [ready, mode]);
  useEffect(() => {
    if (!ready || bucketMode !== mode) return;
    progressRef.current = progress;
    savePref(acornBucket(mode), JSON.stringify(progress));
  }, [ready, mode, bucketMode, progress]);
  useEffect(
    () => () => {
      if (spawnTimer.current) clearTimeout(spawnTimer.current);
      stopRhythm();
    },
    [],
  );

  /* One letter, one envelope per element, in the picked voice — the same
     playMorse every other surface on the page uses. */
  const soundAcorn = (l: string) => {
    if (!sound) return;
    playMorse(byLetter(l).morse, {
      sound: true,
      toneMode: "discrete",
      timing,
      freq: hz[l] ?? freqOf(l),
      wave: voice,
      onStep: () => undefined,
      onDone: () => undefined,
    });
  };

  const bumpStreak = (v: number) => {
    streakRef.current = v;
    setStreak(v);
  };
  const setRuled = (v: string[]) => {
    ruledOutRef.current = v;
    setRuledOut(v);
  };

  const scheduleNext = () => {
    if (spawnTimer.current) clearTimeout(spawnTimer.current);
    spawnTimer.current = setTimeout(() => {
      if (!runningRef.current) return;
      beginRef.current();
    }, 650);
  };

  const missAcorn = () => {
    const l = acornRef.current;
    if (!l) return;
    acornRef.current = null;
    setLetter(null);
    fracRef.current = 0;
    setFrac(0);
    bumpStreak(0);
    setProgress((p) => ({ ...p, missed: p.missed + 1 }));
    setVerdict({
      ok: false,
      text: `missed · it was ${l} · ${byLetter(l).morse}`,
    });
    scheduleNext();
  };
  const missRef = useRef(missAcorn);
  missRef.current = missAcorn;

  /* ---- one acorn: pick the letter, the choices, the fall time and the
     sound. Reassigned on every render, so a timer scheduled by an older
     render still reads the current mode, pool, voice and timings. ---- */
  const beginRef = useRef<() => void>(() => undefined);
  beginRef.current = () => {
    const letters = pool.letters;
    const l = letters[Math.floor(Math.random() * letters.length)];
    const caught = progressRef.current.caught;
    /* The fall time is pacing, decided here and used ONLY by the
       animation. ACORN_FALL_MS_* never reaches playMorse. */
    fallRef.current = acornFallMs(caught);
    acornRef.current = l;
    fracRef.current = 0;
    startRef.current = performance.now();
    setLetter(l);
    setChoices(acornChoices(mode, l, acornChoiceCount(caught), letters));
    setRuled([]);
    setFrac(0);
    soundAcorn(l);
  };

  const stopRun = () => {
    runningRef.current = false;
    if (spawnTimer.current) {
      clearTimeout(spawnTimer.current);
      spawnTimer.current = null;
    }
    acornRef.current = null;
    stopRhythm();
    setRunning(false);
    setLetter(null);
    setChoices([]);
    setRuled([]);
    fracRef.current = 0;
    setFrac(0);
  };

  const startRun = () => {
    stopRun();
    bumpStreak(0);
    setVerdict(null);
    runningRef.current = true;
    setRunning(true);
    beginRef.current();
  };

  /* The tap — and the one place the judge is called. A later ASL hand
     input calls judgeAcornAnswer with the letter its landmarks resolved
     to; nothing else in this component would change. */
  const tap = (answer: string) => {
    const target = acornRef.current;
    if (!target) return;
    if (ruledOutRef.current.includes(answer)) return;
    const v = judgeAcornAnswer(modeRef.current, target, answer);
    if (v.ok) {
      acornRef.current = null;
      setLetter(null);
      fracRef.current = 0;
      setFrac(0);
      const s = streakRef.current + 1;
      bumpStreak(s);
      setProgress((p) => ({
        ...p,
        caught: p.caught + 1,
        bestStreak: Math.max(p.bestStreak, s),
      }));
      setVerdict({
        ok: true,
        text: `caught · ${target} is ${byLetter(target).morse} · streak ${s}`,
      });
      scheduleNext();
    } else {
      setRuled([...ruledOutRef.current, answer]);
      bumpStreak(0);
      setProgress((p) => ({ ...p, wrongTaps: p.wrongTaps + 1 }));
      setVerdict({
        ok: false,
        text:
          modeRef.current === "read"
            ? `wrong tap · ${answer} is not this acorn`
            : "wrong tap · that pattern is not this letter",
      });
    }
  };
  const tapRef = useRef(tap);
  tapRef.current = tap;

  /* The fall is a function of elapsed time and of nothing else: no CSS
     animation, no scroll, no timer chain that could drift from the
     state. While the chute is off screen (another tab, a hidden
     section) the clock is re-anchored, so an acorn holds its place
     instead of landing unnoticed. */
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (!acornRef.current) return;
      if (chuteRef.current && chuteRef.current.offsetParent === null) {
        startRef.current =
          performance.now() - fracRef.current * fallRef.current;
        return;
      }
      const f = (performance.now() - startRef.current) / fallRef.current;
      if (f >= 1) {
        missRef.current();
        return;
      }
      fracRef.current = f;
      setFrac(f);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  /* Keyboard as the alternative to touch: number keys 1–6 tap the same
     buttons in the same order. Touch needs no keys at all. */
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (chuteRef.current && chuteRef.current.offsetParent === null) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > choices.length) return;
      e.preventDefault();
      tapRef.current(choices[n - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, choices]);

  return (
    <div
      className="mt-4 rounded-2xl border-2 border-amber-500/50 bg-slate-900/60 p-3"
      aria-label="Morbraii Mission — Acorn Tap"
    >
      <h3 className="text-base font-bold">🌰 Morbraii Mission — Acorn Tap</h3>
      <p className="mt-1 text-xs text-slate-400">
        Acorns fall down the chute and each one carries <b>one letter's
        Morse</b>. In <b>mode A</b> the acorn shows the code and you tap the
        letter; in <b>mode B</b> the acorn shows the letter and you tap the
        code. Every answer is a big button — this game is played with a thumb,
        and the number keys 1–6 do the same thing if a keyboard is there.
      </p>
      <p className="mt-1 text-xs text-slate-400">
        The acorn sounds as it falls, in the <b>{VOICES[voice].label}</b>{" "}
        voice: the letter's own elements, at the page's unit and the page's own
        Hz map. The <b>fall is pacing only</b> — how long you have to answer —
        and it never touches the code's timing. More choices and a shorter fall
        are the only difficulty levers.
      </p>

      {/* -------------------------------------------------------- modes */}
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Acorn mode">
        {ACORN_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              stopRun();
              setVerdict(null);
              setMode(m.id);
            }}
            aria-pressed={mode === m.id}
            aria-label={`Acorn mode: ${m.label}`}
            className={`min-h-[56px] flex-1 rounded-xl border-2 px-3 text-sm font-bold ${
              mode === m.id
                ? "border-amber-300 bg-slate-800 text-white"
                : "border-slate-600 bg-slate-800 text-slate-200"
            }`}
          >
            {mode === m.id ? "✓ " : ""}
            {m.label}
            <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
              {m.blurb}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2" aria-label="Acorn letters">
        {ACORN_POOLS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              stopRun();
              setPoolId(p.id);
            }}
            aria-pressed={poolId === p.id}
            aria-label={`Acorn letters: ${p.label}`}
            className={`min-h-[48px] rounded-xl border-2 px-3 text-sm font-bold ${
              poolId === p.id
                ? "border-amber-300 bg-slate-800 text-white"
                : "border-slate-600 bg-slate-800 text-slate-200"
            }`}
          >
            {poolId === p.id ? "✓ " : ""}
            {p.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => (running ? stopRun() : startRun())}
        aria-label={running ? "Stop the acorns" : "Start dropping acorns"}
        className="mt-3 min-h-[56px] w-full rounded-xl border-2 border-amber-300/70 bg-slate-800 px-3 text-base font-bold text-amber-100"
      >
        {running ? "■ Stop" : "▶ Start · drop acorns"}
      </button>
      {!sound && (
        <p
          role="status"
          className="mt-2 rounded-xl border border-rose-400/50 bg-rose-500/10 p-3 text-xs text-rose-100"
        >
          Tone is switched off on this page, so the acorns fall in silence. The
          game still works by eye; switch sound on (Letters tab) to hear each
          letter.
        </p>
      )}

      {/* -------------------------------------------------------- chute */}
      <div className="mt-3" aria-label="Acorn chute">
        <div
          ref={chuteRef}
          style={{ height: ACORN_CHUTE_PX }}
          className="relative overflow-hidden rounded-2xl border-2 border-dashed border-slate-600 bg-gradient-to-b from-slate-950 to-slate-800"
        >
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1 bg-amber-700/70"
          />
          {letter ? (
            <div
              className="absolute left-1/2 flex w-[80%] max-w-[260px] flex-col items-center gap-1 rounded-2xl border-2 border-amber-400/70 bg-amber-950/80 px-3 py-2 text-amber-100 shadow-lg"
              style={{
                top: 8,
                transform: `translate(-50%, ${Math.round(
                  frac * ACORN_TRAVEL_PX,
                )}px)`,
              }}
              aria-label={
                mode === "read"
                  ? `Falling acorn: Morse ${byLetter(letter).morse}`
                  : `Falling acorn: letter ${letter}`
              }
            >
              <span aria-hidden="true" className="text-2xl leading-none">
                🌰
              </span>
              {mode === "read" ? (
                <MorseShapes morse={byLetter(letter).morse} big />
              ) : (
                <span className="text-4xl font-black tracking-widest">
                  {letter}
                </span>
              )}
            </div>
          ) : (
            <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 px-3 text-center text-sm text-slate-400">
              {running
                ? "next acorn…"
                : "press Start to drop the first acorn"}
            </p>
          )}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 h-1 bg-amber-500/60"
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          the line at the bottom is where an unanswered acorn is missed · the
          acorn art is decoration, the code on it is the point
        </p>
      </div>

      {/* ------------------------------------------------------ answers */}
      <div
        className={`mt-2 grid gap-2 ${
          choices.length === 4 ? "grid-cols-2" : "grid-cols-3"
        }`}
        aria-label="Acorn answers"
      >
        {choices.map((a, i) => {
          const dead = ruledOut.includes(a);
          return (
            <button
              key={a}
              type="button"
              onClick={() => tap(a)}
              disabled={!letter || dead}
              aria-label={mode === "read" ? `Answer ${a}` : `Answer: Morse ${a}`}
              className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 text-center ${
                dead
                  ? "border-slate-700 bg-slate-800/40 text-slate-600 line-through"
                  : "border-slate-500 bg-slate-800 text-white"
              } ${!letter ? "opacity-50" : ""}`}
            >
              {mode === "read" ? (
                <span className="text-2xl font-black">{a}</span>
              ) : (
                <MorseShapes morse={a} big />
              )}
              <span className="text-[10px] font-normal text-slate-400">
                key {i + 1}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => letter && soundAcorn(letter)}
          disabled={!letter || !sound}
          aria-label="Hear this acorn again"
          className="min-h-[48px] flex-1 rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-slate-200 disabled:opacity-50"
        >
          🔁 Hear it again
        </button>
      </div>

      <p
        role="status"
        aria-label="Acorn Tap verdict"
        className={`mt-2 rounded-xl p-3 font-mono text-sm ${
          verdict === null
            ? "bg-slate-950/60 text-slate-300"
            : verdict.ok
              ? "bg-emerald-500/10 text-emerald-200"
              : "bg-rose-500/10 text-rose-200"
        }`}
      >
        {verdict ? verdict.text : "No answer yet."}
      </p>

      <p
        aria-label="Acorn Tap tally"
        className="mt-2 rounded-xl bg-slate-950/60 p-3 font-mono text-sm text-cyan-200"
      >
        caught {progress.caught} · wrong tap {progress.wrongTaps} · missed{" "}
        {progress.missed} · streak {streak} · best streak {progress.bestStreak}
        <span
          aria-label="Acorn progress bucket"
          className="mt-1 block text-xs text-cyan-300"
        >
          {modeLabel} mode · kept separately under{" "}
          <code>morbrai.{acornBucket(mode)}</code>
        </span>
        <span className="mt-1 block text-xs text-slate-400">
          kept in this browser only (localStorage) · no analytics, nothing sent
          anywhere ·{" "}
          <button
            type="button"
            onClick={() => {
              const empty = { ...EMPTY_ACORN_PROGRESS };
              progressRef.current = empty;
              setProgress(empty);
              bumpStreak(0);
              setVerdict(null);
            }}
            aria-label="Reset the Acorn Tap progress for this mode"
            className="inline-flex min-h-[48px] items-center px-2 underline decoration-dotted"
          >
            reset this mode's progress
          </button>
        </span>
      </p>

      <p className="mt-2 text-xs text-slate-400">
        <b>Synthesised, not sampled.</b> The {VOICES[voice].label} voice is one
        oscillator through the same gate as every other voice here — no
        samples, nothing recorded, and no instrument claims.
      </p>
      <p className="mt-1 text-xs text-slate-400">
        <b>What this practises:</b> recognising a letter by its Morse, by eye
        and by ear, and tapping the matching code. It is <b>not</b> measured to
        teach, or to improve learning, retention, ASL recognition or any other
        skill — none of that is measured here.
      </p>
      <p className="mt-1 text-xs text-slate-400">
        <b>One seam, no camera.</b> Every answer is judged by one function (
        <code>judgeAcornAnswer</code>), so a hand-based input could be wired to
        the same check later. Nothing on this page reads a camera, a microphone
        or your hand, no ASL recognition is built here, and that promise is
        unchanged.
      </p>
    </div>
  );
}

/* "M A5" — the pitch label a lane note carries, from the shared plan. */
function laneNoteLabel(n: LaneNote): string {
  return `${n.letter} ${noteNameOf(n.hz)} ${n.hz.toFixed(1)} Hz`;
}

function Home() {
  const [selected, setSelected] = useState("A");
  const [tactileOnly, setTactileOnly] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [vibSupported] = useState(canVibrate);
  /* Light mode: default ON exactly where vibration is impossible (the
     iPhone case) and OFF everywhere else. The user's tap owns it after
     that. The panel stays subscribed either way, so flipping this can
     never desync the light from the buzz. */
  const [lightOn, setLightOn] = useState(() => !canVibrate());

  /* Timing profile — the single source of truth for every rhythm on the
     page. Default is standard Morse at 5 wpm: a first learner needs a
     pace they can copy, and standard is the profile that has to transfer.
     Both settings are plain numbers; `timing` below is the one derived
     object every player receives. */
  const [profile, setProfile] = useState<ProfileId>("standard");
  const [stdWpm, setStdWpm] = useState<number>(STANDARD_DEFAULT_WPM);
  const [morbraiUnit, setMorbraiUnit] = useState<number>(MORBRAI_DEFAULT_UNIT);
  const timing: Timing =
    profile === "standard"
      ? buildTiming("standard", unitOfWpm(stdWpm))
      : buildTiming("morbrai", morbraiUnit);

  /* Tone reach — register, waveform and the measured hearing ceiling. One
     derived planTone() object feeds every tone on the page, exactly like
     `timing` feeds every rhythm: no component picks its own pitch. */
  const [toneRegister, setToneRegister] = useState<RegisterId>(
    TONE_DEFAULT_REGISTER,
  );
  const [toneWaveform, setToneWaveform] = useState<VoiceId>(
    TONE_DEFAULT_VOICE,
  );
  const [hearingCeiling, setHearingCeiling] = useState<number | null>(null);
  /* Tone output: discrete pings (the long-standing default) or our
     sustained carrier. Same timing, same tone plan, same ceiling. */
  const [toneMode, setToneMode] = useState<ToneMode>(TONE_DEFAULT_MODE);
  const [colourSetId, setColourSetId] = useState<string>(COLOUR_SETS[0].id);
  /* Which of the four ASL drawing treatments the signs are drawn in. A is
     the drawing the page has always served and stays the default; the
     choice is remembered under morbrai.sign.variant. All four draw the
     same verified geometry — see src/asl-signs.tsx. */
  const [signVariant, setSignVariant] = useState<SignVariantId>("A");
  /* Which section is open. Read after hydration like the other
     remembered settings (below) and stored under morbrai.view.
     Layout only: it hides and shows sections and changes no timing,
     tone, pitch or lesson behaviour. */
  const [view, setView] = useState<ViewId>("letters");

  /* Remembered settings are read AFTER hydration (in an effect rather than
     a useState initialiser), so the server HTML and the first client render
     agree; `prefsLoaded` then gates the writes so the defaults can never
     overwrite a stored choice. */
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    setToneRegister(asRegister(loadPref("tone.register")));
    setToneWaveform(asVoice(loadPref("tone.waveform")));
    setHearingCeiling(asCeiling(loadPref("tone.ceiling")));
    setToneMode(asToneMode(loadPref("tone.mode")));
    setColourSetId(asColourSet(loadPref("light.colours")));
    setSignVariant(asSignVariant(loadPref("sign.variant")));
    setView(asView(loadPref("view")));
    setPrefsLoaded(true);
  }, []);
  useEffect(() => {
    if (!prefsLoaded) return;
    savePref("tone.register", toneRegister);
  }, [prefsLoaded, toneRegister]);
  useEffect(() => {
    if (!prefsLoaded) return;
    savePref("tone.waveform", toneWaveform);
  }, [prefsLoaded, toneWaveform]);
  useEffect(() => {
    if (!prefsLoaded) return;
    savePref(
      "tone.ceiling",
      hearingCeiling === null ? null : String(hearingCeiling),
    );
  }, [prefsLoaded, hearingCeiling]);
  useEffect(() => {
    if (!prefsLoaded) return;
    savePref("light.colours", colourSetId);
  }, [prefsLoaded, colourSetId]);
  useEffect(() => {
    if (!prefsLoaded) return;
    savePref("tone.mode", toneMode);
  }, [prefsLoaded, toneMode]);
  useEffect(() => {
    if (!prefsLoaded) return;
    savePref("sign.variant", signVariant);
  }, [prefsLoaded, signVariant]);
  useEffect(() => {
    if (!prefsLoaded) return;
    savePref("view", view);
  }, [prefsLoaded, view]);

  const tonePlan: TonePlan = planTone(
    toneRegister,
    toneWaveform,
    hearingCeiling,
  );
  const colourSet = colourSetOf(colourSetId);

  const [quizTarget, setQuizTarget] = useState("B");
  const [quizPlayed, setQuizPlayed] = useState(false);
  const [quizMsg, setQuizMsg] = useState<string | null>(null);
  const [quizOk, setQuizOk] = useState<boolean | null>(null);
  const [streak, setStreak] = useState(0);
  const [lessonPlaying, setLessonPlaying] = useState<string | null>(null);

  /* Lesson 2 — spell by melody */
  const [l2Target, setL2Target] = useState(randomL2);
  const [l2Choices, setL2Choices] = useState<string[]>(() =>
    pickL2Round(l2Target),
  );
  const [l2Played, setL2Played] = useState(false);
  const [l2Playing, setL2Playing] = useState(false);
  const [l2ActiveIdx, setL2ActiveIdx] = useState(-1);
  const [l2Msg, setL2Msg] = useState<string | null>(null);
  const [l2Ok, setL2Ok] = useState<boolean | null>(null);
  const [l2Streak, setL2Streak] = useState(0);
  const [l2Done, setL2Done] = useState(0);

  /* Word melody player state. `wordText` is what the box holds (letters
     and single spaces); `word` is the token array that plays, derived
     from it below — so a space typed in this box is a real word gap. */
  const [wordText, setWordText] = useState("");
  const [wordPlaying, setWordPlaying] = useState(false);
  const [wordIdx, setWordIdx] = useState(-1);

  /* Fingerspelling player (A–Z & signs tab) — the "out" direction of the
     ASL branch. `spellText` is its own box (it can be filled from the
     melody word); `spellTokens` is the same token walk every other player
     uses; `spellIdx` is the token index on screen right now. Playback goes
     through playWordMelody, so the letters advance on the ONE shared
     Timing — no second clock, no separate letter rate. */
  const [spellText, setSpellText] = useState("");
  const [spellPlaying, setSpellPlaying] = useState(false);
  const [spellIdx, setSpellIdx] = useState(-1);

  /* Lesson 3 — spell longer words (same shape as Lesson 2, plus the
     round's Morse legend). Playback guard is lessonPlaying === "l3". */
  const [l3Target, setL3Target] = useState(randomL3);
  const [l3Choices, setL3Choices] = useState<string[]>(() =>
    pickL3Round(l3Target),
  );
  const [l3Played, setL3Played] = useState(false);
  const [l3ActiveIdx, setL3ActiveIdx] = useState(-1);
  const [l3Msg, setL3Msg] = useState<string | null>(null);
  const [l3Ok, setL3Ok] = useState<boolean | null>(null);
  const [l3Streak, setL3Streak] = useState(0);
  const [l3Done, setL3Done] = useState(0);

  /* Lesson 4 — type your own word/phrase, one or more lines. Guard:
     lessonPlaying === "l4". Each row keeps its own text and its own
     reveal, and the stack can play one line or all of them in order. */
  const [l4Rows, setL4Rows] = useState<L4Row[]>([
    { text: "MORBRAI", revealed: true },
  ]);
  /* Which row is playing: a row index, -1 for "Play all", null for idle. */
  const [l4PlayingRow, setL4PlayingRow] = useState<number | null>(null);
  /* Row and token index inside that row that is playing right now. */
  const [l4Active, setL4Active] = useState<{
    row: number;
    idx: number;
  } | null>(null);

  /* Lesson 5 — full phrase mastery. Guard: lessonPlaying === "l5". */
  const [l5Revealed, setL5Revealed] = useState(false);
  const [l5ActiveIdx, setL5ActiveIdx] = useState(-1);

  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(
    () => () => {
      stopRhythm();
      stopWordTimers();
      timersRef.current.forEach(clearTimeout);
    },
    [],
  );

  const entry = byLetter(selected);

  /* §3 melody tokens, derived from the box's text. */
  const word = phraseTokens(wordText);

  /* Fingerspelling tokens: one letter at a time, " " = word gap. */
  const spellTokens = phraseTokens(spellText);
  const spellCurrent = spellIdx >= 0 ? spellTokens[spellIdx] : null;

  /* Tokens for the phrase lessons: one entry per letter, " " = word gap. */
  const l4LineTokens: string[][] = l4Rows.map((row) =>
    phraseTokens(row.text),
  );
  /* "Play all": every non-empty line in order, joined by ONE space token —
     so the join between two lines is exactly one word gap. l4AllOwner maps
     each combined token back to the row it came from, so the right row
     still lights up while the whole stack plays. */
  const l4AllTokens: string[] = [];
  const l4AllOwner: { row: number; idx: number }[] = [];
  l4LineTokens.forEach((toks, r) => {
    if (toks.length === 0) return;
    if (l4AllTokens.length > 0) {
      l4AllTokens.push(" ");
      l4AllOwner.push({ row: -1, idx: -1 });
    }
    toks.forEach((t, i) => {
      l4AllTokens.push(t);
      l4AllOwner.push({ row: r, idx: i });
    });
  });
  const l4Letters = l4LineTokens.reduce(
    (a, toks) => a + countLetters(toks),
    0,
  );
  const l4WordCount = l4LineTokens.reduce((a, toks) => a + countWords(toks), 0);
  const l5Tokens = L5_PHRASE.split("");
  /* One derived "something is playing" flag: every play button checks it,
     so playback can never overlap (vibration + melody are exclusive). */
  const anyPlaying =
    playing ||
    wordPlaying ||
    spellPlaying ||
    l2Playing ||
    lessonPlaying !== null;

  const setWordFromInput = (raw: string) => {
    if (anyPlaying) return;
    stopRhythm();
    stopWordTimers();
    setWordIdx(-1);
    setWordText(normalizePhrase(raw));
  };

  const playWord = () => {
    if (anyPlaying || word.length === 0) return;
    setWordPlaying(true);
    playWordMelody(word, {
      sound: soundOn,
      toneMode,
      tone: tonePlan.hz,
      wave: toneWaveform,
      timing,
      onLetter: (i) => setWordIdx(i),
      onStep: () => undefined,
      onDone: () => {
        setWordPlaying(false);
        setWordIdx(-1);
      },
    });
  };

  /* ---- Fingerspelling player --------------------------------------
     The same walk, the same Timing, the same light and buzz. The only
     thing new is what is drawn: the verified handshape for the letter
     that is sounding. */
  const setSpellFromInput = (raw: string) => {
    if (anyPlaying) return;
    stopWordTimers();
    setSpellIdx(-1);
    setSpellText(normalizePhrase(raw));
  };

  const playSpell = () => {
    if (anyPlaying || spellTokens.length === 0) return;
    setSpellPlaying(true);
    setSpellIdx(-1);
    playWordMelody(spellTokens, {
      sound: soundOn,
      toneMode,
      tone: tonePlan.hz,
      wave: toneWaveform,
      timing,
      onLetter: (i) => setSpellIdx(i),
      onStep: () => undefined,
      onDone: () => {
        setSpellPlaying(false);
        setSpellIdx(-1);
      },
    });
  };

  /* Stop is a real stop: the shared word timers carry the light, the
     buzz and the tone, so clearing them leaves nothing running behind a
     handshape that is no longer on screen. */
  const stopSpell = () => {
    stopWordTimers();
    setSpellPlaying(false);
    setSpellIdx(-1);
  };

  /* Switching sections is layout only: it changes what is on screen and
     nothing else. Nothing is stopped, reset or re-timed by switching. */
  const gotoView = (v: ViewId) => {
    setView(v);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  /* Picking a letter off a list (A–Z reference, sign grid, a melody tile)
     has always meant: stop any rhythm, select the letter, go back to the
     top. In the tabbed layout it also opens the Letters section, which is
     where that letter's glyph, sign and light surface are. In classic it
     is the same scroll-and-select it has always been. */
  const pickLetterFromList = (letter: string, fromMelody = false) => {
    stopRhythm();
    if (fromMelody) setWordIdx(-1);
    else setPlaying(false);
    setActiveIdx(-1);
    setSelected(letter);
    if (view !== "classic") setView("letters");
    if (typeof window !== "undefined")
      window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const feelSelected = () => {
    if (anyPlaying) return;
    setPlaying(true);
    setActiveIdx(-1);
    playMorse(entry.morse, {
      sound: soundOn,
      toneMode,
      timing,
      freq: tonePlan.hz[entry.letter] ?? freqOf(entry.letter),
      wave: toneWaveform,
      onStep: (i) => setActiveIdx(i),
      onDone: () => setPlaying(false),
    });
  };

  const feelLesson = (letter: string) => {
    if (anyPlaying) return;
    setLessonPlaying(letter);
    const e = byLetter(letter);
    playMorse(e.morse, {
      sound: soundOn,
      toneMode,
      timing,
      freq: tonePlan.hz[letter] ?? freqOf(letter),
      wave: toneWaveform,
      onStep: () => undefined,
      onDone: () => setLessonPlaying(null),
    });
    if (canVibrate()) {
      try {
        navigator.vibrate(vibrationPattern(e.morse, timing));
      } catch {
        /* ignore */
      }
    }
  };

  const newQuiz = () => {
    const pool = ["A", "B", "C"];
    setQuizTarget(pool[Math.floor(Math.random() * pool.length)]);
    setQuizPlayed(false);
    setQuizMsg(null);
    setQuizOk(null);
  };

  const playQuizTarget = () => {
    if (anyPlaying) return;
    const e = byLetter(quizTarget);
    setQuizPlayed(true);
    playMorse(e.morse, {
      sound: soundOn,
      toneMode,
      timing,
      freq: tonePlan.hz[quizTarget] ?? freqOf(quizTarget),
      wave: toneWaveform,
      onStep: () => undefined,
      onDone: () => undefined,
    });
    if (canVibrate()) {
      try {
        navigator.vibrate(vibrationPattern(e.morse, timing));
      } catch {
        /* ignore */
      }
    }
  };

  const answerQuiz = (guess: string) => {
    if (!quizPlayed) {
      setQuizMsg("Press “Feel the mystery letter” first, then guess.");
      setQuizOk(null);
      return;
    }
    if (guess === quizTarget) {
      /* sweet-confirmation double-buzz */
      if (canVibrate()) {
        try {
          navigator.vibrate([150, 100, 150]);
        } catch {
          /* ignore */
        }
      }
      setQuizMsg(`Correct — that was ${quizTarget}! New letter coming…`);
      setQuizOk(true);
      setStreak((s) => s + 1);
      const t = setTimeout(newQuiz, 1800);
      timersRef.current.push(t);
    } else {
      setQuizMsg(
        `Not quite — that was ${quizTarget}. Feel it again and retry.`,
      );
      setQuizOk(false);
      setStreak(0);
    }
  };

  const newL2 = (target?: string) => {
    const t = target ?? randomL2();
    stopWordTimers();
    stopRhythm();
    setL2Playing(false);
    setL2ActiveIdx(-1);
    setL2Target(t);
    setL2Choices(pickL2Round(t));
    setL2Played(false);
    setL2Msg(null);
    setL2Ok(null);
  };

  const playL2Mystery = () => {
    if (anyPlaying) return;
    setL2Playing(true);
    setL2Played(true);
    setL2ActiveIdx(-1);
    playWordMelody(l2Target.split(""), {
      sound: soundOn,
      toneMode,
      tone: tonePlan.hz,
      wave: toneWaveform,
      timing,
      onLetter: (i) => setL2ActiveIdx(i),
      onStep: () => undefined,
      onDone: () => {
        setL2Playing(false);
        setL2ActiveIdx(-1);
      },
    });
  };

  const answerL2 = (guess: string) => {
    if (anyPlaying) return;
    if (!l2Played) {
      setL2Msg("Press “Hear the mystery word” first, then guess.");
      setL2Ok(null);
      return;
    }
    if (guess === l2Target) {
      if (canVibrate()) {
        try {
          navigator.vibrate([150, 100, 150]);
        } catch {
          /* ignore */
        }
      }
      setL2Msg(`Correct — that was ${l2Target}! Next word coming…`);
      setL2Ok(true);
      setL2Streak((s) => s + 1);
      setL2Done((d) => d + 1);
      const t = setTimeout(() => newL2(), 2000);
      timersRef.current.push(t);
    } else {
      setL2Msg("Not quite — listen again and feel the melody.");
      setL2Ok(false);
      setL2Streak(0);
    }
  };

  /* ---------------- Lesson 3 — spell longer words ---------------- */
  const newL3 = (target?: string) => {
    const t = target ?? randomL3();
    stopWordTimers();
    stopRhythm();
    setL3ActiveIdx(-1);
    setL3Target(t);
    setL3Choices(pickL3Round(t));
    setL3Played(false);
    setL3Msg(null);
    setL3Ok(null);
  };

  const playL3Mystery = () => {
    if (anyPlaying) return;
    setLessonPlaying("l3");
    setL3Played(true);
    setL3ActiveIdx(-1);
    playWordMelody(l3Target.split(""), {
      sound: soundOn,
      toneMode,
      tone: tonePlan.hz,
      wave: toneWaveform,
      timing,
      onLetter: (i) => setL3ActiveIdx(i),
      onStep: () => undefined,
      onDone: () => {
        setLessonPlaying(null);
        setL3ActiveIdx(-1);
      },
    });
  };

  const answerL3 = (guess: string) => {
    if (anyPlaying) return;
    if (!l3Played) {
      setL3Msg("Press “Hear the word” first, then tap the word you felt.");
      setL3Ok(null);
      return;
    }
    if (guess === l3Target) {
      if (canVibrate()) {
        try {
          navigator.vibrate([150, 100, 150]);
        } catch {
          /* ignore */
        }
      }
      setL3Msg(`Correct — that was ${l3Target}! Next word coming…`);
      setL3Ok(true);
      setL3Streak((s) => s + 1);
      setL3Done((d) => d + 1);
      const t = setTimeout(() => newL3(), 2200);
      timersRef.current.push(t);
    } else {
      setL3Msg("Not quite — count the dots and dashes, then tap again.");
      setL3Ok(false);
      setL3Streak(0);
    }
  };

  /* ---------------- Lesson 4 — make your own Morse ---------------- */
  /* Every edit below is refused mid-playback (anyPlaying) and stops the
     live word timers, so what is on the timeline is always what is in the
     boxes — a row can never be edited under a playing phrase. */
  const setL4Row = (r: number, raw: string) => {
    if (anyPlaying) return;
    stopRhythm();
    stopWordTimers();
    setL4Active(null);
    setL4Rows((prev) =>
      prev.map((row, i) =>
        i === r ? { ...row, text: normalizePhrase(raw) } : row,
      ),
    );
  };

  const toggleL4Reveal = (r: number) => {
    if (anyPlaying) return;
    setL4Rows((prev) =>
      prev.map((row, i) =>
        i === r ? { ...row, revealed: !row.revealed } : row,
      ),
    );
  };

  const addL4Row = () => {
    if (anyPlaying) return;
    setL4Rows((prev) =>
      prev.length >= L4_MAX_ROWS
        ? prev
        : [...prev, { text: "", revealed: true }],
    );
  };

  const removeL4Row = (r: number) => {
    if (anyPlaying) return;
    stopRhythm();
    stopWordTimers();
    setL4Active(null);
    setL4Rows((prev) =>
      prev.length <= 1 ? prev : prev.filter((_, i) => i !== r),
    );
  };

  const clearL4Rows = () => {
    if (anyPlaying) return;
    stopRhythm();
    stopWordTimers();
    setL4Active(null);
    setL4Rows([{ text: "", revealed: true }]);
  };

  /* One player for both paths. row = -1 means "Play all": `owner` maps
     each combined token back to its row, and the separating space tokens
     are owned by nobody, so the join between two lines shows as a word
     gap rather than as a pause on a letter. */
  const runL4 = (
    tokens: string[],
    row: number,
    owner?: { row: number; idx: number }[],
  ) => {
    if (anyPlaying || countLetters(tokens) === 0) return;
    setLessonPlaying("l4");
    setL4PlayingRow(row);
    setL4Active(null);
    playWordMelody(tokens, {
      sound: soundOn,
      toneMode,
      tone: tonePlan.hz,
      wave: toneWaveform,
      timing,
      onLetter: (i) => setL4Active(owner !== undefined ? owner[i] : { row, idx: i }),
      onStep: () => undefined,
      onDone: () => {
        setLessonPlaying(null);
        setL4PlayingRow(null);
        setL4Active(null);
      },
    });
  };

  const playL4Line = (r: number) => runL4(l4LineTokens[r] ?? [], r);

  const playL4All = () => runL4(l4AllTokens, -1, l4AllOwner);

  /* ---------------- Lesson 5 — full phrase mastery ---------------- */
  const playL5 = () => {
    if (anyPlaying) return;
    setLessonPlaying("l5");
    setL5ActiveIdx(-1);
    playWordMelody(l5Tokens, {
      sound: soundOn,
      toneMode,
      tone: tonePlan.hz,
      wave: toneWaveform,
      timing,
      onLetter: (i) => setL5ActiveIdx(i),
      onStep: () => undefined,
      onDone: () => {
        setLessonPlaying(null);
        setL5ActiveIdx(-1);
      },
    });
  };

  /* Which of the four words is buzzing right now (0-3, -1 = none). */
  const l5WordIdx =
    l5ActiveIdx < 0
      ? -1
      : L5_PHRASE.slice(0, l5ActiveIdx).split(" ").length - 1;
  const l5LetterNum =
    l5ActiveIdx < 0
      ? 0
      : l5Tokens.slice(0, l5ActiveIdx + 1).filter((t) => t !== " ").length;
  const l5Duration = l5Tokens.reduce((a, t) => {
    if (t === " ") return a + timing.wordGapMs;
    return (
      a +
      vibrationPattern(byLetter(t).morse, timing).reduce((x, y) => x + y, 0) +
      timing.letterGapMs
    );
  }, 0);

  return (
    <main className="min-h-dvh bg-slate-950 px-4 pb-16 pt-6 text-slate-100">
      <style>{`@keyframes pop{0%{transform:scale(.92)}55%{transform:scale(1.04)}100%{transform:scale(1)}}.pop{animation:pop .35s ease}.quiz-glow{box-shadow:0 0 24px rgba(34,211,238,.55)!important;border-color:#22d3ee!important}`}</style>
      <div className="mx-auto w-full max-w-xl">
        {/* Header */}
        <header className="text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
            Morbraii · MVP demo
          </p>
          <h1 className="mt-1 text-4xl font-black tracking-tight">
            Touch is a language.
          </h1>
          <p className="mt-2 text-base text-slate-300">
            Tap a letter, see its hybrid glyph, and{" "}
            <span className="font-semibold text-white">feel it buzz</span> on
            your phone.
          </p>
          <Link
            to="/framework"
            className="mt-3 inline-block rounded-xl border-2 border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-cyan-200"
          >
            📜 Past &amp; Future Adaptive Tech →
          </Link>
        </header>

        {/* Sections — every area is one tap away instead of a long scroll.
            "Classic" is the long-scroll page exactly as it was. */}
        <nav
          aria-label="Page sections"
          className="sticky top-0 z-30 -mx-4 mt-4 border-b border-slate-800 bg-slate-950/95 px-4 py-2 backdrop-blur"
        >
          <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => gotoView(v.id)}
                aria-pressed={view === v.id}
                className={`min-h-[48px] rounded-xl border-2 px-2 text-[13px] font-bold leading-tight ${
                  view === v.id
                    ? "border-cyan-300 bg-slate-800 text-white"
                    : "border-slate-700 bg-slate-900 text-slate-200"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
          <p className="mx-auto mt-2 max-w-xl text-[11px] leading-4 text-slate-400">
            {VIEW_NOTE[view]}
          </p>
        </nav>

        <TabSection show={view === "letters" || view === "classic"}>
        {/* Light mode — the channel for phones that cannot vibrate. Visible
            before any playback starts, on the same timeline as the buzz. */}
        <LightPanel
          lightOn={lightOn}
          onToggle={() => setLightOn((v) => !v)}
          playing={anyPlaying}
          idleMorse={entry.morse}
          idleLetter={entry.letter}
          colourSet={colourSet}
          onColourSet={setColourSetId}
        />
        </TabSection>

        <TabSection show={view === "setup" || view === "classic"}>
        {/* Timing profile — standard ITU grid vs our own Morbraii spacing.
            Sets the one `timing` object every player on the page reads. */}
        <TimingPanel
          profile={profile}
          wpm={stdWpm}
          morbraiUnit={morbraiUnit}
          timing={timing}
          onProfile={setProfile}
          onWpm={setStdWpm}
          onMorbraiUnit={setMorbraiUnit}
        />

        {/* Tone reach — register, measured ceiling, waveform. Feeds the
            one tone plan every tone on the page reads. */}
        <TonePanel
          plan={tonePlan}
          register={toneRegister}
          waveform={toneWaveform}
          ceiling={hearingCeiling}
          selected={selected}
          mode={toneMode}
          timing={timing}
          onRegister={setToneRegister}
          onWaveform={setToneWaveform}
          onCeiling={setHearingCeiling}
          onMode={setToneMode}
        />
        </TabSection>

        <TabSection show={view === "letters" || view === "classic"}>
        {/* A-Z picker */}
        <section aria-label="Letter picker" className="mt-6">
          <h2 className="text-lg font-bold">1 · Pick a letter</h2>
          <div className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-7">
            {DATA.map((d) => (
              <button
                key={d.letter}
                type="button"
                onClick={() => {
                  stopRhythm();
                  setPlaying(false);
                  setActiveIdx(-1);
                  setSelected(d.letter);
                }}
                aria-pressed={d.letter === selected}
                className={`min-h-[56px] rounded-xl text-xl font-black transition-colors ${
                  d.letter === selected
                    ? "bg-cyan-400 text-slate-950"
                    : "bg-slate-800 text-white active:bg-slate-700"
                }`}
              >
                {d.letter}
              </button>
            ))}
          </div>
        </section>

        {/* Hybrid glyph display */}
        <section aria-label="Hybrid glyph" className="mt-6">
          <h2 className="text-lg font-bold">2 · See it &amp; feel it</h2>
          <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
            <p className="text-6xl font-black text-white">{entry.letter}</p>
            <p className="mt-1 font-mono text-lg text-slate-300">
              Morse <span className="font-bold text-white">{entry.morse}</span>
              {"  ·  "}Braille{" "}
              <span className="font-bold text-white">
                {entry.braille.join("")}
              </span>
            </p>
            <p className="mt-1 font-mono text-sm text-slate-300">
              Tone{" "}
              <span
                className="font-bold text-white"
                aria-label={`Letter ${entry.letter} tone ${(
                  tonePlan.hz[entry.letter] ?? freqOf(entry.letter)
                ).toFixed(1)} hertz`}
              >
                {(tonePlan.hz[entry.letter] ?? freqOf(entry.letter)).toFixed(1)}{" "}
                Hz
              </span>
              {"  ·  "}
              <span className="font-bold text-cyan-300">
                ≈{" "}
                {noteNameOf(tonePlan.hz[entry.letter] ?? freqOf(entry.letter))}
              </span>
              {"  ·  "}
              <span className="font-bold text-slate-400">
                {REGISTERS[toneRegister].label} register ·{" "}
                {toneMode === "carrier" ? "sustained carrier" : "discrete pings"}
              </span>
            </p>

            {!tactileOnly ? (
              <div
                className="pop mt-4 flex flex-col items-center gap-4"
                key={entry.letter}
              >
                <div aria-label="Morse waveform">
                  <MorseWave morse={entry.morse} active={activeIdx} />
                  <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">
                    Morse wave · <span className="text-cyan-300">● dot</span> ·{" "}
                    <span className="text-amber-300">▬ dash</span>
                  </p>
                </div>
                <div aria-label="Braille cell">
                  <BrailleCell dots={entry.braille} height={140} />
                  <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">
                    Braille cell · filled = raised
                  </p>
                </div>
                <div aria-label="ASL sign for this letter">
                  <SignGlyph
                    letter={entry.letter}
                    height={150}
                    playing={playing}
                    variant={signVariant}
                  />
                  <p className="mt-1 text-xs uppercase tracking-widest text-slate-400">
                    Manual alphabet · one-handed ASL · line art
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-emerald-300">
                    {ASL[entry.letter]?.trace
                      ? "motion letter — the dashed path is the letter"
                      : "a third image of the same letter, beside wave and cell"}
                  </p>
                  <SignVariantPicker
                    value={signVariant}
                    onChange={setSignVariant}
                    demoLetter={entry.letter}
                  />
                </div>
              </div>
            ) : (
              <div
                className="pop mt-4 flex flex-col items-center"
                key={`t-${entry.letter}`}
              >
                <BrailleCell dots={entry.braille} height={260} />
                <p className="mt-2 text-xs uppercase tracking-widest text-slate-400">
                  Tactile-only · Braille cell, large
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={feelSelected}
              disabled={anyPlaying}
              className="mt-5 min-h-[64px] w-full rounded-2xl bg-cyan-400 text-xl font-black text-slate-950 disabled:opacity-60"
            >
              {playing ? "♪ Feeling it…" : `📳 Feel it: ${entry.letter}`}
            </button>

            <p className="mt-2 font-mono text-sm text-slate-400">
              buzz pattern: [{vibrationPattern(entry.morse, timing).join(", ")}]
              ms
            </p>
            {!vibSupported && (
              <p className="mt-2 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">
                No vibration support on this device/browser (iPhones don’t allow
                it) — watch the{" "}
                <span className="font-semibold text-amber-100">
                  light panel at the top
                </span>{" "}
                (💡 Light mode, on by default here) and the glyph, and listen to
                the beeps in rhythm instead. On Android + Chrome you’ll feel
                dot={timing.dotMs} ms, dash={timing.dashMs} ms and{" "}
                {timing.elementGapMs} ms between elements under the{" "}
                {timing.profile === "standard" ? "standard" : "Morbraii"}{" "}
                profile. The web Vibration API is on/off only: the buzz carries
                durations and never a frequency.
              </p>
            )}

            {/* Toggles */}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setTactileOnly((v) => !v)}
                aria-pressed={tactileOnly}
                className={`min-h-[56px] rounded-xl border-2 px-4 text-base font-bold ${
                  tactileOnly
                    ? "quiz-glow border-cyan-300 bg-slate-800"
                    : "border-slate-600 bg-slate-800"
                }`}
              >
                {tactileOnly
                  ? "✓ Tactile-only view: ON (Braille large)"
                  : "Tactile-only view: OFF (hybrid glyph)"}
              </button>
              <button
                type="button"
                onClick={() => setSoundOn((v) => !v)}
                aria-pressed={soundOn}
                className="min-h-[56px] rounded-xl border-2 border-slate-600 bg-slate-800 px-4 text-base font-bold"
              >
                {soundOn ? "🔊 Tones: ON" : "🔇 Tones: OFF"}
              </button>
            </div>
          </div>
          <AslNotes />
        </section>
        </TabSection>

        <TabSection show={view === "melody" || view === "classic"}>
        {/* Word melody player */}
        <section aria-label="Word melody" className="mt-8">
          <h2 className="text-lg font-bold">3 · Play a word as melody</h2>
          <p className="mt-1 text-sm text-slate-300">
            Type a word, a phrase or a whole paragraph (A–Z). Each letter rings
            its own tone — {REGISTERS[toneRegister].label.toLowerCase()}{" "}
            register, {bandText(tonePlan.lo, tonePlan.hi)} — while it buzzes its
            Morse rhythm. A space is a real word gap, not a pause in the melody.
          </p>
          <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <textarea
              rows={2}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={PHRASE_MAX}
              value={wordText}
              onChange={(e) => setWordFromInput(e.target.value)}
              placeholder="E.g. CAB  ·  TOUCH IS A LANGUAGE"
              aria-label={`Melody text, letters and spaces A to Z, up to ${PHRASE_MAX} characters`}
              aria-disabled={anyPlaying || undefined}
              aria-describedby={anyPlaying ? "melody-lock-note" : undefined}
              className="min-h-[56px] w-full resize-y rounded-xl border-2 border-slate-600 bg-slate-800 px-4 py-2 text-center text-xl font-black uppercase tracking-[0.15em] text-white placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none aria-disabled:border-amber-500/70 aria-disabled:bg-slate-800/60 aria-disabled:opacity-70"
            />
            {/* The lock is deliberate but it used to be invisible: typing is
                dropped while anything plays. Say so, and say when it lifts. */}
            {anyPlaying && (
              <p
                id="melody-lock-note"
                role="status"
                className="mt-2 flex items-center justify-center gap-2 text-center text-sm font-semibold text-amber-300"
              >
                <span aria-hidden="true">🔒</span>
                Editing is locked while playback runs — the box takes typing
                again when it finishes.
              </p>
            )}
            {/* Honest, live arithmetic: the same numbers the timeline uses. */}
            <p className="mt-2 text-center text-xs text-slate-400">
              Letters and spaces only — anything else is ignored; a line break
              counts as a space. {wordText.length}/{PHRASE_MAX} characters ·{" "}
              {countLetters(word)} letters · {countWords(word)} word(s) · ≈{" "}
              {fmtDuration(estimateMs(word, timing))} to play at{" "}
              {timing.profile === "standard"
                ? `standard ITU · ${timing.wpm.toFixed(0)} wpm`
                : "Morbraii spacing"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={playWord}
                disabled={anyPlaying || countLetters(word) === 0}
                className="min-h-[64px] flex-1 rounded-2xl bg-fuchsia-500 text-xl font-black text-white disabled:opacity-60"
              >
                {wordPlaying ? "♪ Playing…" : "▶ Play melody"}
              </button>
              <button
                type="button"
                onClick={() => setWordFromInput("")}
                disabled={anyPlaying || countLetters(word) === 0}
                aria-label="Clear word"
                className="min-h-[64px] w-16 rounded-2xl border-2 border-slate-600 bg-slate-800 text-xl font-black text-slate-200 disabled:opacity-60"
              >
                ✕
              </button>
            </div>

            {countLetters(word) > 0 && (
              <div className="mt-4 flex flex-wrap items-start justify-center gap-2">
                {groupByWord(word).map((g, gi) => (
                  <div
                    key={`melody-word-${gi}`}
                    className="flex flex-wrap justify-center gap-2 rounded-xl border border-dashed border-slate-700/70 p-2"
                  >
                    {g.map(({ t, i }) => (
                      <button
                        key={`${i}-${t}`}
                        type="button"
                        aria-label={`Letter ${t}, tone ${(
                          tonePlan.hz[t] ?? freqOf(t)
                        ).toFixed(0)} hertz`}
                        onClick={() => {
                          if (wordPlaying) return;
                          pickLetterFromList(t, true);
                        }}
                        className={`min-w-[52px] rounded-xl px-2 py-2 text-center transition-colors ${
                          i === wordIdx
                            ? "quiz-glow bg-cyan-400 text-slate-950"
                            : "bg-slate-800 text-white"
                        }`}
                      >
                        <span className="block text-2xl font-black leading-6">
                          {t}
                        </span>
                        <span
                          className={`block font-mono text-xs ${
                            i === wordIdx ? "text-slate-900" : "text-cyan-200"
                          }`}
                        >
                          {(tonePlan.hz[t] ?? freqOf(t)).toFixed(0)} Hz
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
            {groupByWord(word).length > 1 && (
              <p className="mt-2 text-center text-[11px] text-slate-400">
                Each dashed box is one word — the gap between boxes is one word
                gap ({timing.wordGapMs} ms on this profile).
              </p>
            )}
            {wordPlaying && (
              <p
                role="status"
                className="mt-3 text-center text-sm text-cyan-200"
              >
                {word[wordIdx] !== undefined && word[wordIdx] !== " " ? (
                  <>
                    ♪ Feel each letter buzz as its note rings — {word[wordIdx]}{" "}
                    ={" "}
                    {(tonePlan.hz[word[wordIdx]] ?? freqOf(word[wordIdx])).toFixed(
                      0,
                    )}{" "}
                    Hz
                  </>
                ) : (
                  <>␣ word gap — feel the pause ({timing.wordGapMs} ms)</>
                )}
              </p>
            )}
          </div>
        </section>
        </TabSection>
        <TabSection show={view === "lessons" || view === "classic"}>
        {/* Lesson 1 */}
        <section aria-label="Lesson 1" className="mt-8">
          <h2 className="text-lg font-bold">4 · Lesson 1 — Feel A, B, C</h2>
          <p className="mt-1 text-sm text-slate-300">
            Play each letter until the buzz feels familiar. A is short-long, B
            is long-short-short-short, C is long-short-long-short.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {["A", "B", "C"].map((l) => {
              const e = byLetter(l);
              const busy = lessonPlaying === l;
              return (
                <div
                  key={l}
                  className="rounded-2xl border border-slate-700 bg-slate-900 p-3 text-center"
                >
                  <p className="text-3xl font-black">{l}</p>
                  <p className="font-mono text-sm text-slate-300">{e.morse}</p>
                  <div className="mt-1 flex justify-center">
                    <BrailleCell dots={e.braille} height={64} glow={false} />
                  </div>
                  <button
                    type="button"
                    onClick={() => feelLesson(l)}
                    disabled={anyPlaying}
                    className="mt-2 min-h-[56px] w-full rounded-xl bg-slate-700 text-base font-bold disabled:opacity-60"
                  >
                    {busy ? "…" : `▶ ${l}`}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Quiz */}
          <div className="mt-4 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
            <h3 className="text-base font-bold">Quiz — which did you feel?</h3>
            <p className="mt-1 text-sm text-slate-300">
              Streak: <span className="font-black text-cyan-300">{streak}</span>
            </p>
            <button
              type="button"
              onClick={playQuizTarget}
              disabled={anyPlaying}
              className="mt-3 min-h-[64px] w-full rounded-2xl bg-fuchsia-500 text-xl font-black text-white disabled:opacity-60"
            >
              🎲 Feel the mystery letter
            </button>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {["A", "B", "C"].map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => answerQuiz(l)}
                  disabled={anyPlaying}
                  className="min-h-[64px] rounded-xl bg-slate-700 text-2xl font-black disabled:opacity-60"
                >
                  {l}
                </button>
              ))}
            </div>
            {quizMsg && (
              <p
                role="status"
                className={`pop mt-3 rounded-xl p-3 text-base font-bold ${
                  quizOk
                    ? "bg-emerald-400/15 text-emerald-200"
                    : "bg-slate-800 text-slate-200"
                }`}
              >
                {quizOk ? "✨ " : ""}
                {quizMsg}
              </p>
            )}
          </div>
        </section>

        {/* Lesson 2 — spell by melody */}
        <section aria-label="Lesson 2" className="mt-8">
          <h2 className="text-lg font-bold">5 · Lesson 2 — Spell by melody</h2>
          <p className="mt-1 text-sm text-slate-300">
            Hear the mystery word as a melody + buzz. No letters shown — feel
            it, then pick the word you heard.
          </p>
          <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
            <p className="text-sm text-slate-300">
              Streak:{" "}
              <span className="font-black text-cyan-300">{l2Streak}</span>
              {"  ·  "}Words completed:{" "}
              <span className="font-black text-cyan-300">{l2Done}</span>
            </p>
            {/* Mystery tiles: letters hidden during playback */}
            <div
              className="mt-3 flex justify-center gap-2"
              aria-label="Mystery word tiles"
            >
              {l2Target.split("").map((_, i) => (
                <div
                  key={i}
                  className={`flex h-[64px] min-w-[56px] items-center justify-center rounded-xl border-2 px-3 text-3xl font-black ${
                    l2Playing && i === l2ActiveIdx
                      ? "quiz-glow border-cyan-300 bg-cyan-400/20 text-white"
                      : "border-slate-600 bg-slate-800 text-cyan-300"
                  }`}
                >
                  {l2Playing && i === l2ActiveIdx
                    ? "♪"
                    : l2Ok
                      ? l2Target[i]
                      : "?"}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={playL2Mystery}
                disabled={anyPlaying}
                className="min-h-[64px] w-full rounded-2xl bg-fuchsia-500 text-xl font-black text-white disabled:opacity-60"
              >
                {l2Playing
                  ? "♪ Playing mystery word…"
                  : "🎧 Hear the mystery word"}
              </button>
              {l2Played && !l2Playing && (
                <button
                  type="button"
                  onClick={playL2Mystery}
                  disabled={anyPlaying}
                  className="min-h-[56px] w-full rounded-xl border-2 border-slate-600 bg-slate-800 text-base font-bold disabled:opacity-60"
                >
                  ↻ Replay mystery word
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {l2Choices.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => answerL2(w)}
                  disabled={anyPlaying}
                  className="min-h-[64px] rounded-xl bg-slate-700 px-2 text-xl font-black tracking-widest disabled:opacity-60"
                >
                  {w}
                </button>
              ))}
            </div>
            {l2Msg && (
              <p
                role="status"
                className={`pop mt-3 rounded-xl p-3 text-base font-bold ${
                  l2Ok
                    ? "bg-emerald-400/15 text-emerald-200"
                    : "bg-slate-800 text-slate-200"
                }`}
              >
                {l2Ok ? "✨ " : ""}
                {l2Msg}
              </p>
            )}
            {l2Played && !l2Playing && !l2Ok && (
              <p className="mt-2 text-sm text-slate-400">
                Tip: tap a choice, or replay to feel the melody again.
              </p>
            )}
          </div>
        </section>

        {/* Lesson 3 — spell longer words */}
        <section aria-label="Lesson 3" className="mt-8">
          <h2 className="text-lg font-bold">
            6 · Lesson 3 — Spell longer words
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            4–5 letters, no spelling shown while it plays. Morse is a rhythm
            alphabet: <span className="font-mono text-amber-200">-.-.</span> is
            C and <span className="font-mono text-amber-200">-...</span> is B.
            Count the dots and dashes you feel, then tap the word you heard.
          </p>
          <TimingLegend timing={timing} />
          <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-5 text-center">
            <p className="text-sm text-slate-300">
              Streak:{" "}
              <span className="font-black text-cyan-300">{l3Streak}</span>
              {"  ·  "}Words completed:{" "}
              <span className="font-black text-cyan-300">{l3Done}</span>
            </p>

            {/* Morse literacy: every code in play this round, spelled out */}
            <p className="mt-3 rounded-xl bg-slate-800/70 p-2 font-mono text-[11px] leading-5 text-amber-200">
              Morse in this round: {morseLegend(l3Choices.join(""))}
            </p>

            {l3Ok ? (
              <div className="pop mt-4">
                <p className="text-2xl font-black tracking-[0.3em] text-white">
                  {l3Target}
                </p>
                <p className="mt-1 font-mono text-xs text-amber-200">
                  {l3Target
                    .split("")
                    .map((l) => `${l} ${byLetter(l).morse}`)
                    .join("  ·  ")}
                </p>
                <div className="mt-3">
                  <GlyphRow tokens={l3Target.split("")} size="md" />
                </div>
              </div>
            ) : (
              <>
                <div
                  className="mt-3 flex flex-wrap justify-center gap-2"
                  aria-label="Mystery word tiles"
                >
                  {l3Target.split("").map((_, i) => (
                    <div
                      key={i}
                      className={`flex h-[64px] min-w-[52px] items-center justify-center rounded-xl border-2 text-3xl font-black ${
                        l3ActiveIdx === i
                          ? "quiz-glow border-cyan-300 bg-cyan-400/20 text-white"
                          : "border-slate-600 bg-slate-800 text-cyan-300"
                      }`}
                    >
                      {l3ActiveIdx === i ? "♪" : "?"}
                    </div>
                  ))}
                </div>
                <div
                  className="mt-3"
                  aria-label="Morse rhythm of the mystery word"
                >
                  <MorseRun
                    tokens={l3Target.split("")}
                    activeIdx={l3Played ? l3ActiveIdx : -1}
                    hidden={!l3Played}
                  />
                  <p className="mt-2 text-xs uppercase tracking-widest text-slate-400">
                    {l3Played
                      ? "the rhythm you are feeling — read it as you buzz"
                      : "play once and the dot/dash pattern appears"}
                  </p>
                </div>
              </>
            )}

            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={playL3Mystery}
                disabled={anyPlaying}
                className="min-h-[64px] w-full rounded-2xl bg-fuchsia-500 text-xl font-black text-white disabled:opacity-60"
              >
                {lessonPlaying === "l3"
                  ? "♪ Playing word as Morse + melody…"
                  : "🎧 Hear the word"}
              </button>
              {l3Played && lessonPlaying !== "l3" && (
                <button
                  type="button"
                  onClick={playL3Mystery}
                  disabled={anyPlaying}
                  className="min-h-[56px] w-full rounded-xl border-2 border-slate-600 bg-slate-800 text-base font-bold disabled:opacity-60"
                >
                  ↻ Replay — count each letter's dots and dashes
                </button>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {l3Choices.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => answerL3(w)}
                  disabled={anyPlaying}
                  className="min-h-[64px] rounded-xl bg-slate-700 px-2 py-2 text-xl font-black tracking-widest disabled:opacity-60"
                >
                  <span className="block">{w}</span>
                  <span className="mt-0.5 block font-mono text-[10px] font-normal tracking-normal text-amber-200">
                    {w
                      .split("")
                      .map((l) => byLetter(l).morse)
                      .join(" ")}
                  </span>
                </button>
              ))}
            </div>
            {l3Msg && (
              <p
                role="status"
                className={`pop mt-3 rounded-xl p-3 text-base font-bold ${
                  l3Ok
                    ? "bg-emerald-400/15 text-emerald-200"
                    : "bg-slate-800 text-slate-200"
                }`}
              >
                {l3Ok ? "✨ " : ""}
                {l3Msg}
              </p>
            )}
            {l3Played && lessonPlaying !== "l3" && !l3Ok && (
              <p className="mt-2 text-sm text-slate-400">
                Tip: each choice shows its own Morse — match the pattern you
                felt.
              </p>
            )}
          </div>
        </section>

        {/* Lesson 4 — make your own Morse */}
        <section aria-label="Lesson 4" className="mt-8">
          <h2 className="text-lg font-bold">
            7 · Lesson 4 — Make your own Morse
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Type anything in letters and spaces (A–Z) — a word, a phrase, a whole
            paragraph. Morbraii turns it into timed Morse vibration + a melody and
            lights each letter's hybrid glyph as it plays. Use{" "}
            <b>Add another line</b> to stack several phrases: each line plays and
            reveals on its own, and <b>Play all</b> runs them in order with
            exactly one word gap at every join.
          </p>
          <TimingLegend timing={timing} />
          <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-5">
            {l4Rows.map((row, r) => {
              const toks = l4LineTokens[r] ?? [];
              const letters = countLetters(toks);
              const rowActive =
                l4Active !== null && l4Active.row === r ? l4Active.idx : -1;
              const playingThisRow =
                lessonPlaying === "l4" &&
                (l4PlayingRow === r ||
                  (l4PlayingRow === -1 && l4Active?.row === r));
              return (
                <div
                  key={`l4-row-${r}`}
                  className="mt-3 rounded-xl border border-slate-700 bg-slate-900/60 p-3 first:mt-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                      Line {r + 1}
                    </p>
                    {l4Rows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeL4Row(r)}
                        disabled={anyPlaying}
                        aria-label={`Remove line ${r + 1}`}
                        className="min-h-[44px] rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-slate-200 disabled:opacity-60"
                      >
                        ✕ Remove line {r + 1}
                      </button>
                    )}
                  </div>
                  <textarea
                    rows={2}
                    inputMode="text"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={PHRASE_MAX}
                    value={row.text}
                    onChange={(e) => setL4Row(r, e.target.value)}
                    placeholder={
                      r === 0 ? "E.g. TOUCH IS A LANGUAGE" : "E.g. TRY THIS LINE"
                    }
                    aria-label={`Line ${r + 1} text, letters and spaces A to Z, up to ${PHRASE_MAX} characters`}
                    aria-disabled={anyPlaying || undefined}
                    aria-describedby={
                      anyPlaying ? `l4-lock-note-${r}` : undefined
                    }
                    className="mt-2 min-h-[56px] w-full resize-y rounded-xl border-2 border-slate-600 bg-slate-800 px-3 py-2 text-lg font-black uppercase tracking-[0.1em] text-white placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none aria-disabled:border-amber-500/70 aria-disabled:bg-slate-800/60 aria-disabled:opacity-70"
                  />
                  {/* Same visible lock as the melody box: setL4Row drops typing
                      while anything plays, so say so and say when it lifts. */}
                  {anyPlaying && (
                    <p
                      id={`l4-lock-note-${r}`}
                      role="status"
                      className="mt-1 flex items-center justify-center gap-2 text-center text-sm font-semibold text-amber-300"
                    >
                      <span aria-hidden="true">🔒</span>
                      Editing is locked while playback runs — the box takes
                      typing again when it finishes.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Letters and spaces only — anything else is ignored; a line
                    break counts as a space. {row.text.length}/{PHRASE_MAX}{" "}
                    characters · {letters} letters · {countWords(toks)} word(s) ·
                    ≈ {fmtDuration(estimateMs(toks, timing))} to play
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => playL4Line(r)}
                      disabled={anyPlaying || letters === 0}
                      className="min-h-[56px] flex-1 rounded-xl bg-fuchsia-500 px-4 text-base font-black text-white disabled:opacity-60"
                    >
                      {playingThisRow && l4PlayingRow === r
                        ? "🎧 Playing line " + (r + 1) + "…"
                        : "▶ Play line " + (r + 1)}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleL4Reveal(r)}
                      aria-pressed={row.revealed}
                      className={`min-h-[56px] rounded-xl border-2 px-4 text-base font-bold ${
                        row.revealed
                          ? "quiz-glow border-cyan-300 bg-slate-800 text-white"
                          : "border-slate-600 bg-slate-800 text-slate-200"
                      }`}
                    >
                      {row.revealed ? "🙈 Hide letters" : "👀 Reveal letters"}
                    </button>
                  </div>

                  {letters > 0 && (
                    <div
                      className="mt-3"
                      aria-label={`Hybrid glyphs for line ${r + 1}`}
                    >
                      <GlyphRow
                        tokens={toks}
                        activeIdx={rowActive}
                        size="sm"
                        hidden={!row.revealed}
                      />
                    </div>
                  )}

                  {letters > 0 &&
                    letters <= 60 && (
                      <div className="mt-3">
                        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                          Morse for what you typed
                        </p>
                        <p className="mt-1 break-all font-mono text-[11px] leading-5 text-amber-200">
                          {morseLegend(toks)}
                        </p>
                      </div>
                    )}
                  {letters > 60 && (
                    <p className="mt-3 text-xs text-slate-400">
                      Morse legend hidden for long text ({letters} letters) — the
                      word boxes above still carry every letter's Morse and
                      Braille cell.
                    </p>
                  )}

                  {playingThisRow && (
                    <p
                      role="status"
                      className="mt-2 text-center text-sm text-cyan-200"
                    >
                      {rowActive >= 0 && toks[rowActive] !== " " ? (
                        <>
                          ♪ {toks[rowActive]} ={" "}
                          <span className="font-mono text-amber-200">
                            {byLetter(toks[rowActive]).morse.split("").join(" ")}
                          </span>{" "}
                          ·{" "}
                          {(
                            tonePlan.hz[toks[rowActive]] ?? freqOf(toks[rowActive])
                          ).toFixed(0)}{" "}
                          Hz
                        </>
                      ) : (
                        <>␣ word gap — feel the pause ({timing.wordGapMs} ms)</>
                      )}
                    </p>
                  )}
                </div>
              );
            })}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addL4Row}
                disabled={anyPlaying || l4Rows.length >= L4_MAX_ROWS}
                className="min-h-[56px] flex-1 rounded-xl border-2 border-dashed border-cyan-400/70 bg-slate-800 px-4 text-base font-black text-cyan-200 disabled:opacity-60"
              >
                ＋ Add another line
              </button>
              <button
                type="button"
                onClick={playL4All}
                disabled={anyPlaying || l4Letters === 0}
                className="min-h-[56px] flex-1 rounded-xl bg-cyan-400 px-4 text-base font-black text-slate-950 disabled:opacity-60"
              >
                {l4PlayingRow === -1 ? "🎧 Playing all lines…" : "▶ Play all"}
              </button>
              <button
                type="button"
                onClick={clearL4Rows}
                disabled={anyPlaying || l4Letters === 0}
                aria-label="Clear all lines"
                className="min-h-[56px] rounded-xl border-2 border-slate-600 bg-slate-800 px-4 text-base font-black text-slate-200 disabled:opacity-60"
              >
                ✕ Clear all
              </button>
            </div>

            <p className="mt-3 text-center text-xs text-slate-300">
              {l4Rows.length} line(s) · {l4Letters} letters · {l4WordCount} words
              · ≈ {fmtDuration(estimateMs(l4AllTokens, timing))} to play all at{" "}
              {timing.profile === "standard"
                ? `standard ITU · ${timing.wpm.toFixed(0)} wpm`
                : "Morbraii spacing"}
            </p>
            <p className="mt-1 text-center text-[11px] text-slate-400">
              Up to {L4_MAX_ROWS} lines of {PHRASE_MAX} characters each. “Play
              all” puts exactly one word gap ({timing.wordGapMs} ms on this
              profile) between two lines.
            </p>
          </div>
        </section>
        {/* Lesson 5 — full phrase mastery (flagship) */}
        <section aria-label="Lesson 5" className="mt-8">
          <div className="rounded-3xl border-2 border-cyan-400/60 bg-gradient-to-b from-slate-900 via-slate-900 to-cyan-950/50 p-5 shadow-[0_0_40px_rgba(34,211,238,0.15)]">
            <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
              Flagship lesson
            </p>
            <h2 className="mt-1 text-2xl font-black">
              8 · Lesson 5 — Full phrase mastery
            </h2>
            <p className="mt-1 text-sm text-slate-300">
              One phrase: 4 words, 26 letters, 3 word gaps. Feel the whole thing
              as timed Morse vibration + melody, then reveal what your hands
              just read. Try it blind first.
            </p>
            <TimingLegend timing={timing} />

            <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900/80 p-4 text-center">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={playL5}
                  disabled={anyPlaying}
                  className="min-h-[72px] w-full rounded-2xl bg-cyan-400 text-xl font-black text-slate-950 disabled:opacity-60"
                >
                  {lessonPlaying === "l5"
                    ? `♪ Playing phrase… word ${l5WordIdx + 1} of 4`
                    : "📳 Feel the whole phrase"}
                </button>
                <button
                  type="button"
                  onClick={() => setL5Revealed((v) => !v)}
                  aria-pressed={l5Revealed}
                  className={`min-h-[56px] w-full rounded-xl border-2 text-base font-bold ${
                    l5Revealed
                      ? "quiz-glow border-cyan-300 bg-slate-800"
                      : "border-slate-600 bg-slate-800"
                  }`}
                >
                  {l5Revealed
                    ? "🙈 Hide the phrase again (try it blind)"
                    : "👀 Reveal the phrase"}
                </button>
              </div>

              <p className="mt-2 text-xs text-slate-400">
                ≈ {(l5Duration / 1000).toFixed(1)}s of Morse vibration + melody
                · word gap 220 ms
              </p>

              {lessonPlaying === "l5" && (
                <p role="status" className="mt-2 text-sm text-cyan-200">
                  Word {l5WordIdx + 1} of 4
                  {l5Revealed && l5WordIdx >= 0
                    ? ` (${L5_WORDS[l5WordIdx]})`
                    : ""}
                  {"  ·  "}
                  {l5ActiveIdx >= 0 && l5Tokens[l5ActiveIdx] !== " " ? (
                    <>
                      letter {l5LetterNum} of 26 — {l5Tokens[l5ActiveIdx]}{" "}
                      <span className="font-mono text-amber-200">
                        {byLetter(l5Tokens[l5ActiveIdx])
                          .morse.split("")
                          .join(" ")}
                      </span>
                    </>
                  ) : (
                    "word gap"
                  )}
                </p>
              )}

              <div className="mt-4" aria-label="Phrase in hybrid glyphs">
                <GlyphRow
                  tokens={l5Tokens}
                  activeIdx={l5ActiveIdx}
                  size="sm"
                  hidden={!l5Revealed}
                />
              </div>

              {l5Revealed ? (
                <div className="pop mt-4">
                  <p className="text-xl font-black tracking-[0.1em] text-white">
                    {L5_PHRASE}
                  </p>
                  <p className="mt-2 font-mono text-[11px] leading-5 text-amber-200">
                    {morseLegend(l5Tokens)}
                  </p>
                  <p className="mt-2 text-xs uppercase tracking-widest text-slate-400">
                    {l5Tokens.length} tiles · {L5_WORDS.length} words ·{" "}
                    {l5Tokens.filter((t) => t !== " ").length} letters
                  </p>
                </div>
              ) : (
                <p className="mt-4 rounded-xl bg-slate-800/60 p-3 text-sm text-slate-300">
                  Phrase hidden — 4 words, 26 letters. Nothing but your
                  fingertips tells you what it says. Tap{" "}
                  <b>Feel the whole phrase</b>, then reveal to check yourself.
                </p>
              )}
            </div>
          </div>
        </section>
        </TabSection>

        <TabSection show={view === "games" || view === "classic"}>
        <PianoGame timing={timing} hz={tonePlan.hz} sound={soundOn} />
        </TabSection>

        <TabSection show={view === "reference" || view === "classic"}>
        {/* Full reference */}
        <section aria-label="Full A to Z reference" className="mt-8">
          <h2 className="text-lg font-bold">9 · Full A–Z reference</h2>
          <div className="mt-3 overflow-hidden rounded-2xl border border-slate-700">
            {DATA.map((d, i) => (
              <button
                key={d.letter}
                type="button"
                onClick={() => pickLetterFromList(d.letter)}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                  i % 2 ? "bg-slate-900" : "bg-slate-800/60"
                } ${d.letter === selected ? "outline outline-2 outline-cyan-400" : ""}`}
              >
                <span className="w-8 text-2xl font-black">{d.letter}</span>
                <span className="w-20 shrink-0 font-mono text-sm text-amber-200">
                  {d.morse}
                </span>
                <span className="font-mono text-sm text-cyan-200">
                  ⠿{d.braille.join("")}
                </span>
                <span className="ml-auto font-mono text-xs text-fuchsia-300">
                  ♪ {(tonePlan.hz[d.letter] ?? freqOf(d.letter)).toFixed(0)} Hz
                </span>
              </button>
            ))}
          </div>
          <SignReference
            selected={selected}
            onPick={(l) => pickLetterFromList(l)}
            variant={signVariant}
            onVariant={setSignVariant}
          />
        </section>

        {/* Fingerspelling player — the "out" direction. Every handshape
            drawn here is one of the 26 verified in src/asl-signs.tsx; the
            letters advance on the shared Timing through playWordMelody,
            so there is no second clock and no separate letter rate. */}
        <section aria-label="Fingerspelling player" className="mt-8" data-spell="player">
          <h2 className="text-lg font-bold">
            10 · Fingerspelling player — Morse out to handshapes
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            Type a word (or take the melody word) and watch it fingerspelled
            one handshape at a time. Each letter holds for its own Morse plus
            the shared letter gap —{" "}
            {timing.profile === "standard"
              ? `standard ITU · ${timing.wpm.toFixed(0)} wpm`
              : "Morbraii spacing"}
            , letter gap {timing.letterGapMs} ms, word gap{" "}
            {timing.wordGapMs} ms — with the letter, its Morse and its
            handshape shown together.
          </p>

          <div className="mt-2 rounded-xl border-2 border-amber-400/60 bg-amber-400/5 p-3 text-xs text-amber-100">
            <p>
              <span className="font-bold">This is fingerspelling, not ASL.</span>{" "}
              One handshape per letter is the manual alphabet. ASL is a
              language with its own grammar, word order and signs, and none of
              that is shown here. Every handshape is one of the 26 verified
              American one-handed letters —{" "}
              <span className="font-bold">no sign is invented</span>. BSL is a
              different, two-handed alphabet and is not shown.
            </p>
            <p className="mt-2">
              <span className="font-bold">
                Nothing reads your hand or a camera.
              </span>{" "}
              This player only shows handshapes. There is no camera, no
              microphone and no recognition of any kind on this page.
            </p>
            <p className="mt-2">
              <span className="font-bold">J and Z are motion letters.</span>{" "}
              They are traced in the air, not held, so their drawings carry a
              motion path and are marked{" "}
              <span className="font-bold text-emerald-300">motion</span>.
            </p>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-700 bg-slate-900 p-4">
            <textarea
              rows={2}
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={PHRASE_MAX}
              value={spellText}
              onChange={(e) => setSpellFromInput(e.target.value)}
              placeholder="E.g. MIRACLE"
              aria-label={`Word to fingerspell, letters and spaces A to Z, up to ${PHRASE_MAX} characters`}
              className="min-h-[56px] w-full resize-y rounded-xl border-2 border-slate-600 bg-slate-800 px-4 py-2 text-center text-xl font-black uppercase tracking-[0.15em] text-white placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
            />
            <p className="mt-2 text-center text-xs text-slate-400">
              {countLetters(spellTokens)} letters · {countWords(spellTokens)}{" "}
              word(s) · ≈{fmtDuration(estimateMs(spellTokens, timing))} to
              spell at the current profile ·{" "}
              {Object.keys(ASL).length} of 26 handshapes available
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={playSpell}
                disabled={anyPlaying || countLetters(spellTokens) === 0}
                className="min-h-[64px] flex-1 rounded-2xl bg-emerald-500 text-xl font-black text-slate-950 disabled:opacity-60"
              >
                {spellPlaying ? "Spelling…" : "▶ Play fingerspelling"}
              </button>
              <button
                type="button"
                onClick={stopSpell}
                disabled={!spellPlaying}
                aria-label="Stop fingerspelling"
                className="min-h-[64px] rounded-2xl border-2 border-slate-600 bg-slate-800 px-5 text-lg font-black text-slate-200 disabled:opacity-60"
              >
                ■ Stop
              </button>
              <button
                type="button"
                onClick={() => setSpellFromInput(wordText)}
                disabled={anyPlaying || countLetters(word) === 0}
                aria-label="Use the melody word"
                className="min-h-[64px] rounded-2xl border-2 border-slate-600 bg-slate-800 px-4 text-sm font-bold text-slate-200 disabled:opacity-60"
              >
                ⬅ use the melody word
              </button>
              <button
                type="button"
                onClick={() => setSpellFromInput("")}
                disabled={anyPlaying || countLetters(spellTokens) === 0}
                aria-label="Clear the word to fingerspell"
                className="min-h-[64px] w-16 rounded-2xl border-2 border-slate-600 bg-slate-800 text-xl font-black text-slate-200 disabled:opacity-60"
              >
                ✕
              </button>
            </div>

            {spellCurrent && (
              <div
                data-spell="now"
                data-spell-letter={spellCurrent}
                className="mt-4 flex flex-wrap items-center justify-center gap-5 rounded-2xl border-2 border-emerald-400/60 bg-slate-950 p-4"
              >
                <div className="shrink-0">
                  <SignGlyph
                    letter={spellCurrent}
                    height={168}
                    variant={signVariant}
                    playing={spellPlaying}
                  />
                </div>
                <div className="min-w-[120px] text-center">
                  <div
                    data-spell="letter"
                    className="text-6xl font-black leading-none text-white"
                  >
                    {spellCurrent}
                  </div>
                  <div
                    data-spell="morse"
                    className="mt-2 font-mono text-3xl text-amber-200"
                  >
                    {byLetter(spellCurrent).morse}
                  </div>
                  <div className="mt-1 font-mono text-xs text-slate-400">
                    Morse · {byLetter(spellCurrent).morse.length} element
                    {byLetter(spellCurrent).morse.length === 1 ? "" : "s"}
                  </div>
                  {ASL[spellCurrent]?.trace ? (
                    <div className="mt-2 inline-block rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-950">
                      motion letter
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {countLetters(spellTokens) > 0 && (
              <div
                data-spell="strip"
                className="mt-3 flex flex-wrap items-start justify-center gap-2"
              >
                {spellTokens.map((t, i) =>
                  t === " " ? (
                    <span
                      key={`spell-gap-${i}`}
                      className="self-center px-1 text-xs text-slate-500"
                      aria-label="word gap"
                    >
                      ␣
                    </span>
                  ) : (
                    <div
                      key={`spell-tile-${i}-${t}`}
                      data-spell="tile"
                      data-spell-tile={t}
                      data-spell-active={i === spellIdx ? "1" : "0"}
                      className={`flex flex-col items-center rounded-xl border-2 px-1 py-1 ${
                        i === spellIdx
                          ? "quiz-glow border-emerald-300 bg-slate-800"
                          : "border-slate-700 bg-slate-900"
                      }`}
                    >
                      <SignGlyph letter={t} height={56} variant={signVariant} />
                      <span className="text-base font-black leading-5 text-white">
                        {t}
                      </span>
                      <span className="font-mono text-[10px] text-amber-200">
                        {byLetter(t).morse}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        </section>
        </TabSection>

        <footer className="mt-8 text-center text-xs text-slate-400">
          <p>
            Morbraii MVP — Morse timing × Braille touch × the manual alphabet × one hybrid glyph.
            Vibration needs Android + Chrome; everywhere else, light + sound
            keep the rhythm.
          </p>
          <p className="mt-3">
            <a
              className="underline decoration-dotted decoration-1 underline-offset-2 hover:text-cyan-200"
              href="/receive-lab.html"
            >
              experimental · listening prototype
            </a>{" "}
            — can this browser read Morse out of sound? Partial, mixed results so far, and
            nothing about it is finished.
          </p>
        </footer>
      </div>
    </main>
  );
}
