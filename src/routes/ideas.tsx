import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { downloadIdea, dropIdea, listIdeas } from "~/ideas-server";
import { DropKeyGate } from "~/dropkey-gate";

export const Route = createFileRoute("/ideas")({
  component: IdeasPage,
  head: () => ({
    meta: [
      { title: "Ideas — drop one for the team" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type Entry = { name: string; size: number; mtime: number; title: string };
type Listing = {
  files: Entry[];
  used: number;
  maxIdea: number;
  free: number;
  minFree: number;
  dir: string;
};

function fmt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function when(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}`;
}

function bytes(s: string): number {
  try {
    return new TextEncoder().encode(s).length;
  } catch {
    return s.length;
  }
}

function IdeasPage() {
  /* The same gate as /drop, the same key: the ideas listing is what proves it. */
  const verify = useCallback(async (candidate: string) => {
    const r = await listIdeas({ data: { key: candidate } });
    return r.ok;
  }, []);

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-slate-900">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
        Internal — not linked from the site
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Drop an idea</h1>
      <p className="mt-3 leading-relaxed text-slate-600">
        One idea, plain text, no forms to fill in. Whatever you type becomes one{" "}
        <span className="font-mono text-sm">.txt</span> file in the team's ideas folder, stamped with
        the time, so nothing is lost and nothing overwrites an earlier idea.
      </p>
      <p className="mt-2 leading-relaxed text-slate-600">
        Both drops — this one and the files drop — ask for the DropKey first. Without it the page
        shows nothing: no ideas, no titles, no counts. This is an internal team tool, not part of the
        product, and it is deliberately left out of the static export.
      </p>
      <p className="mt-2 text-sm">
        <Link to="/drop" className="inline-block py-3 underline underline-offset-4">
          sending files instead? → /drop
        </Link>
      </p>

      <DropKeyGate verify={verify}>
        {(dropKey) => <IdeasWorkspace dropKey={dropKey} />}
      </DropKeyGate>
    </main>
  );
}

function IdeasWorkspace({ dropKey }: { dropKey: string }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "bad"; text: string }>({
    kind: "idle",
    text: "",
  });

  const refresh = useCallback(async () => {
    const r = await listIdeas({ data: { key: dropKey } });
    if (r.ok) setListing(r);
    else setStatus({ kind: "bad", text: r.error });
  }, [dropKey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function drop() {
    setStatus({ kind: "busy", text: "Dropping the idea…" });
    const r = await dropIdea({ data: { key: dropKey, title, text } });
    if (!r.ok) {
      setStatus({ kind: "bad", text: r.error });
      void refresh();
      return;
    }
    setStatus({
      kind: "ok",
      text: `Dropped — saved as ${r.name} (${fmt(r.size)}). Nothing was overwritten.`,
    });
    setTitle("");
    setText("");
    void refresh();
  }

  async function getIdea(name: string) {
    setStatus({ kind: "busy", text: `Fetching ${name}…` });
    const r = await downloadIdea({ data: { key: dropKey, name } });
    if (!r.ok) {
      setStatus({ kind: "bad", text: r.error });
      return;
    }
    const raw = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([raw], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    setStatus({ kind: "ok", text: `Downloading ${name} (${fmt(raw.length)}).` });
  }

  const size = bytes(text);
  const over = size > 64 * 1024;

  return (
    <>
      {/* ------------------------------------------------------------ form */}
      <section className="mt-6">
        <label htmlFor="idea-title" className="text-sm font-semibold">
          Title <span className="font-normal text-slate-500">(optional, one line)</span>
        </label>
        <input
          id="idea-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Tactile fret strip"
          autoComplete="off"
          className="mt-2 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-3 text-base"
        />

        <label htmlFor="idea-text" className="mt-5 block text-sm font-semibold">
          The idea
        </label>
        <textarea
          id="idea-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={12}
          placeholder="Say it however it comes out — a sentence is enough."
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-base leading-relaxed"
        />

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-xs ${over ? "font-semibold text-rose-700" : "text-slate-500"}`}>
            {fmt(size)} of 64 kB {over ? "— too long, this will be refused" : ""}
          </span>
          <button
            type="button"
            onClick={() => void drop()}
            className="min-h-11 rounded-lg bg-slate-900 px-5 py-3 text-base font-medium text-white"
          >
            Drop the idea
          </button>
        </div>

        {status.text ? (
          <p
            role="status"
            className={`mt-4 rounded-xl px-4 py-3 text-sm ${
              status.kind === "bad"
                ? "bg-rose-50 text-rose-800"
                : status.kind === "ok"
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
            }`}
          >
            {status.text}
          </p>
        ) : null}
      </section>

      {/* --------------------------------------------------------- listing */}
      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Ideas dropped{listing ? ` (${listing.files.length})` : ""}
          </h2>
          <button
            type="button"
            onClick={() => void refresh()}
            className="min-h-11 rounded-lg border border-slate-300 px-4 py-3 text-sm"
          >
            Refresh
          </button>
        </div>

        {listing ? (
          <p className="mt-2 text-xs text-slate-500">
            {fmt(listing.used)} held · {fmt(listing.free)} free disk · ideas stop under{" "}
            {fmt(listing.minFree)} free · newest first
          </p>
        ) : null}

        {listing && listing.files.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-slate-200 px-4 py-6 text-sm text-slate-500">
            Nothing dropped yet — the first idea will appear here.
          </p>
        ) : null}

        {listing && listing.files.length > 0 ? (
          <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200">
            {listing.files.map((f) => (
              <li key={f.name} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words">{f.title}</p>
                  <p className="mt-0.5 text-xs break-all text-slate-500">
                    {fmt(f.size)} · {when(f.mtime)}
                  </p>
                  <p className="mt-0.5 text-xs break-all text-slate-400">{f.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void getIdea(f.name)}
                  className="min-h-11 shrink-0 rounded-lg border border-slate-300 px-4 py-3 text-sm"
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          Ideas land in <span className="font-mono">/home/team/shared/ideas-inbox/</span> on the
          team's machine — one <span className="font-mono">.txt</span> per idea. The list and the
          files are behind the DropKey: without it this page shows nothing and the server refuses
          every request. It is an internal team tool, not part of the product, and deliberately left
          out of the static export.
        </p>
      </section>
    </>
  );
}
