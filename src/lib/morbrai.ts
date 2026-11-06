/* ------------------------------------------------------------------ */
/* Morbraii core — ONE source of truth for the letter table, both      */
/* timing profiles, the pitch map and the Morse / Braille encoders.    */
/*                                                                     */
/* Pure data and pure functions: no React, no DOM, no browser API, so  */
/* the site, an API and a CLI can all import this same module. Nothing */
/* here may duplicate a table that lives somewhere else, and nothing   */
/* elsewhere may duplicate a table that lives here.                    */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Mapping data: standard ITU Morse + Grade-1 Braille (dots 1-6:       */
/* 1-2-3 down the left column, 4-5-6 down the right column)            */
/* ------------------------------------------------------------------ */
export type LetterEntry = { letter: string; morse: string; braille: number[] };

export const DATA: LetterEntry[] = [
  { letter: "A", morse: ".-", braille: [1] },
  { letter: "B", morse: "-...", braille: [1, 2] },
  { letter: "C", morse: "-.-.", braille: [1, 4] },
  { letter: "D", morse: "-..", braille: [1, 4, 5] },
  { letter: "E", morse: ".", braille: [1, 5] },
  { letter: "F", morse: "..-.", braille: [1, 2, 4] },
  { letter: "G", morse: "--.", braille: [1, 2, 4, 5] },
  { letter: "H", morse: "....", braille: [1, 2, 5] },
  { letter: "I", morse: "..", braille: [2, 4] },
  { letter: "J", morse: ".---", braille: [2, 4, 5] },
  { letter: "K", morse: "-.-", braille: [1, 3] },
  { letter: "L", morse: ".-..", braille: [1, 2, 3] },
  { letter: "M", morse: "--", braille: [1, 3, 4] },
  { letter: "N", morse: "-.", braille: [1, 3, 4, 5] },
  { letter: "O", morse: "---", braille: [1, 3, 5] },
  { letter: "P", morse: ".--.", braille: [1, 2, 3, 4] },
  { letter: "Q", morse: "--.-", braille: [1, 2, 3, 4, 5] },
  { letter: "R", morse: ".-.", braille: [1, 2, 3, 5] },
  { letter: "S", morse: "...", braille: [2, 3, 4] },
  { letter: "T", morse: "-", braille: [2, 3, 4, 5] },
  { letter: "U", morse: "..-", braille: [1, 3, 6] },
  { letter: "V", morse: "...-", braille: [1, 2, 3, 6] },
  { letter: "W", morse: ".--", braille: [2, 4, 5, 6] },
  { letter: "X", morse: "-..-", braille: [1, 3, 4, 6] },
  { letter: "Y", morse: "-.--", braille: [1, 3, 4, 5, 6] },
  { letter: "Z", morse: "--..", braille: [1, 3, 5, 6] },
];

export const byLetter = (l: string): LetterEntry =>
  DATA.find((d) => d.letter === l) ?? DATA[0];

/* A-Z in DATA order — the one letter table, not a second copy of it. */
export const LETTER_ORDER = DATA.map((d) => d.letter);

/* Morse codes are unique across A–Z, so the letter behind a pattern is
   recoverable without threading it through the players. */
export const LETTER_BY_MORSE: Record<string, string> = Object.fromEntries(
  DATA.map((d) => [d.morse, d.letter]),
);
export const letterOfMorse = (m: string): string => LETTER_BY_MORSE[m] ?? "";

/* ------------------------------------------------------------------ */
/* TIMING — one timeline, two selectable grids.                        */
/*                                                                     */
/* Every player below (playMorse, playWordMelody, the glyph step and   */
/* the light step callbacks) reads its timings from ONE object of type */
/* Timing, built by buildTiming() and passed in as `timing`. No        */
/* component and no player keeps its own dot/dash/gap constants, so    */
/* there is exactly one source of truth for the rhythm.                */
/*                                                                     */
/*  · "standard" — real ITU Morse: dot 1u, dash 3u, element gap 1u,    */
/*    letter gap 3u, word gap 7u, with 50 units to the word (PARIS),   */
/*    so unit = 1200 / wpm ms. This is the code that transfers: what   */
/*    is learned here reads on any real Morse channel.                 */
/*  · "morbrai"  — OUR spacing, explicitly NOT ITU. The LETTERS are    */
/*    identical to standard (dot 1u, dash 3u); only the boundaries are */
/*    exaggerated so a boundary is felt rather than guessed: element   */
/*    gap 2u, letter gap 6u, word gap 14u.                             */
/* ------------------------------------------------------------------ */
export type ProfileId = "standard" | "morbrai";

export type Timing = {
  profile: ProfileId;
  unitMs: number;
  dotMs: number;
  dashMs: number;
  elementGapMs: number;
  letterGapMs: number;
  wordGapMs: number;
  /* PARIS-equivalent pace of this unit, for honest labelling only. */
  wpm: number;
};

/* Gap widths, in units (multiples of one dot), per profile. */
export const GAP_UNITS: Record<
  ProfileId,
  { element: number; letter: number; word: number }
> = {
  standard: { element: 1, letter: 3, word: 7 },
  morbrai: { element: 2, letter: 6, word: 14 },
};

/* Pace choices. 50 units to the word → unit = 1200 / wpm. */
export const WPM_CHOICES = [5, 8, 12] as const;
export const STANDARD_DEFAULT_WPM = 5; // a first learner needs a copyable pace
export const MORBRAI_UNIT_CHOICES = [100, 150, 200, 240] as const;
export const MORBRAI_DEFAULT_UNIT = 150;

export const unitOfWpm = (wpm: number): number => Math.round(1200 / wpm);
export const wpmOfUnit = (unitMs: number): number => 1200 / unitMs;

export function buildTiming(profile: ProfileId, unitMs: number): Timing {
  const g = GAP_UNITS[profile];
  return {
    profile,
    unitMs,
    dotMs: unitMs,
    dashMs: unitMs * 3,
    elementGapMs: unitMs * g.element,
    letterGapMs: unitMs * g.letter,
    wordGapMs: unitMs * g.word,
    wpm: wpmOfUnit(unitMs),
  };
}

/* One letter's vibration pattern in ms under a given profile. The web
   Vibration API is on/off only — this is durations, not frequencies. */
export function vibrationPattern(morse: string, timing: Timing): number[] {
  const p: number[] = [];
  [...morse].forEach((s, i) => {
    p.push(s === "." ? timing.dotMs : timing.dashMs);
    if (i < morse.length - 1) p.push(timing.elementGapMs);
  });
  return p;
}

/* Total time of one letter's buzz, internal element gaps included. */
export function patternMs(morse: string, timing: Timing): number {
  return vibrationPattern(morse, timing).reduce((a, b) => a + b, 0);
}

/* ------------------------------------------------------------------ */
/* Piano layer: every letter A-Z owns one equal-temperament pitch in   */
/* C major (A4 = 440 Hz). A-O walk diatonically C4 -> C6; P-Z keep     */
/* climbing the same scale (D6 ... G7) so all 26 letters are distinct  */
/* and every word plays as a melody in C major.                        */
/* ------------------------------------------------------------------ */
export const NOTE_FREQ: Record<string, number> = {
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  F4: 349.23,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  F5: 698.46,
  G5: 783.99,
  A5: 880.0,
  B5: 987.77,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  F6: 1396.91,
  G6: 1567.98,
  A6: 1760.0,
  B6: 1975.53,
  C7: 2093.0,
  D7: 2349.32,
  E7: 2637.02,
  F7: 2793.83,
  G7: 3135.96,
};

export const LETTER_NOTE: Record<string, string> = {
  A: "C4",
  B: "D4",
  C: "E4",
  D: "F4",
  E: "G4",
  F: "A4",
  G: "B4",
  H: "C5",
  I: "D5",
  J: "E5",
  K: "F5",
  L: "G5",
  M: "A5",
  N: "B5",
  O: "C6",
  P: "D6",
  Q: "E6",
  R: "F6",
  S: "G6",
  T: "A6",
  U: "B6",
  V: "C7",
  W: "D7",
  X: "E7",
  Y: "F7",
  Z: "G7",
};

export const noteOf = (l: string): string => LETTER_NOTE[l] ?? "C4";
export const freqOf = (l: string): number => NOTE_FREQ[noteOf(l)] ?? 261.63;

/* ------------------------------------------------------------------ */
/* ENCODERS — a message in, a schedule out.                            */
/*                                                                     */
/* This is the exact token walk the page's players perform: one token  */
/* per letter, " " = a word gap, a letter followed by a letter costs   */
/* one letter gap, a letter followed by a space costs none (the space  */
/* owns the whole boundary), and the last token adds no trailing gap.  */
/* So a schedule built here is the same rhythm the site plays.         */
/* ------------------------------------------------------------------ */
export const morseOf = (letter: string): string => byLetter(letter).morse;
export const brailleOf = (letter: string): number[] => byLetter(letter).braille;

export type ScheduleElement = {
  symbol: "." | "-";
  durationMs: number; // how long the element sounds
  gapAfterMs: number; // silence after it: element, letter, word or none
};

export type ScheduleLetter = {
  letter: string;
  morse: string;
  braille: number[];
  hz: number;
  startMs: number; // when its first element sounds
  durationMs: number; // pattern only, internal element gaps included
  elements: ScheduleElement[];
};

export type Schedule = {
  profile: ProfileId;
  unitMs: number;
  wpm: number;
  text: string;
  tokens: string[];
  letters: ScheduleLetter[];
  totalMs: number;
};

/* Raw text -> the token array the players consume: A-Z and spaces only,
   runs of space collapsed, no leading or trailing space. */
export function tokenize(text: string): string[] {
  const clean = text
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean === "" ? [] : clean.split("");
}

export function encodeMessage(text: string, timing: Timing): Schedule {
  const tokens = tokenize(text);
  const letters: ScheduleLetter[] = [];
  let t = 0;
  tokens.forEach((tok, i) => {
    if (tok === " ") {
      t += timing.wordGapMs;
      return;
    }
    const e = byLetter(tok);
    const next = tokens[i + 1];
    const elements: ScheduleElement[] = [];
    let st = 0;
    [...e.morse].forEach((s, si) => {
      const dur = s === "." ? timing.dotMs : timing.dashMs;
      const last = si === e.morse.length - 1;
      const gapAfterMs = !last
        ? timing.elementGapMs
        : next === undefined
          ? 0
          : next === " "
            ? timing.wordGapMs
            : timing.letterGapMs;
      elements.push({ symbol: s as "." | "-", durationMs: dur, gapAfterMs });
      st += dur + timing.elementGapMs;
    });
    const durationMs = st - timing.elementGapMs;
    letters.push({
      letter: e.letter,
      morse: e.morse,
      braille: e.braille,
      hz: freqOf(e.letter),
      startMs: t,
      durationMs,
      elements,
    });
    t += durationMs;
    if (next !== undefined && next !== " ") t += timing.letterGapMs;
  });
  return {
    profile: timing.profile,
    unitMs: timing.unitMs,
    wpm: timing.wpm,
    text: tokens.join(""),
    tokens,
    letters,
    totalMs: t,
  };
}
