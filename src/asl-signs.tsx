/* ------------------------------------------------------------------ */
/* ASL manual alphabet — one-handed American fingerspelling.           */
/*                                                                     */
/* A third representation of a letter, beside the Morse wave and the   */
/* Braille cell. Every handshape is hand-drawn SVG line art built from */
/* the primitives below (palm, four fingers, thumb), never a photo and */
/* never generated imagery: a wrong fingerspelling chart teaches the   */
/* wrong thing to the one person who cannot check it.                  */
/*                                                                     */
/* This is AMERICAN Sign Language. British Sign Language is a          */
/* different, two-handed alphabet; it is not drawn here and must not   */
/* be mixed in. Every shape was checked letter by letter against the   */
/* fetched references in ASL_SOURCES (see also asl_sources.md in      */
/* /home/team/shared).                                                 */
/* ------------------------------------------------------------------ */
export type FingerState =
  | "up" /* straight, extended */
  | "fold" /* curled into the fist: knuckle bump above the palm */
  | "short" /* curled tighter, thumb tucked under it (M, N) */
  | "tip" /* fingertip curled onto the thumb (E) */
  | "hook" /* bent at both joints (X) */
  | "cross"; /* crossed over its neighbour (R) */

export type ThumbState =
  | "none" /* hidden behind the fingers (B, H) */
  | "sideUp" /* straight up alongside the index (A) */
  | "parallel" /* extended the same way as the index (G, Q) */
  | "across" /* lying across the front of the folded fingers (S, I, U, V, W, X, Z) */
  | "acrossHigh" /* across, higher, with the fingertips resting on it (E) */
  | "under" /* tucked under three fingers, base showing (M) */
  | "underHigh" /* tucked under two fingers, base showing (N) */
  | "tipBetween" /* tip poking up between index and middle (T) */
  | "upBetween" /* pointing up between index and middle (K, P) */
  | "out" /* out at right angles to the fingers (L, Y) */
  | "circleF" /* thumb and index tip touching, loop at the index base (F) */
  | "circleD"; /* thumb meeting the middle-finger tips, loop under the index (D) */

export type SignSpec = {
  i: FingerState;
  m: FingerState;
  r: FingerState;
  p: FingerState;
  thumb: ThumbState;
  /** whole-hand rotation in degrees, clockwise (orientation letters only) */
  rot?: number;
  /** J and Z are traced, not held: the drawing carries a motion path */
  trace?: "j" | "z";
  /** drawn by hand where the shape is a ring, not fingers (C, O) */
  custom?: "C" | "O";
  /** what this letter shares with another, or why the flat view is limited */
  note?: string;
  /** per-finger spread angle in degrees, + = to the right (V, W, K, Y) */
  ang?: Partial<Record<"i" | "m" | "r" | "p", number>>;
};

/* The 26 handshapes. Sources for each are in ASL_SOURCES below; the notes
   are the letters where a flat, single frame is not the whole letter. */
export const ASL: Record<string, SignSpec> = {
  A: { i: "fold", m: "fold", r: "fold", p: "fold", thumb: "sideUp" },
  B: { i: "up", m: "up", r: "up", p: "up", thumb: "none" },
  C: { i: "fold", m: "fold", r: "fold", p: "fold", thumb: "none", custom: "C" },
  D: {
    i: "up",
    m: "fold",
    r: "fold",
    p: "fold",
    thumb: "circleD",
    note: "Index up, and the thumb meets the tips of the middle, ring and little fingers to close the loop at its base.",
  },
  E: {
    i: "tip",
    m: "tip",
    r: "tip",
    p: "tip",
    thumb: "acrossHigh",
    note: "E and S are both closed fists: in E the fingertips curl onto the thumb, in S the thumb lies across the fingers. Fingertips-on-thumb is the older, formal E (Wikipedia).",
  },
  F: { i: "fold", m: "up", r: "up", p: "up", thumb: "circleF", ang: { m: -6, r: 4, p: 14 }, note: "Thumb and index tip touching; the other three fingers can be held apart or together (Start ASL)." },
  G: {
    i: "up",
    m: "fold",
    r: "fold",
    p: "fold",
    thumb: "parallel",
    rot: 90,
    note: "Handshape shared with Q, turned the other way up (Wikipedia).",
  },
  H: {
    i: "up",
    m: "up",
    r: "fold",
    p: "fold",
    thumb: "none",
    rot: 90,
    note: "Handshape shared with U, turned sideways (Wikipedia).",
  },
  I: { i: "fold", m: "fold", r: "fold", p: "up", thumb: "across" },
  J: {
    i: "fold",
    m: "fold",
    r: "fold",
    p: "up",
    thumb: "across",
    trace: "j",
    note: "MOTION: J is I with a twist of the wrist, the little finger tracing the curve of the printed J (Wikipedia). No frozen shape is the letter.",
  },
  K: {
    i: "up",
    m: "up",
    r: "fold",
    p: "fold",
    thumb: "upBetween",
    ang: { i: -12, m: 12 },
    note: "Handshape shared with P, which points it down (Wikipedia).",
  },
  L: { i: "up", m: "fold", r: "fold", p: "fold", thumb: "out" },
  M: {
    i: "short",
    m: "short",
    r: "short",
    p: "fold",
    thumb: "under",
    note: "M, N and T are one fist with the thumb under one, two or three fingers (Start ASL). Flat from the front, M and N look almost identical — the difference is how many fingers cover the thumb.",
  },
  N: {
    i: "short",
    m: "short",
    r: "fold",
    p: "fold",
    thumb: "underHigh",
    note: "N is the M fist with the thumb under two fingers instead of three (Start ASL). See the M note: flat from the front the two are nearly the same shape.",
  },
  O: { i: "fold", m: "fold", r: "fold", p: "fold", thumb: "none", custom: "O" },
  P: {
    i: "up",
    m: "up",
    r: "fold",
    p: "fold",
    thumb: "upBetween",
    rot: 180,
    ang: { i: -12, m: 12 },
    note: "The K handshape, middle finger pointing to the floor (Start ASL).",
  },
  Q: {
    i: "up",
    m: "fold",
    r: "fold",
    p: "fold",
    thumb: "parallel",
    rot: 180,
    note: "The G handshape, pointing to the floor (Start ASL).",
  },
  R: { i: "cross", m: "cross", r: "fold", p: "fold", thumb: "across", note: "Index and middle are crossed, not spread." },
  S: {
    i: "fold",
    m: "fold",
    r: "fold",
    p: "fold",
    thumb: "across",
    note: "A and S are the same fist with the thumb in a different place: on the side of the fist for A, across the front for S (Wikipedia).",
  },
  T: {
    i: "fold",
    m: "fold",
    r: "fold",
    p: "fold",
    thumb: "tipBetween",
    note: "The thumb is under the index finger only, its tip showing between index and middle (Start ASL).",
  },
  U: { i: "up", m: "up", r: "fold", p: "fold", thumb: "across", note: "Handshape shared with H, which turns it sideways (Wikipedia)." },
  V: { i: "up", m: "up", r: "fold", p: "fold", thumb: "across", ang: { i: -14, m: 14 } },
  W: { i: "up", m: "up", r: "up", p: "fold", thumb: "across", ang: { i: -18, m: 0, r: 18 } },
  X: { i: "hook", m: "fold", r: "fold", p: "fold", thumb: "across", note: "The index is hooked, not straight." },
  Y: { i: "fold", m: "fold", r: "fold", p: "up", thumb: "out", rot: -10, ang: { p: 38 } },
  Z: {
    i: "up",
    m: "fold",
    r: "fold",
    p: "fold",
    thumb: "across",
    trace: "z",
    note: "MOTION: Z is the index finger moved back and forth, tracing the zig-zag of the printed Z (Wikipedia). No frozen shape is the letter.",
  },
};

/* ------------------------------------------------------------------ */
/* What we checked the handshapes against, and what this drawing is    */
/* not allowed to claim. Rendered next to the signs on the page.       */
/* ------------------------------------------------------------------ */
export const ASL_SOURCES: { label: string; detail: string }[] = [
  {
    label: "Wikipedia · American manual alphabet",
    detail:
      "fetched 11 Oct 2026: J is I with a wrist twist tracing the J; Z is the index finger tracing the zig-zag; H/U, K/P and G/Q share one handshape and differ only by orientation; A and S share a fist with the thumb on the side (A) or in front (S).",
  },
  {
    label: "Start ASL · Sign Language Alphabet",
    detail:
      "fetched 11 Oct 2026: C is the hand shaped like a C; F has the three fingers apart or together; M, N, T are one fist with the thumb under three, two or one fingers; P is K pointing down; Q is G pointing down.",
  },
  {
    label: "Reference charts compared against",
    detail:
      "the publisher's own A–Z chart at startasl.com (© 2008 StartASL.com, used only for checking, not reproduced) and the public-domain Gallaudet-TT derived chart on Wikimedia Commons (File:Asl alphabet gallaudet.svg). Both are photographs/drawings; neither is copied here.",
  },
];

export const ASL_HONESTY: { label: string; detail: string }[] = [
  {
    label: "Stylised line art, not photographs.",
    detail:
      "These are our own flat SVG diagrams — palm, four fingers and a thumb in line art. They show the shape a hand makes. They are not a hand and not a video.",
  },
  {
    label: "J and Z are motion letters.",
    detail:
      "They are traced, not held: J is the I handshape with the wrist twisting to trace a J, Z is the index finger tracing a zig-zag. A still diagram cannot be those letters, so the traced path is drawn as a dashed line — the dashed line is the letter, the shape beside it is only where the hand starts.",
  },
  {
    label: "A reference, not instruction.",
    detail:
      "Showing a diagram does not teach anyone to fingerspell. Morbraii is not a sign-language course, and nobody has learned from this drawing — it sits beside the Morse wave and the Braille cell as a third image of the same letter.",
  },
  {
    label: "American, not British.",
    detail:
      "This is the one-handed American manual alphabet, the most widely recognised one. British Sign Language fingerspelling is a different, two-handed alphabet and is deliberately not shown here.",
  },
  {
    label: "Nothing reads your hand.",
    detail:
      "There is no camera input and no sign recognition anywhere in Morbraii. Recognising a handshape from a camera is a different build, and one we have not attempted.",
  },
];

/* ------------------------------------------------------------------ */
/* Drawing. One continuous hand outline in a 100 × 150 box, placed in  */
/* a 150 × 150 frame so a rotated hand (G, H, P, Q) keeps its size.    */
/* The outline traces palm, wrist and every finger in one path, so a   */
/* fist reads as a fist and four fingers read as four fingers; the     */
/* thumb and the J/Z motion paths are separate strokes on top.         */
/* ------------------------------------------------------------------ */
const FRAME = 150;
const KNEE = 58; /* knuckle line: fingers rise from here */
const PALM_L = 31;
const PALM_R = 72;
const WRIST_L = 42;
const WRIST_R = 58;
const WRIST_TOP = 108;
const WRIST_BOT = 140;
type FKey = "i" | "m" | "r" | "p";
const FX: Record<FKey, number> = { i: 41, m: 50.5, r: 60, p: 68.5 };
const FLEN: Record<FKey, number> = { i: 38, m: 42, r: 38, p: 30 };
const FKEYS: FKey[] = ["i", "m", "r", "p"];
const HW = 5.1; /* finger half-width: adjacent fingers touch */

/* ------------------------------------------------------------------ */
/* A/B/C/D — four treatments of ONE set of handshapes.                 */
/*                                                                     */
/* Every treatment is handed the SAME path data: the hand outline, the */
/* thumb, the crossed fingers and the J/Z trace are computed once, and */
/* a variant may only change colour, stroke weight, fill and the gap   */
/* between two lines that would otherwise touch. No variant moves a    */
/* finger, so no treatment can change what a handshape means.          */
/* ------------------------------------------------------------------ */
export type SignVariantId = "A" | "B" | "C" | "D";
export const SIGN_VARIANT_ORDER: SignVariantId[] = ["A", "B", "C", "D"];
export const SIGN_DEFAULT_VARIANT: SignVariantId = "A";
export const asSignVariant = (v: string | null): SignVariantId =>
  SIGN_VARIANT_ORDER.includes(v as SignVariantId)
    ? (v as SignVariantId)
    : SIGN_DEFAULT_VARIANT;

type SignStyle = {
  /** the hand outline */
  line: string;
  /** interior detail marks (only the C and O drawings have any) */
  soft: string;
  /** the thumb and the crossed fingers of R */
  accent: string;
  /** the mass the hand is filled with; "none" = outline only */
  fill: string;
  /** the thick C and O curves — the mass boundary for those two letters */
  thickInk: string;
  /** the J/Z motion trace, kept a different colour from the hand */
  traceInk: string;
  hand: number;
  thumb: number;
  softW: number;
  cross: number;
  trace: number;
  thickC: number;
  thickO: number;
  /** the surface the sign is drawn on: the colour of the separation stroke */
  surface: string;
  /** a surface-coloured stroke drawn under every line of the hand, so two
      lines that meet in A stay apart here (0 = off, and A is 0) */
  halo: number;
};

/* Every sign on the page is drawn on a slate-900 panel — in BOTH page
   themes, because the panels carry a fixed dark background. This hex is the
   value the browser actually paints for bg-slate-900 (resolved from the
   page's own oklch through a canvas, not copied from a palette doc), because
   C and D cut their separation gaps in exactly this colour. Paper is a
   second surface, off-screen: it is what the print-intent treatment is
   measured against, and the picker draws one small sample on it. */
const PANEL_DARK = "#0f172b";
const PAPER = "#ffffff";

const A_DARK: SignStyle = {
  line: "#e2e8f0",
  soft: "#7c8ba1",
  accent: "#34d399",
  fill: "#1e293b",
  thickInk: "#e2e8f0",
  traceInk: "#34d399",
  hand: 2.5,
  thumb: 9,
  softW: 2,
  cross: 8,
  trace: 3,
  thickC: 15,
  thickO: 13,
  surface: PANEL_DARK,
  halo: 0,
};
const A_LIGHT: SignStyle = {
  line: "#0f172a",
  soft: "#475569",
  accent: "#059669",
  fill: "#e2e8f0",
  thickInk: "#0f172a",
  traceInk: "#059669",
  hand: 2.5,
  thumb: 9,
  softW: 2,
  cross: 8,
  trace: 3,
  thickC: 15,
  thickO: 13,
  surface: PAPER,
  halo: 0,
};

/* B — heavy monochrome outline. No fill and one ink for everything, so
   nothing in the drawing depends on telling two colours apart. */
const B_DARK: SignStyle = {
  line: "#ffffff",
  soft: "#ffffff",
  accent: "#ffffff",
  fill: "none",
  thickInk: "#ffffff",
  traceInk: "#ffffff",
  hand: 6.5,
  thumb: 10,
  softW: 0,
  cross: 10,
  trace: 5.5,
  thickC: 18,
  thickO: 17,
  surface: PANEL_DARK,
  halo: 0,
};
const B_LIGHT: SignStyle = {
  ...B_DARK,
  line: "#000000",
  soft: "#000000",
  accent: "#000000",
  thickInk: "#000000",
  traceInk: "#000000",
  surface: PAPER,
};

/* C — one solid mass. The hand is filled and its outline stroke is
   dropped; the thumb and R's crossed fingers are the same colour as the
   mass and are separated from it by a narrow cut of the surface colour,
   which is the only line left inside the silhouette. */
const C_DARK: SignStyle = {
  line: "none",
  soft: "#ffffff",
  accent: "#ffffff",
  fill: "#ffffff",
  thickInk: "#ffffff",
  traceInk: "#34d399",
  hand: 0,
  thumb: 9,
  softW: 0,
  cross: 9,
  trace: 3,
  thickC: 15,
  thickO: 13,
  surface: PANEL_DARK,
  halo: 2.5,
};
const C_LIGHT: SignStyle = {
  ...C_DARK,
  soft: "#000000",
  accent: "#000000",
  fill: "#000000",
  thickInk: "#000000",
  traceInk: "#059669",
  surface: PAPER,
};

/* D — print-intent outline. Thinner than B and every line of the hand
   carries a clear margin of the surface colour, so the lines cannot
   merge into each other. Finger positions are A's: this is a drawing
   for paper, not an embossing master. */
const D_DARK: SignStyle = {
  line: "#ffffff",
  soft: "#ffffff",
  accent: "#ffffff",
  fill: "none",
  thickInk: "#ffffff",
  traceInk: "#ffffff",
  hand: 4.2,
  thumb: 6,
  softW: 0,
  cross: 8,
  trace: 4,
  thickC: 15,
  thickO: 13,
  surface: PANEL_DARK,
  halo: 5,
};
const D_LIGHT: SignStyle = {
  ...D_DARK,
  line: "#000000",
  soft: "#000000",
  accent: "#000000",
  thickInk: "#000000",
  traceInk: "#000000",
  surface: PAPER,
};

const SIGN_STYLES: Record<
  SignVariantId,
  { dark: SignStyle; light: SignStyle }
> = {
  A: { dark: A_DARK, light: A_LIGHT },
  B: { dark: B_DARK, light: B_LIGHT },
  C: { dark: C_DARK, light: C_LIGHT },
  D: { dark: D_DARK, light: D_LIGHT },
};

export const signStyle = (v: SignVariantId, light: boolean): SignStyle =>
  SIGN_STYLES[v][light ? "light" : "dark"];

/* What each treatment is FOR, and what it cannot show. Written for the
   reader, not as a description of the drawing: the label has to be the
   reason to choose it. */
export const SIGN_VARIANTS: {
  id: SignVariantId;
  name: string;
  forWhat: string;
  detail: string;
  limit: string;
}[] = [
  {
    id: "A",
    name: "A · as shipped",
    forWhat: "the default — what loads first",
    detail:
      "Filled line art: the hand has a dark mass and a light outline, the thumb and the motion trace are green. Unchanged from what the page has been serving.",
    limit:
      "A is a thin drawing: at tile size its outline is about 1 CSS pixel and its fill is very close to the panel behind it, so the outline is doing nearly all the work.",
  },
  {
    id: "B",
    name: "B · heavy outline",
    forWhat: "low vision — the biggest marks this geometry can carry",
    detail:
      "One ink, no fill, roughly two and a half times A's stroke weight. Nothing in B is distinguished by colour, so it survives any colour vision: the letter is the shape of the line alone.",
    limit:
      "Monochrome costs you the green thumb. Where the thumb's position is the difference — A against S — B shows it in the line only. B also merges where the hand's own lines meet, so a folded fist closes up at small sizes.",
  },
  {
    id: "C",
    name: "C · solid silhouette",
    forWhat: "reading small — tiles, thumbnails, a glance",
    detail:
      "The hand as one filled mass with no outline stroke and no interior detail marks. The thumb and R's crossed fingers are cut out of the mass by a narrow gap, so they are still in the drawing.",
    limit:
      "A silhouette keeps the outline and loses the inside. Letters that differ only in how far a finger curls — E and S, M and N — can read alike at thumbnail size, and the cut-out thumb is thinner than in A. Trust the letter label, not the blob.",
  },
  {
    id: "D",
    name: "D · print-intent outline",
    forWhat: "paper — a drawing meant to be printed, not a tactile feature",
    detail:
      "Thinner lines than B, and every line of the hand carries a clear margin of the surface colour, so lines that touch in A stay apart instead of merging. This is a print drawing; it is not an embossed or raised-line file and nothing here outputs to a tactile display.",
    limit:
      "The margins only separate lines that already meet. A true embossing master would need the fingers physically pulled apart, which is a different drawing of the letter, so D's finger positions are exactly A's.",
  },
];

/* ------------------------------------------------------------------ */
/* WCAG 2.1 relative-luminance contrast, so "more readable" can be a   */
/* number on the page instead of an adjective.                         */
/* ------------------------------------------------------------------ */
function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(channelToLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.1 contrast ratio between two hex colours, to 0.01. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** The ink that carries a treatment's contrast: the outline, or the mass
    where the treatment has no outline at all. */
export function primaryInk(style: SignStyle): string {
  return style.hand > 0 ? style.line : style.fill;
}

/* Ink colours are exact source values; the surface is measured on the
   live page (see the picker, which prints both). PANEL_DARK is the
   slate-900 panel every sign is drawn on. */
export const SIGN_CONTRAST = SIGN_VARIANT_ORDER.map((id) => {
  const dark = SIGN_STYLES[id].dark;
  const light = SIGN_STYLES[id].light;
  return {
    id,
    ink: primaryInk(dark),
    onPanel: contrastRatio(primaryInk(dark), dark.surface),
    fill: dark.fill === "none" ? null : dark.fill,
    fillOnPanel:
      dark.fill === "none" ? null : contrastRatio(dark.fill, dark.surface),
    accent: dark.accent,
    accentOnPanel: contrastRatio(dark.accent, dark.surface),
    printInk: primaryInk(light),
    onPaper: contrastRatio(primaryInk(light), light.surface),
  };
});

function upTip(bx: number, ang: number, len: number) {
  const rad = (ang * Math.PI) / 180;
  return {
    x: +(bx + Math.sin(rad) * len).toFixed(1),
    y: +(KNEE - Math.cos(rad) * len).toFixed(1),
  };
}

/** The whole hand as one outline: fingers and knuckles along the top edge. */
function handPath(spec: SignSpec): string {
  const p: string[] = [`M${PALM_L},${KNEE}`];
  FKEYS.forEach((k, idx) => {
    const bx = FX[k];
    const ang = spec.ang?.[k] ?? 0;
    const st = spec[k];
    const nextLeft = idx < FKEYS.length - 1 ? FX[FKEYS[idx + 1]] - HW : PALM_R;
    if (st === "up") {
      const t = upTip(bx, ang, FLEN[k]);
      p.push(`L${(t.x - HW).toFixed(1)},${(t.y + 5).toFixed(1)}`);
      p.push(
        `Q${(t.x - HW - 1).toFixed(1)},${(t.y - 3).toFixed(1)} ${t.x.toFixed(
          1,
        )},${(t.y - 3).toFixed(1)}`,
      );
      p.push(
        `Q${(t.x + HW + 1).toFixed(1)},${(t.y - 3).toFixed(1)} ${(
          t.x + HW
        ).toFixed(1)},${(t.y + 5).toFixed(1)}`,
      );
      /* valley between this finger and the next */
      p.push(
        `Q${((t.x + HW + nextLeft) / 2).toFixed(1)},${KNEE + 12} ${nextLeft.toFixed(
          1,
        )},${KNEE}`,
      );
      return;
    }
    if (st === "hook") {
      /* X: the index bent at both joints */
      p.push(`L${(bx - HW).toFixed(1)},${KNEE - 20}`);
      p.push(`Q${(bx - HW).toFixed(1)},${KNEE - 32} ${(bx + 5).toFixed(1)},${KNEE - 32}`);
      p.push(`Q${(bx + HW + 1).toFixed(1)},${KNEE - 32} ${(bx + HW).toFixed(1)},${KNEE - 20}`);
      p.push(`Q${(bx + 6).toFixed(1)},${KNEE - 15} ${nextLeft.toFixed(1)},${KNEE}`);
      return;
    }
    const h = st === "fold" ? 9 : st === "short" ? 7 : 4;
    p.push(`Q${(bx - HW - 2).toFixed(1)},${KNEE - h} ${bx.toFixed(1)},${KNEE - h}`);
    p.push(`Q${(bx + HW + 2).toFixed(1)},${KNEE - h} ${nextLeft.toFixed(1)},${KNEE}`);
  });
  p.push(`L${PALM_R - 2},${WRIST_TOP}`);
  p.push(`L${WRIST_R},${WRIST_BOT - 4}`);
  p.push(`Q${WRIST_R},${WRIST_BOT} ${WRIST_R - 4},${WRIST_BOT}`);
  p.push(`L${WRIST_L + 4},${WRIST_BOT}`);
  p.push(`Q${WRIST_L},${WRIST_BOT} ${WRIST_L},${WRIST_BOT - 4}`);
  p.push(`L${PALM_L + 2},${WRIST_TOP}`);
  p.push("Z");
  return p.join(" ");
}

/** One line of the hand. When the treatment asks for a separation gap, a
    stroke of the surface colour is drawn under it first — same `d`, same
    width plus the gap on both sides. Nothing else about the line changes. */
function handLine(d: string, style: SignStyle, color: string, width: number) {
  return (
    <>
      {style.halo > 0 ? (
        <path
          d={d}
          fill="none"
          stroke={style.surface}
          strokeWidth={+(width + style.halo * 2).toFixed(2)}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  );
}

/** The same separation gap for a circle (the F and D thumb loops). */
function handRing(
  cx: number,
  cy: number,
  r: number,
  style: SignStyle,
  width: number,
) {
  return (
    <>
      {style.halo > 0 ? (
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={style.surface}
          strokeWidth={+(width + style.halo * 2).toFixed(2)}
        />
      ) : null}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={style.accent}
        strokeWidth={width}
      />
    </>
  );
}

function thumbNode(state: ThumbState, style: SignStyle, front: boolean) {
  const back = !front;
  const thumb = (d: string) => handLine(d, style, style.accent, style.thumb);
  switch (state) {
    case "none":
      return null;
    /* alongside the index, on the side of the fist (A) */
    case "sideUp":
      return front ? thumb("M35,88 L35,47") : null;
    /* extended the same way the index is, for G and Q */
    case "parallel":
      return front ? thumb("M34,88 L34,30") : null;
    /* across the front of the folded fingers (S, I, U, V, W, X, Z) */
    case "across":
      return front ? thumb("M33,79 Q48,72 65,75") : null;
    /* across, higher, with the fingertips curled onto it (E) */
    case "acrossHigh":
      return front ? thumb("M33,72 Q48,64 65,67") : null;
    /* base of the thumb showing below folded fingers: M under three, N two */
    case "under":
      return front ? thumb("M38,92 Q26,93 26,100 Q26,107 38,106") : null;
    case "underHigh":
      return front ? thumb("M38,85 Q27,86 27,93 Q27,100 38,99") : null;
    /* tip poking up between index and middle (T) — behind the fingers */
    case "tipBetween":
      return back ? thumb("M45,82 L45,46") : null;
    /* pointing up between index and middle (K, P) */
    case "upBetween":
      return front ? thumb("M34,92 L46,50") : null;
    /* out at right angles to the index (L, Y) */
    case "out":
      return front ? thumb("M34,86 Q22,82 11,79") : null;
    /* thumb and index tip touching: the loop of F */
    case "circleF":
      return front ? (
        <>
          {handLine("M34,84 Q37,66 41,58", style, style.accent, style.thumb - 1)}
          {handRing(45, 49, 9.5, style, style.thumb - 1)}
        </>
      ) : null;
    /* thumb meeting the middle-finger tips: the loop of D */
    case "circleD":
      return front ? (
        <>
          {handLine("M34,84 Q40,68 48,58", style, style.accent, style.thumb - 1)}
          {handRing(54, 52, 8, style, style.thumb - 1)}
        </>
      ) : null;
    default:
      return null;
  }
}

function traceNode(kind: "j" | "z", style: SignStyle, animate: boolean) {
  const dash = {
    fill: "none" as const,
    stroke: style.traceInk,
    strokeWidth: style.trace,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeDasharray: "7 6",
    className: animate ? "asl-trace" : undefined,
  };
  const head = {
    fill: "none" as const,
    stroke: style.traceInk,
    strokeWidth: style.trace,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "j") {
    /* J: the little finger traces the printed J — down, then hooking left */
    return (
      <g>
        <path d="M71,36 C76,60 68,84 52,87 C42,89 33,83 31,72" {...dash} />
        <path d="M25,74 L31,72 L36,77" {...head} />
      </g>
    );
  }
  /* Z: the index finger traces the zig-zag of the printed Z */
  return (
    <g>
      <path d="M62,32 L97,32 L62,11 L97,11" {...dash} />
      <path d="M90,5 L97,11 L90,17" {...head} />
    </g>
  );
}

/** C and O are the hand curled into a ring, not four fingers: drawn as one. */
function customNode(kind: "C" | "O", style: SignStyle) {
  const soft = {
    fill: "none" as const,
    stroke: style.soft,
    strokeWidth: style.softW,
    strokeLinecap: "round" as const,
  };
  if (kind === "C") {
    return (
      <g>
        {/* forearm, attached at the lower end of the curve */}
        <path
          d="M34,102 L54,112 L50,140 L28,130 Z"
          fill={style.fill}
          stroke={style.soft}
          strokeWidth={style.hand}
          strokeLinejoin="round"
        />
        {/* the hand curled into a C, opening away from the signer */}
        <path
          d="M62,48 Q84,54 84,78 Q84,102 62,108 Z"
          fill={style.fill}
          stroke={style.soft}
          strokeWidth={style.hand}
          strokeLinejoin="round"
        />
        <path
          d="M74,44 Q28,44 28,78 Q28,112 74,112"
          fill="none"
          stroke={style.thickInk}
          strokeWidth={style.thickC}
          strokeLinecap="round"
        />
        <path d="M48,49 L52,59 M60,47 L64,57 M70,46 L72,56" {...soft} />
        <path d="M50,107 L54,97" {...soft} />
      </g>
    );
  }
  return (
    <g>
      {/* forearm, tucked behind the ring */}
      <path
        d="M46,96 L42,140 L58,142 L62,98 Z"
        fill={style.fill}
        stroke={style.soft}
        strokeWidth={style.hand}
        strokeLinejoin="round"
      />
      {/* thumb and fingertips meeting: the whole hand is the ring */}
      <path
        d="M52,46 Q26,46 26,76 Q26,106 52,106 Q78,106 78,76 Q78,46 52,46 Z"
        fill="none"
        stroke={style.thickInk}
        strokeWidth={style.thickO}
        strokeLinejoin="round"
      />
      <path d="M40,54 L44,64 M52,48 L54,58 M64,54 L60,64" {...soft} />
    </g>
  );
}

/** R: the crossed index and middle are drawn over the fist outline. */
function crossNode(style: SignStyle) {
  const ink = primaryInk(style);
  return (
    <>
      {handLine("M41,64 L49,32", style, ink, style.cross)}
      {handLine("M51,64 L43,34", style, ink, style.cross)}
    </>
  );
}

/** Where the hand sits inside the 150 × 150 frame, per orientation. */
function frameTransform(rot?: number) {
  if (rot === 90) return "translate(14,25) rotate(90 50 74)";
  if (rot === 180) return "translate(25,2) rotate(180 50 74)";
  if (rot === -90) return "translate(-26,25) rotate(-90 50 74)";
  return "translate(25,0)";
}

export function SignGlyph({
  letter,
  height = 150,
  playing = false,
  light = false,
  variant = SIGN_DEFAULT_VARIANT,
}: {
  letter: string;
  height?: number;
  /** true while the letter's rhythm is running: the traced letters animate */
  playing?: boolean;
  /** light-surface palette (paper) — used by the picker's print sample */
  light?: boolean;
  /** which treatment to draw this handshape in; the geometry never changes */
  variant?: SignVariantId;
}) {
  const spec = ASL[letter];
  const style = signStyle(variant, light);
  if (!spec) {
    return (
      <svg
        viewBox={`0 0 ${FRAME} ${FRAME}`}
        style={{ height, maxWidth: "100%" }}
        role="img"
        aria-label={`No verified handshape for ${letter}`}
      />
    );
  }
  const motion = spec.trace
    ? spec.trace === "j"
      ? "a motion letter: the I handshape with the wrist twisting to trace a J"
      : "a motion letter: the index finger tracing a zig-zag"
    : "";
  const label = `ASL fingerspelling letter ${letter}${
    motion ? `, ${motion}` : ""
  }${spec.note ? `. ${spec.note.replace(/^MOTION: /, "")}` : ""}`;

  return (
    <svg
      viewBox={`0 0 ${FRAME} ${FRAME}`}
      style={{ height, maxWidth: "100%" }}
      role="img"
      aria-label={label}
      className="asl-sign"
    >
      <g
        transform={frameTransform(spec.rot)}
        style={
          playing ? { filter: `drop-shadow(0 0 9px ${style.accent})` } : undefined
        }
      >
        {/* The separation gap under the hand's own outline, drawn before the
            mass so the mass covers its inner half. Nothing for A. */}
        {style.halo > 0 && !spec.custom ? (
          <path
            d={handPath(spec)}
            fill="none"
            stroke={style.surface}
            strokeWidth={+(style.hand + style.halo * 2).toFixed(2)}
            strokeLinejoin="round"
          />
        ) : null}
        {spec.custom ? (
          customNode(spec.custom, style)
        ) : (
          <>
            {thumbNode(spec.thumb, style, false)}
            <path
              d={handPath(spec)}
              fill={style.fill}
              stroke={style.line}
              strokeWidth={style.hand}
              strokeLinejoin="round"
            />
            {spec.i === "cross" ? crossNode(style) : null}
            {thumbNode(spec.thumb, style, true)}
          </>
        )}
        {spec.trace ? traceNode(spec.trace, style, playing) : null}
      </g>
    </svg>
  );
}

/** The honesty panel: what these drawings are, what they are not. */
export function AslNotes({ compact = false }: { compact?: boolean }) {
  return (
    <div
      aria-label="About the sign diagrams"
      className="mt-3 rounded-2xl border border-emerald-800/70 bg-emerald-950/40 p-4 text-left"
    >
      <p className="text-sm font-bold text-emerald-200">
        About these handshapes — read this before you trust the drawing
      </p>
      <ul className="mt-2 space-y-2 text-xs leading-relaxed text-emerald-50/90">
        {ASL_HONESTY.map((h) => (
          <li key={h.label}>
            <span className="font-semibold text-emerald-100">{h.label}</span>{" "}
            {h.detail}
          </li>
        ))}
      </ul>
      {!compact && (
        <>
          <p className="mt-3 text-xs font-bold text-emerald-200">
            Where the handshapes were checked
          </p>
          <ul className="mt-1 space-y-2 text-xs leading-relaxed text-emerald-50/80">
            {ASL_SOURCES.map((s) => (
              <li key={s.label}>
                <span className="font-semibold text-emerald-100">
                  {s.label}
                </span>{" "}
                — {s.detail}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The A/B/C/D switcher. Each button is labelled with what its         */
/* treatment is FOR, and the contrast ratio of the chosen treatment is */
/* computed from the same colours it draws with and printed beside it. */
/* ------------------------------------------------------------------ */
export function SignVariantPicker({
  value,
  onChange,
  demoLetter = "A",
}: {
  value: SignVariantId;
  onChange: (v: SignVariantId) => void;
  /** the letter drawn in the small paper sample (paper is off-screen only
      here — on screen every sign sits on the same slate panel) */
  demoLetter?: string;
}) {
  const info = SIGN_VARIANTS.find((v) => v.id === value) ?? SIGN_VARIANTS[0];
  const c = SIGN_CONTRAST.find((x) => x.id === value) ?? SIGN_CONTRAST[0];
  return (
    <div
      role="group"
      aria-label="Sign drawing treatment"
      className="mt-3 w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-3 text-left"
    >
      <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
        Drawing treatment · one set of verified handshapes, four inks
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SIGN_VARIANTS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => onChange(v.id)}
            aria-pressed={v.id === value}
            aria-label={`Sign treatment ${v.id} — ${v.forWhat}`}
            className={`min-h-[56px] rounded-xl border-2 px-2 py-2 text-left ${
              v.id === value
                ? "border-emerald-300 bg-slate-800"
                : "border-slate-700 bg-slate-950"
            }`}
          >
            <span className="block text-sm font-black text-white">
              {v.name}
            </span>
            <span className="mt-0.5 block text-[11px] leading-snug text-slate-300">
              {v.forWhat}
            </span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-200">
        <span className="font-bold text-emerald-200">{info.name}</span> —{" "}
        {info.detail}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-200/90">
        What it cannot show: {info.limit}
      </p>
      <p className="mt-2 font-mono text-[11px] leading-relaxed text-slate-400">
        contrast {c.ink} on the panel = {c.onPanel}:1
        {c.fill && c.fillOnPanel ? ` · mass ${c.fill} = ${c.fillOnPanel}:1` : ""}
        {` · ${c.printInk} on paper = ${c.onPaper}:1`}
      </p>
      <div className="mt-2 flex items-center gap-3">
        <div className="shrink-0 rounded-xl bg-white p-1">
          <SignGlyph letter={demoLetter} height={62} variant={value} light />
        </div>
        <p className="text-[11px] leading-snug text-slate-400">
          The same treatment drawn for paper — the only light surface on the
          page, and where a printed drawing would actually go. Every sign on
          screen sits on the same slate panel in both page themes.
        </p>
      </div>
    </div>
  );
}

/** The A–Z sign grid that sits inside the full reference section. */
export function SignReference({
  selected,
  onPick,
  variant,
  onVariant,
}: {
  selected: string;
  onPick: (letter: string) => void;
  variant: SignVariantId;
  onVariant: (v: SignVariantId) => void;
}) {
  return (
    <>
      <h3 className="mt-4 text-base font-bold">
        9a · The manual alphabet (ASL fingerspelling)
      </h3>
      <p className="mt-1 text-sm text-slate-300">
        All 26 one-handed American handshapes, drawn beside the Morse and
        Braille columns above. Tap one to load it into the glyph at the top of
        the page. Two of the 26 are motion letters — J and Z are traced, not
        held, and are marked{" "}
        <span className="font-bold text-emerald-300">motion</span>. The drawing
        treatment below changes how the lines are inked, never what the
        handshape means.
      </p>
      <SignVariantPicker
        value={variant}
        onChange={onVariant}
        demoLetter={selected}
      />
      <div
        data-asl="grid"
        className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-7"
      >
        {Object.keys(ASL).map((letter) => (
          <SignTile
            key={letter}
            letter={letter}
            selected={letter === selected}
            onPick={onPick}
            variant={variant}
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Treatment {variant} · {SIGN_VARIANTS.find((v) => v.id === variant)?.forWhat} ·{" "}
        {Object.keys(ASL).length} of 26 letters drawn · American one-handed
        alphabet only · BSL is a different, two-handed alphabet and is not shown
      </p>
      {Object.values(ASL).map((s) => s.note).filter(Boolean).length > 0 && (
        <details className="mt-2 rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs text-slate-300">
          <summary className="cursor-pointer font-bold text-slate-100">
            Per-letter notes — the letters a single frame cannot carry
          </summary>
          <ul className="mt-2 space-y-2">
            {Object.entries(ASL)
              .filter(([, s]) => s.note)
              .map(([letter, s]) => (
                <li key={letter}>
                  <span className="font-black text-emerald-200">{letter}</span>{" "}
                  — {s.note}
                </li>
              ))}
          </ul>
        </details>
      )}
      <AslNotes compact />
    </>
  );
}

/** One line of the A–Z grid: the letter and its sign. */
export function SignTile({
  letter,
  selected,
  onPick,
  variant = SIGN_DEFAULT_VARIANT,
  size = 78,
}: {
  letter: string;
  selected: boolean;
  onPick: (letter: string) => void;
  variant?: SignVariantId;
  size?: number;
}) {
  const spec = ASL[letter];
  return (
    <button
      type="button"
      onClick={() => onPick(letter)}
      aria-label={`ASL fingerspelling letter ${letter}`}
      aria-pressed={selected}
      className={`flex flex-col items-center rounded-xl border-2 px-1 py-1.5 ${
        selected
          ? "quiz-glow border-emerald-300 bg-slate-800"
          : "border-slate-700 bg-slate-900"
      }`}
    >
      <SignGlyph letter={letter} height={size} variant={variant} />
      <span className="mt-0.5 text-lg font-black leading-5 text-white">
        {letter}
      </span>
      {spec?.trace ? (
        <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">
          motion
        </span>
      ) : null}
    </button>
  );
}
