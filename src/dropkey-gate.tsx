import { useCallback, useEffect, useState, type ReactNode } from "react";

/* The one door into both drops.
 *
 * /drop and /ideas share a single DropKey, held by the team on the server. This
 * gate is the screen half of the lock: until a key the server accepts has been
 * entered, the page renders the box and nothing else — no listing, no counts,
 * no file names, no idea titles. The real check is on the server (every handler
 * verifies the key itself); this only decides what to draw.
 *
 * A key that works is remembered in this browser so the owner is not retyping
 * it, and "Forget the key on this device" clears it again. The key is never
 * displayed back: the box starts empty and the server only ever answers yes/no.
 */

const KEY_STORE = "morbrai.dropkey";

/* The same line the server refuses with, so a wrong key reads the same whether
   the screen or the server was the one to say no. */
const REFUSAL = "That DropKey is not right.";

type Phase = "checking" | "locked" | "open";

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
  /* Rendered only once the key is accepted, and given the key to send with
     every call. The gate itself keeps the forget button, so the page cannot
     draw anything without a key the server has already accepted. */
  children: (dropKey: string) => ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [dropKey, setDropKey] = useState("");
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lock = useCallback(() => {
    saveKey("");
    setDropKey("");
    setDraft("");
    setError("");
    setBusy(false);
    setPhase("locked");
  }, []);

  /* Try the key left in this browser before drawing the box, so a returning
     owner lands straight on the page. A key that no longer works is dropped. */
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
        setDropKey(remembered);
        setPhase("open");
      } else {
        saveKey("");
        setPhase("locked");
      }
    })();
    return () => {
      alive = false;
    };
  }, [verify]);

  async function unlock() {
    const candidate = draft.trim();
    if (!candidate) {
      setError("Type the DropKey to open this page.");
      return;
    }
    setBusy(true);
    setError("");
    let ok = false;
    try {
      ok = await verify(candidate);
    } catch {
      ok = false;
    }
    setBusy(false);
    if (!ok) {
      setError(REFUSAL);
      return;
    }
    saveKey(candidate);
    setDropKey(candidate);
    setDraft("");
    setPhase("open");
  }

  if (phase === "open") {
    return (
      <>
        {children(dropKey)}
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

  if (phase === "checking") {
    return (
      <p className="mt-8 rounded-2xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
        Checking the DropKey saved in this browser…
      </p>
    );
  }

  return (
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
          className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-3 font-mono text-base"
        />
        <button
          type="submit"
          disabled={busy}
          className="mt-3 min-h-11 w-full rounded-lg bg-slate-900 px-5 py-3 text-base font-medium text-white disabled:opacity-60"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      {error ? (
        <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
    </section>
  );
}
