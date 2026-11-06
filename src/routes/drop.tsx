import { Link, createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  appendChunk,
  beginUpload,
  downloadFile,
  finishUpload,
  listFiles,
  mintDropKey,
} from "~/drop-server";

export const Route = createFileRoute("/drop")({
  component: DropPage,
  head: () => ({
    meta: [
      { title: "Drop — send files to the team" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const KEY_STORE = "morbrai.dropkey";
const CHUNK = 3 * 1024 * 1024;

type Entry = { name: string; size: number; mtime: number };
type Listing = {
  files: Entry[];
  used: number;
  maxFile: number;
  maxFolder: number;
  free: number;
  minFree: number;
  hasKey: boolean;
};

function fmt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function when(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function DropPage() {
  const [key, setKey] = useState("");
  const [keyDraft, setKeyDraft] = useState("");
  const [minted, setMinted] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "bad"; text: string }>({
    kind: "idle",
    text: "",
  });
  const [dragging, setDragging] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY_STORE) || "";
      setKey(saved);
      setKeyDraft(saved);
    } catch {
      /* private mode */
    }
  }, []);

  const refresh = useCallback(async () => {
    const r = await listFiles();
    if (r.ok) setListing(r);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const rememberKey = (k: string) => {
    setKey(k);
    setKeyDraft(k);
    try {
      localStorage.setItem(KEY_STORE, k);
    } catch {
      /* private mode */
    }
  };

  async function mint() {
    setStatus({ kind: "busy", text: "Minting a DropKey…" });
    const r = await mintDropKey();
    if (!r.ok) {
      setStatus({ kind: "bad", text: "Could not mint a key. Try again." });
      return;
    }
    rememberKey(r.key);
    setMinted(r.key);
    setStatus({
      kind: "ok",
      text: "New DropKey made. It is shown once above — the old one stopped working.",
    });
    void refresh();
  }

  async function sendOne(file: File): Promise<string | null> {
    const b = await beginUpload({ data: { key, name: file.name, size: file.size } });
    if (!b.ok) return b.error;
    let offset = 0;
    while (offset < file.size) {
      const slice = file.slice(offset, offset + CHUNK);
      const b64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => {
          const s = String(fr.result || "");
          resolve(s.slice(s.indexOf(",") + 1));
        };
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(slice);
      });
      const a = await appendChunk({ data: { id: b.id, b64 } });
      if (!a.ok) return a.error;
      offset += CHUNK;
      setStatus({
        kind: "busy",
        text: `Sending ${file.name} — ${Math.min(100, Math.round((offset / file.size) * 100))}%`,
      });
    }
    const f = await finishUpload({ data: { id: b.id } });
    return f.ok ? null : f.error;
  }

  async function sendFiles(files: File[]) {
    if (!files.length) return;
    if (!key.trim()) {
      setStatus({
        kind: "bad",
        text: "No DropKey set. Paste the current key, or mint a new one.",
      });
      return;
    }
    const done: string[] = [];
    for (const file of files) {
      setStatus({ kind: "busy", text: `Sending ${file.name}…` });
      const err = await sendOne(file);
      if (err) {
        setStatus({ kind: "bad", text: `${file.name}: ${err}` });
        void refresh();
        return;
      }
      done.push(file.name);
    }
    setStatus({ kind: "ok", text: `Landed in the folder: ${done.join(", ")}` });
    void refresh();
  }

  async function sendPaste() {
    const text = pasteText.trim();
    if (!text) {
      setStatus({ kind: "bad", text: "The text box is empty." });
      return;
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const blob = new File([pasteText], `pasted-${stamp}.txt`, { type: "text/plain" });
    await sendFiles([blob]);
    if (pasteText.trim() === text) setPasteText("");
  }

  async function getFile(name: string) {
    setStatus({ kind: "busy", text: `Fetching ${name}…` });
    const r = await downloadFile({ data: { name } });
    if (!r.ok) {
      setStatus({ kind: "bad", text: r.error });
      return;
    }
    const bytes = Uint8Array.from(atob(r.b64), (c) => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes]));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
    setStatus({ kind: "ok", text: `Downloading ${name} (${fmt(bytes.length)}).` });
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-slate-900">
      <p className="text-xs font-semibold uppercase tracking-widest text-amber-700">
        Internal — not linked from the site
      </p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Send files to the team</h1>
      <p className="mt-3 leading-relaxed text-slate-600">
        Both directions. You drop a file here and it lands in the team's uploads folder; the team
        leaves files in the same folder and you download them below. Any file type, up to 20 MB per
        file. Uploads need your DropKey.
      </p>
      <p className="mt-2 text-sm">
        <Link to="/ideas" className="inline-block py-3 underline underline-offset-4">
          dropping an idea instead? → /ideas
        </Link>
      </p>

      {/* ---------------------------------------------------------- DropKey */}
      <section className="mt-8 rounded-2xl border border-slate-200 p-5">
        <h2 className="text-sm font-semibold">Your DropKey</h2>
        <p className="mt-1 text-sm text-slate-500">
          Minted here and kept on the server. Mint a new one any time — the old key stops working
          immediately.
        </p>

        {minted ? (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              New DropKey — shown once
            </p>
            <p className="mt-1 font-mono text-lg break-all">{minted}</p>
            <p className="mt-1 text-xs text-amber-800">
              It is saved in this browser already. Copy it somewhere safe.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={keyDraft}
            onChange={(e) => setKeyDraft(e.target.value)}
            onBlur={() => rememberKey(keyDraft.trim())}
            placeholder="DROP-XXXX-XXXX-XXXX"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
          />
          <button
            type="button"
            onClick={() => {
              rememberKey(keyDraft.trim());
              setStatus({ kind: "ok", text: "Key saved in this browser." });
            }}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium"
          >
            Save key
          </button>
          <button
            type="button"
            onClick={() => void mint()}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
          >
            Mint a new DropKey
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {listing
            ? listing.hasKey
              ? "A key exists on the server. Without the current one, uploads are refused."
              : "No key exists yet — mint one to start uploading."
            : "Checking the server…"}
        </p>
      </section>

      {/* ---------------------------------------------------------- upload */}
      <section className="mt-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void sendFiles(Array.from(e.dataTransfer.files));
          }}
          className={`rounded-2xl border-2 border-dashed p-8 text-center ${
            dragging ? "border-amber-500 bg-amber-50" : "border-slate-300 bg-slate-50"
          }`}
        >
          <p className="text-sm font-medium">Drag files here</p>
          <p className="mt-1 text-xs text-slate-500">Any type · 20 MB per file</p>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-4 rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-medium"
          >
            …or pick files
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              void sendFiles(Array.from(e.target.files || []));
              e.currentTarget.value = "";
            }}
          />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold">…or paste text</h2>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder="Paste anything — notes, a transcript, an error message"
            className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-slate-500">
              Saved as a .txt file in the folder, stamped with the time.
            </span>
            <button
              type="button"
              onClick={() => void sendPaste()}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Save this text
            </button>
          </div>
        </div>

        {status.text ? (
          <p
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

      {/* ---------------------------------------------------------- listing */}
      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            In the folder{listing ? ` (${listing.files.length})` : ""}
          </h2>
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm"
          >
            refresh
          </button>
        </div>

        {listing ? (
          <p className="mt-2 text-xs text-slate-500">
            {fmt(listing.used)} of {fmt(listing.maxFolder)} used · {fmt(listing.free)} free disk ·
            uploads stop under {fmt(listing.minFree)} free
          </p>
        ) : null}

        <ul className="mt-3 divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {listing && listing.files.length === 0 ? (
            <li className="px-4 py-6 text-sm text-slate-500">Nothing here yet.</li>
          ) : null}
          {(listing?.files || []).map((f) => (
            <li key={f.name} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{f.name}</p>
                <p className="text-xs text-slate-500">
                  {fmt(f.size)} · {when(f.mtime)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void getFile(f.name)}
                className="shrink-0 rounded-lg border border-slate-300 px-4 py-2 text-sm"
              >
                download
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Files land in <span className="font-mono">/home/team/shared/uploads/</span> on the team's
          machine. Anything here can be downloaded by anyone who reaches this page, so do not leave
          anything private in it.
        </p>
      </section>
    </main>
  );
}
