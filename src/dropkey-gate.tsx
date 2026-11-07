import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/* The one door into both drops.
 *
 * /drop and /ideas share a single DropKey, held by the team on the server. This
 * gate is the screen half of the lock: until a key the server accepts has been
 * entered, the page shows the box and nothing else — no listing, no counts, no
 * file names, no idea titles. The real check is on the server (every handler
 * verifies the key itself); this only decides what to draw.
 *
 * The key is checked as it is typed: 400 ms after typing stops, the server is
 * asked, and the answer is on screen before any button is pressed. So a wrong
 * key is never discovered by a failed upload, and a right one says so and opens
 * by itself. The Unlock button stays as the explicit action for anyone who
 * prefers to press it (or presses Enter).
 *
 * A key that works is remembered in this browser so the owner is not retyping
 * it, and "Forget the key on this device" clears it again. A remembered key is
 * checked on load: if it no longer works, the page comes up locked with the
 * refusal line rather than silently emptying the box. The key is never
 * displayed back: the box starts empty and the server only ever answers yes/no.
 */

const KEY_STORE = "morbrai.dropkey";

/* The same line the server refuses with, so a wrong key reads the same whether
   the screen or the server was the one to say no. */
const REFUSAL = "That DropKey is not right.";
const ACCEPTED = "That is the key — unlocking";

/* Quiet time after the last keystroke before asking the server, so a key typed
   at speed is one request rather than one per letter. */
const CHECK_AFTER_MS = 400;
/* How long "That is the key — unlocking" stays on screen before the page opens,
   so the owner sees why it opened. */
const OPEN_AFTER_MS = 450;

type Phase = "checking" | "locked" | "open";
type Probe = "idle" | "checking" | "good" | "bad";

function savedKey(): string {
  try {
    return (localStorage.getItem(KEY_STORE) || "").trim();
  } catch {
    return ""; /* private mode */
  }
}

function saveKey(k: string) {
  try {
    if (k) localStorage.setItem(KEY_STORE, k);
    else localStorage.removeItem(KEY_STORE);
  } catch {
    /* private mode — the key still works for this visit */
  }
}

export function DropKeyGate({
  verify,
  children,
}: {
  /* Ask the server whether this key opens the page. The pages pass their own
     listing call, so "unlocked" means the server really answered, not that the
     text looked plausible. */
  verify: (candidate: string) => Promise<boolean>;
  /* Rendered once the key is accepted, and given the key to send with every
     call. While locked it is rendered too, with an empty key and locked=true,
     so the picker, the text box and the form are visibly disabled rather than
     simply absent — nothing can be tried out before the key is right. */
  children: (dropKey: string, locked: boolean) => ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [dropKey, setDropKey] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  /* A key left in this browser that no longer works. Kept apart from `error`
     so the as-you-type check, which runs the moment the locked screen appears,
     cannot wipe the reason the screen is locked. */
  const [rememberedBad, setRememberedBad] = useState(false);
  const [probe, setProbe] = useState<Probe>("idle");
  const [busy, setBusy] = useState(false);
  /* Only the newest question may answer: a slow reply to an older draft must
     never unlock the page for what is on screen now. */
  const ask = useRef(0);

  const open = useCallback((candidate: string) => {
    saveKey(candidate);
    setDropKey(candidate);
    setDraft("");
    setError("");
    setRememberedBad(false);
    setProbe("idle");
    setBusy(false);
    setPhase("open");
  }, []);

  const lock = useCallback(() => {
    saveKey("");
    ask.current += 1;
    setDropKey("");
    setDraft("");
    setError("");
    setRememberedBad(false);
    setProbe("idle");
    setBusy(false);
    setPhase("locked");
  }, []);

  /* Try the key left in this browser before drawing the box, so a returning
     owner lands straight on the page. A key that no longer works is dropped
     and the refusal is shown, so the locked screen is never unexplained. */
  useEffect(() => {
    let alive = true;
    const remembered = savedKey();
    if (!remembered) {
      setPhase("locked");
      return;
    }
    void (async () => {
      let ok = false;
      try {
        ok = await verify(remembered);
      } catch {
        ok = false;
      }
      if (!alive) return;
      if (ok) {
        open(remembered);
      } else {
        saveKey("");
        setRememberedBad(true);
        setPhase("locked");
      }
    })();
    return () => {
      alive = false;
    };
  }, [verify, open]);

  /* The check as it is typed. Nothing here unlocks the page except a yes from
     the server, and a draft that changes cancels the question it replaced. */
  useEffect(() => {
    if (phase !== "locked") return;
    const candidate = draft.trim();
    if (!candidate) {
      setProbe("idle");
      setError("");
      return;
    }
    setRememberedBad(false); /* the box now holds what was typed, not the old key */
    const mine = ++ask.current;
    const timer = setTimeout(() => {
      if (ask.current !== mine) return;
      setProbe("checking");
      void (async () => {
        let ok = false;
        try {
          ok = await verify(candidate);
        } catch {
          ok = false;
        }
        if (ask.current !== mine) return;
        if (ok) {
          setProbe("good");
          setError("");
        } else {
          setProbe("bad");
          setError(REFUSAL);
        }
      })();
    }, CHECK_AFTER_MS);
    return () => clearTimeout(timer);
  }, [draft, phase, verify]);

  /* A key that came back right opens the page by itself, after long enough for
     "That is the key — unlocking" to be read. */
  useEffect(() => {
    if (probe !== "good" || phase !== "locked") return;
    const candidate = draft.trim();
    const timer = setTimeout(() => open(candidate), OPEN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [probe, phase, draft, open]);

  async function unlock() {
    const candidate = draft.trim();
    if (!candidate) {
      setError("Type the DropKey to open this page.");
      return;
    }
    const mine = ++ask.current;
    setBusy(true);
    setError("");
    setProbe("checking");
    let ok = false;
    try {
      ok = await verify(candidate);
    } catch {
      ok = false;
    }
    if (ask.current !== mine) return;
    setBusy(false);
    if (!ok) {
      setProbe("bad");
      setError(REFUSAL);
      return;
    }
    setProbe("good");
    open(candidate);
  }

  if (phase === "open") {
    return (
      <>
        {children(dropKey, false)}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">The DropKey is remembered in this browser.</p>
          <button
            type="button"
            onClick={lock}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm font-medium"
          >
            Forget the key on this device
          </button>
        </div>
      </>
    );
  }

  /* The refusal on screen: what the server said about the typed key, or the
     note that the key remembered from last time no longer works. */
  const refusalLine = error || (rememberedBad && !draft.trim() ? REFUSAL : "");

  if (phase === "checking") {
    return (
      <p className="mt-8 rounded-2xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
        Checking the DropKey saved in this browser…
      </p>
    );
  }

  return (
    <>
      <section className="mt-8 rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold">Enter the DropKey</h2>
        <p className="mt-1 text-sm text-slate-600">
          One key opens both drops — this one and the ideas drop. It is the team's key, kept on the
          server; this page cannot make or change one.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void unlock();
          }}
        >
          <label htmlFor="dropkey" className="mt-4 block text-sm font-medium">
            DropKey
          </label>
          <input
            id="dropkey"
            name="dropkey"
            type="text"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError("");
            }}
            placeholder="the team's DropKey"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={probe === "bad"}
            aria-describedby="dropkey-state"
            className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-3 font-mono text-base"
          />
          <button
            type="submit"
            disabled={busy || probe === "good"}
            className="mt-3 min-h-11 w-full rounded-lg bg-slate-900 px-5 py-3 text-base font-medium text-white disabled:opacity-60"
          >
            {busy ? "Unlocking…" : "Unlock"}
          </button>
        </form>
        <div id="dropkey-state" aria-live="polite">
          {probe === "good" ? (
            <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {ACCEPTED}
            </p>
          ) : null}
          {probe === "checking" ? (
            <p className="mt-3 text-sm text-slate-500">Checking the key…</p>
          ) : null}
          {refusalLine ? (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {refusalLine}
            </p>
          ) : null}
          {!refusalLine && probe === "idle" ? (
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              The key is checked as you type it — no need to press Unlock to find out whether it is
              right.
            </p>
          ) : null}
        </div>
      </section>

      {/* The tool itself, switched off: every control inside is natively
          disabled until the key is accepted, and no listing is fetched. */}
      <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Everything below stays switched off until the DropKey is accepted. A wrong key cannot be
        tried out here — nothing can be picked, typed or sent.
      </p>
      <div className="opacity-60">{children("", true)}</div>
    </>
  );
}
