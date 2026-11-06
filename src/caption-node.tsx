/* ------------------------------------------------------------------ */
/* THE CAPTIONING NODE — speech in, the same message out.              */
/*                                                                     */
/* One node in the cross-communication chain: whatever reaches this    */
/* node as speech or as typed text leaves it at the same instant on    */
/* four forms at once — words on screen, a buzz, light, and a Braille  */
/* cell — and the person receiving picks which of them they take.      */
/*                                                                     */
/* Rules this node is built to:                                        */
/*  1. NOTHING DEAD-ENDS. Speech recognition is not in every browser;  */
/*     the microphone is not in every room; vibration is not on every  */
/*     device. Each of those says so once, in place, and the rest of   */
/*     the node keeps delivering. The text box is always there and     */
/*     feeds the identical path.                                       */
/*  2. ONE ENCODER. Morse, Braille dots, pitch and every boundary come */
/*     from src/lib/morbrai.ts — `encodeMessage()` for the letter, its */
/*     dots, its Hz and the exact gap after it, and the shared `Timing`*/
/*     object for the grid. There is no second letter table, no second */
/*     timing table and no model in this file.                         */
/*  3. THE READER SETS THE PACE. Captions advance at the pace the      */
/*     reader chooses, not at the speaker's. Speech that arrives       */
/*     faster waits in the queue and is never silently dropped; the    */
/*     reader can hold, step one letter, or skip to the latest line.   */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildTiming,
  encodeMessage,
  tokenize,
  vibrationPattern,
  wpmOfUnit,
  type ProfileId,
  type Timing,
} from "./lib/morbrai";

/* ------------------------------------------------------------------ */
/* Remembered choices. Same convention as the rest of the page: read   */
/* in a mount effect (never in a useState initialiser, so the server   */
/* render and the first client render agree), written after load.      */
/* ------------------------------------------------------------------ */
const PREF = {
  pace: "morbrai.caption.pace",
  buzz: "morbrai.caption.buzz",
  light: "morbrai.caption.light",
  tone: "morbrai.caption.tone",
};

function readPref(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writePref(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* private mode / storage full: remembering is a convenience */
  }
}

/* ------------------------------------------------------------------ */
/* The one sound path for this node. One oscillator per letter, gated  */
/* by the letter's own `vibrationPattern` — the same durations the     */
/* buzz uses, so the tone and the buzz are the same rhythm by          */
/* construction. Pitch is the shared letter plan's Hz. No samples.     */
/* ------------------------------------------------------------------ */
let captionCtx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!captionCtx) captionCtx = new AC();
  if (captionCtx.state === "suspended") void captionCtx.resume();
  return captionCtx;
}

/* Called from a press, so the context is unlocked by a real gesture. */
export function unlockCaptionAudio() {
  audioCtx();
}

function playCaptionTone(hz: number, morse: string, timing: Timing) {
  const ctx = audioCtx();
  if (!ctx) return;
  const pattern = vibrationPattern(morse, timing); // [on, gap, on, gap, ...]
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.value = hz;
  gain.gain.value = 0;
  osc.connect(gain);
  gain.connect(ctx.destination);
  let t = ctx.currentTime + 0.02;
  const start = t;
  pattern.forEach((ms, i) => {
    const s = ms / 1000;
    if (i % 2 === 0) {
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.09, t + 0.008);
      gain.gain.setValueAtTime(0.09, t + Math.max(s - 0.008, 0.009));
      gain.gain.linearRampToValueAtTime(0, t + s);
    }
    t += s;
  });
  osc.start(start);
  osc.stop(t + 0.05);
}

/* ------------------------------------------------------------------ */
/* Web Speech API — typed loosely because the constructor is vendor-   */
/* prefixed and not in every DOM lib. Nothing here is required: the    */
/* node runs without it.                                               */
/* ------------------------------------------------------------------ */
type SpeechAltLike = { transcript: string };
type SpeechResultLike = {
  isFinal: boolean;
  length: number;
  0: SpeechAltLike;
};
type SpeechEventLike = {
  resultIndex: number;
  results: { length: number } & Record<number, SpeechResultLike>;
};
type RecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

function speechCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/* ------------------------------------------------------------------ */
/* The 2×3 touch cell. Dot numbers are the Braille standard: 1-2-3     */
/* down the LEFT column, 4-5-6 down the RIGHT — so a row-major grid    */
/* must be filled 1,4 / 2,5 / 3,6. The dot list itself always comes    */
/* from the shared encoder, never from here.                           */
/* ------------------------------------------------------------------ */
const CELL_ORDER = [1, 4, 2, 5, 3, 6];

function CaptionCell({
  dots,
  letter,
  size = 104,
}: {
  dots: number[];
  letter: string;
  size?: number;
}) {
  const on = new Set(dots);
  return (
    <div
      role="img"
      data-cap-cell="1"
      aria-label={
        letter
          ? `Braille cell for letter ${letter}: dots ${dots.join(", ")}`
          : "Braille cell idle"
      }
      className="grid grid-cols-2 gap-2 rounded-2xl border border-slate-700 bg-slate-900 p-3"
      style={{ width: size }}
    >
      {CELL_ORDER.map((d) => (
        <div
          key={d}
          className="rounded-full"
          style={{
            width: size / 2 - 22,
            height: size / 2 - 22,
            backgroundColor: on.has(d) ? "#22d3ee" : "rgba(148,163,184,0.16)",
            boxShadow: on.has(d) ? "0 0 16px rgba(34,211,238,0.55)" : "none",
          }}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The node                                                            */
/* ------------------------------------------------------------------ */
type ChannelId = "buzz" | "light" | "tone";

const PACE_MIN = 80;
const PACE_MAX = 320;

export function CaptionNode({
  profile,
  unitMs,
}: {
  profile: ProfileId;
  unitMs: number;
}) {
  /* --- pace ------------------------------------------------------- */
  const [paceMs, setPaceMs] = useState(() =>
    Math.min(Math.max(unitMs, PACE_MIN), PACE_MAX),
  );
  const timing = useMemo(
    () => buildTiming(profile, paceMs),
    [profile, paceMs],
  );

  /* --- which forms this reader takes ------------------------------ */
  const [channels, setChannels] = useState<Record<ChannelId, boolean>>({
    buzz: true,
    light: true,
    tone: true,
  });

  /* --- what the node is showing ----------------------------------- */
  const [shown, setShown] = useState("");
  const [cell, setCell] = useState<{ letter: string; dots: number[] }>({
    letter: "",
    dots: [],
  });
  const [light, setLight] = useState<"dot" | "dash" | "off">("off");
  const [held, setHeld] = useState(false);
  const [queued, setQueued] = useState(0);
  const [heard, setHeard] = useState("");
  const [status, setStatus] = useState<
    "idle" | "listening" | "unsupported" | "denied" | "error"
  >("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [reduceMotion, setReduceMotion] = useState(false);
  /* Whether this device can buzz at all. Starts optimistic so the server
     render and the first client render agree; the mount effect settles
     it, and the line below appears only when it is genuinely absent. */
  const [vibOk, setVibOk] = useState(true);

  /* --- engine refs (delivery is imperative: timers must survive a
         re-render that arrives mid-letter) -------------------------- */
  const queueRef = useRef<string[]>([]);
  const busyRef = useRef(false);
  const heldRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const lastLineRef = useRef("");
  const recogRef = useRef<RecognitionLike | null>(null);
  const wantMicRef = useRef(false);
  const cfgRef = useRef({ timing, channels, reduceMotion });
  const vibRef = useRef(true);

  /* Latest-value refs, refreshed after every render. */
  useEffect(() => {
    cfgRef.current = { timing, channels, reduceMotion };
  });

  /* Mount: read remembered choices, then write them back only after
     they have loaded. */
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  useEffect(() => {
    const p = Number(readPref(PREF.pace));
    if (Number.isFinite(p) && p >= PACE_MIN && p <= PACE_MAX) setPaceMs(p);
    const b = readPref(PREF.buzz);
    const l = readPref(PREF.light);
    const t = readPref(PREF.tone);
    setChannels((c) => ({
      buzz: b === null ? c.buzz : b === "1",
      light: l === null ? c.light : l === "1",
      tone: t === null ? c.tone : t === "1",
    }));
    vibRef.current =
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function";
    setVibOk(vibRef.current);
    setPrefsLoaded(true);
    if (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function"
    ) {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      const apply = () => setReduceMotion(mq.matches);
      apply();
      mq.addEventListener?.("change", apply);
    }
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    writePref(PREF.pace, String(paceMs));
  }, [prefsLoaded, paceMs]);
  useEffect(() => {
    if (!prefsLoaded) return;
    writePref(PREF.buzz, channels.buzz ? "1" : "0");
    writePref(PREF.light, channels.light ? "1" : "0");
    writePref(PREF.tone, channels.tone ? "1" : "0");
  }, [prefsLoaded, channels]);

  /* --- the delivery engine --------------------------------------- */
  /* One token at a time: a letter goes out on every chosen form at the
     same instant, then the node waits out that letter's own boundary
     and takes the next. `encodeMessage` supplies the letter, its dots,
     its Hz and the exact gap after its last element — including a word
     gap when a space follows, which the encoder's token walk owns. */
  const pump = useCallback(function pump(force = false): void {
    if (busyRef.current || queueRef.current.length === 0) return;
    if (heldRef.current && !force) return;

    const { timing, channels, reduceMotion } = cfgRef.current;
    const head = queueRef.current[0];
    busyRef.current = true;

    /* A word boundary that arrives as its own token (a new line landing
       on an empty queue): hold it for the shared word gap. */
    if (head === " ") {
      queueRef.current.shift();
      const id = window.setTimeout(() => {
        setShown((s) => s + " ");
        setQueued(queueRef.current.length);
        busyRef.current = false;
        pump();
      }, timing.wordGapMs);
      timersRef.current.push(id);
      return;
    }

    const schedule = encodeMessage(queueRef.current.join(""), timing);
    const L = schedule.letters[0];
    if (!L) {
      queueRef.current.shift();
      busyRef.current = false;
      return;
    }

    /* Consume the letter — and the space that follows it, whose word
       gap the encoder already folded into this letter's last element. */
    queueRef.current.shift();
    const tailGap = L.elements[L.elements.length - 1]?.gapAfterMs ?? 0;
    const eatsSpace =
      tailGap === timing.wordGapMs && queueRef.current[0] === " ";
    if (eatsSpace) queueRef.current.shift();

    /* The same instant: words, buzz, light, cell. */
    setShown((s) => s + L.letter + (eatsSpace ? " " : ""));
    setCell({ letter: L.letter, dots: L.braille });
    setQueued(queueRef.current.length);

    if (channels.buzz && vibRef.current) {
      try {
        navigator.vibrate(vibrationPattern(L.morse, timing));
      } catch {
        /* a device can refuse mid-flight; the other forms carry on */
      }
    }
    if (channels.tone) playCaptionTone(L.hz, L.morse, timing);

    /* Light: one frame per element of this letter, on the shared grid.
       Under reduced motion the surface holds ONE steady fill for the
       whole letter instead, so nothing pulses. */
    if (channels.light) {
      if (reduceMotion) {
        setLight("dot");
      } else {
        let t = 0;
        for (const el of L.elements) {
          const isDash = el.symbol === "-";
          timersRef.current.push(
            window.setTimeout(() => setLight(isDash ? "dash" : "dot"), t),
          );
          timersRef.current.push(
            window.setTimeout(() => setLight("off"), t + el.durationMs),
          );
          t += el.durationMs + el.gapAfterMs;
        }
      }
    }

    /* Advance: the letter's own pattern plus its own boundary. */
    const total = L.durationMs + tailGap;
    timersRef.current.push(
      window.setTimeout(
        () => {
          setLight("off");
          busyRef.current = false;
          pump();
        },
        Math.max(total, 1),
      ),
    );
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
      recogRef.current?.abort?.();
    };
  }, []);

  /* --- feeding the queue ----------------------------------------- */
  const enqueue = useCallback(
    (text: string) => {
      const tokens = tokenize(text); // the shared normaliser, A–Z + spaces
      if (tokens.length === 0) return;
      lastLineRef.current = text.trim();
      const q = queueRef.current;
      if (q.length > 0) q.push(" "); // a new line is a word boundary
      q.push(...tokens);
      /* A hard ceiling keeps a long session from growing without bound.
         It is never reached by normal use; if it is, the OLDEST letters
         go, and the reader is told. */
      if (q.length > 400) {
        q.splice(0, q.length - 400);
        setNotice(
          "This line arrived faster than the pace, so the earliest letters of the queue were dropped. Lower the pace, or hold and step.",
        );
      }
      setQueued(q.length);
      pump();
    },
    [pump],
  );

  const catchUp = () => {
    if (lastLineRef.current === "") return;
    queueRef.current = tokenize(lastLineRef.current);
    busyRef.current = false;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setShown("");
    setCell({ letter: "", dots: [] });
    setLight("off");
    setQueued(queueRef.current.length);
    setNotice("Skipped the backlog — you are at the latest line.");
    pump();
  };

  const clearAll = () => {
    queueRef.current = [];
    busyRef.current = false;
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    setShown("");
    setCell({ letter: "", dots: [] });
    setLight("off");
    setQueued(0);
    setHeard("");
    setNotice(null);
  };

  const toggleHold = () => {
    const next = !held;
    heldRef.current = next;
    setHeld(next);
    if (!next) pump();
  };

  const stepOne = () => {
    heldRef.current = true;
    setHeld(true);
    pump(true);
  };

  /* --- microphone ------------------------------------------------- */
  const stopMic = useCallback(() => {
    wantMicRef.current = false;
    try {
      recogRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recogRef.current = null;
    setHeard("");
    setStatus("idle");
  }, []);

  const startMic = () => {
    unlockCaptionAudio();
    const SR = speechCtor();
    if (!SR) {
      setStatus("unsupported");
      return;
    }
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e: SpeechEventLike) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) enqueue(text);
        else interim += text;
      }
      setHeard(interim.trim());
    };
    rec.onerror = (e: { error: string }) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantMicRef.current = false;
        setStatus("denied");
      } else if (e.error === "no-speech" || e.error === "aborted") {
        /* ordinary silence — the engine restarts on end */
      } else {
        wantMicRef.current = false;
        setStatus("error");
      }
    };
    rec.onend = () => {
      /* Chrome ends the session on its own after a pause; keep going
         until the reader stops it. */
      if (wantMicRef.current) {
        try {
          rec.start();
        } catch {
          setStatus("error");
        }
      }
    };
    recogRef.current = rec;
    wantMicRef.current = true;
    try {
      rec.start();
      setStatus("listening");
    } catch {
      setStatus("error");
    }
  };

  /* --- the caption is kept in view as it grows -------------------- */
  const streamRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown]);

  const lightLit = channels.light && light !== "off";
  const lightColour =
    light === "dash" ? "rgba(232,121,249,0.9)" : "rgba(34,211,238,0.9)";

  const micLine =
    status === "listening"
      ? "Listening. Speak normally — the words land here at your pace."
      : status === "unsupported"
        ? "This browser has no speech recognition built in. The box below does the same job — type or paste, and the same message goes out."
        : status === "denied"
          ? "Microphone permission was declined. The box below does the same job."
          : status === "error"
            ? "Speech recognition could not connect. The box below does the same job."
            : "Speech in, or type below. Either way the same message goes out on the forms you have switched on.";

  return (
    <section aria-label="Captioning node" className="mt-5 text-left">
      <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="text-xl font-black tracking-tight text-white">
          The captioning node
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-300">
          Anything that reaches this node — spoken or typed — leaves it at the
          same instant as words on screen, a buzz, light and a Braille cell.
          You set the pace it arrives at, and you choose which of those forms
          you take.
        </p>

        {/* Speech in */}
        <div className="mt-4 flex flex-wrap gap-2">
          {status === "listening" ? (
            <button
              type="button"
              onClick={stopMic}
              className="min-h-[48px] flex-1 rounded-xl border-2 border-rose-400 bg-rose-500/20 px-4 text-sm font-bold text-rose-100"
            >
              ■ Stop listening
            </button>
          ) : (
            <button
              type="button"
              onClick={startMic}
              className="min-h-[48px] flex-1 rounded-xl border-2 border-cyan-300 bg-cyan-500/20 px-4 text-sm font-bold text-cyan-100"
            >
              🎙 Listen to speech
            </button>
          )}
        </div>
        <p
          aria-live="polite"
          className="mt-2 text-[12px] leading-5 text-slate-400"
        >
          {micLine}
        </p>
        {status === "listening" && (
          <p className="mt-1 text-[12px] leading-5 text-slate-500">
            Listening sends your speech to your browser&rsquo;s speech service.
            Nothing here records it or stores it.
          </p>
        )}
        {heard !== "" && (
          <p className="mt-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm italic text-slate-400">
            hearing… {heard}
          </p>
        )}

        {/* Text in — always */}
        <div className="mt-4">
          <label
            htmlFor="caption-text"
            className="block text-xs font-bold uppercase tracking-wider text-slate-400"
          >
            Type or paste — the same node, no microphone needed
          </label>
          <textarea
            id="caption-text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            rows={2}
            placeholder="Type a line and it goes out on every form you have on"
            className="mt-2 w-full rounded-xl border-2 border-slate-700 bg-slate-950 px-3 py-3 text-base text-white placeholder:text-slate-500"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                unlockCaptionAudio();
                enqueue(typed);
                setTyped("");
              }}
              className="min-h-[48px] flex-1 rounded-xl border-2 border-cyan-300 bg-slate-800 px-4 text-sm font-bold text-white"
            >
              Send to the node
            </button>
            <button
              type="button"
              onClick={() => {
                unlockCaptionAudio();
                enqueue("MIRACLES HAPPEN EVERY SECOND");
              }}
              className="min-h-[48px] rounded-xl border-2 border-slate-700 bg-slate-950 px-4 text-sm font-bold text-slate-200"
            >
              Try a line
            </button>
          </div>
        </div>

        {/* What the node is delivering */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Captions
            </h3>
            <span className="text-[11px] text-slate-500">
              {queued > 0
                ? `${queued} letter${queued === 1 ? "" : "s"} waiting`
                : "nothing waiting"}
            </span>
          </div>
          <div
            ref={streamRef}
            role="log"
            aria-live="off"
            data-cap-text="1"
            aria-label="Caption stream"
            className="mt-2 h-32 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 p-3 text-2xl font-bold leading-9 tracking-wide text-white"
          >
            {shown === "" ? (
              <span className="text-base font-normal text-slate-500">
                The words appear here as they are delivered.
              </span>
            ) : (
              shown
            )}
          </div>
        </div>

        {/* The other three forms, side by side */}
        <div className="mt-4 flex items-start gap-3">
          <CaptionCell dots={cell.dots} letter={cell.letter} size={104} />
          <div className="flex-1">
            <div
              role="img"
              data-cap-light="1"
              aria-label={
                lightLit
                  ? `Light is a ${light} for letter ${cell.letter}`
                  : "Light dark"
              }
              className="flex h-[104px] items-center justify-center rounded-2xl border border-slate-800"
              style={{
                backgroundColor: lightLit
                  ? lightColour
                  : "rgba(2,6,23,1)",
                boxShadow: lightLit ? `0 0 28px ${lightColour}` : "none",
                transitionProperty: "background-color, box-shadow",
                transitionDuration: "40ms",
              }}
            >
              <span className="text-xs font-bold uppercase tracking-widest text-slate-900/80">
                {lightLit ? light : "light"}
              </span>
            </div>
            <p className="mt-1 text-center text-[11px] text-slate-500">
              {cell.letter
                ? `Letter ${cell.letter} · ${cell.dots.length} dot${cell.dots.length === 1 ? "" : "s"}`
                : "Cell and light idle"}
            </p>
          </div>
        </div>

        {/* The reader's pace */}
        <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950 p-3">
          <div className="flex items-baseline justify-between">
            <label
              htmlFor="caption-pace"
              className="text-xs font-bold uppercase tracking-wider text-slate-400"
            >
              Your pace
            </label>
            <span className="text-[11px] text-slate-400">
              one unit = {paceMs} ms · about{" "}
              {(wpmOfUnit(paceMs) || 0).toFixed(1)} wpm equivalent
            </span>
          </div>
          <input
            id="caption-pace"
            type="range"
            min={PACE_MIN}
            max={PACE_MAX}
            step={10}
            value={paceMs}
            onChange={(e) => setPaceMs(Number(e.target.value))}
            className="mt-2 h-11 w-full accent-cyan-400"
          />
          <p className="text-[11px] leading-4 text-slate-500">
            The captions and every form advance at this pace and no faster.
            Speech that arrives quicker than this waits its turn — it is not
            skipped to keep up with the speaker.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleHold}
              className="min-h-[48px] flex-1 rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-white"
            >
              {held ? "▶ Resume" : "⏸ Hold"}
            </button>
            <button
              type="button"
              onClick={stepOne}
              className="min-h-[48px] flex-1 rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-white"
            >
              One letter ›
            </button>
            <button
              type="button"
              onClick={catchUp}
              className="min-h-[48px] flex-1 rounded-xl border-2 border-slate-600 bg-slate-800 px-3 text-sm font-bold text-white"
            >
              Latest line
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="min-h-[48px] rounded-xl border-2 border-slate-700 bg-slate-900 px-3 text-sm font-bold text-slate-300"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Which forms this reader takes */}
        <fieldset className="mt-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Forms this node sends on
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {(
              [
                ["buzz", "Vibration"],
                ["light", "Light"],
                ["tone", "Tone"],
              ] as [ChannelId, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={channels[id]}
                onClick={() => {
                  unlockCaptionAudio();
                  setChannels((c) => ({ ...c, [id]: !c[id] }));
                }}
                className={`min-h-[48px] rounded-xl border-2 px-4 text-sm font-bold ${
                  channels[id]
                    ? "border-cyan-300 bg-cyan-500/20 text-white"
                    : "border-slate-700 bg-slate-950 text-slate-400"
                }`}
              >
                {channels[id] ? "✓ " : ""}
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-4 text-slate-500">
            The Braille cell always shows. Vibration, light and tone are each
            yours to switch.
          </p>
          {!vibOk && (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-100">
              This device has no vibration, so light and tone are carrying the
              message. Nothing else changes.
            </p>
          )}
          {notice && (
            <p
              aria-live="polite"
              className="mt-2 rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-[12px] leading-5 text-slate-300"
            >
              {notice}
            </p>
          )}
        </fieldset>

        <p className="mt-4 text-[11px] leading-5 text-slate-500">
          Every letter here is the shared Morbraii encoding: the same Morse
          table, the same Braille dots, the same pitch plan and the same
          timing grid the rest of this page uses, at the{" "}
          {profile === "standard" ? "standard ITU" : "Morbraii"} spacing you
          chose in Setup. This node carries a message between forms; it does
          not add a second code.
        </p>
      </div>
    </section>
  );
}
