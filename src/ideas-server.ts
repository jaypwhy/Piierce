import { createServerFn } from "@tanstack/react-start";

import { keyMatches, refusal } from "~/dropkey";

/* Server side of /ideas. Nothing here is ever bundled into the client: every
   handler body runs on the server, and node builtins are imported inside the
   handlers so the client bundle never sees them.

   /ideas is a sibling of /drop, deliberately separate: /drop is for prototype
   files, /ideas is for ideas, and the two never share a folder. There is no
   database and no index file — the folder IS the index, so a file added by
   hand (or by another route) shows up on the next read.

   Both pages are opened by the same DropKey, read from one file on the server
   (see ~/dropkey). No page can mint or change it, and every handler here
   checks it before it touches the folder. */

const DIR = "/home/team/shared/ideas-inbox";

const MAX_IDEA = 64 * 1024; // 64 kB of text per idea
const MIN_FREE = 120 * 1024 * 1024; // never let free disk fall below 120 MB
const MAX_TITLE = 200; // one line, kept short so the file name stays readable
const SLUG_MAX = 40;

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

function fmt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function ensureDir() {
  const fsp = await import("node:fs/promises");
  await fsp.mkdir(DIR, { recursive: true });
}

async function freeBytes(): Promise<number> {
  const fsp = await import("node:fs/promises");
  try {
    const s: any = await (fsp as any).statfs(DIR);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    /* fall through to df */
  }
  const { execFile } = await import("node:child_process");
  return await new Promise<number>((resolve) => {
    execFile("df", ["-Pk", DIR], (err, stdout) => {
      if (err) return resolve(0);
      const line = String(stdout).trim().split("\n").pop() || "";
      const cols = line.split(/\s+/);
      resolve(Number(cols[3] || 0) * 1024);
    });
  });
}

/* 2026-11-06-1832 in UTC — the name sorts the same way the clock does. */
function utcStamp(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(
    d.getUTCHours(),
  )}${p(d.getUTCMinutes())}`;
}

function utcHuman(d: Date): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(
    d.getUTCHours(),
  )}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`;
}

/* A title becomes a file name: lowercase, ASCII letters and digits only, runs
   of anything else collapsed to a single dash. */
function slugify(raw: string): string {
  const s = String(raw || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
  return s || "untitled";
}

/* Build the file body: a short header, then the text exactly as typed. */
function composeBody(title: string, text: string, now: Date): string {
  const shownTitle = title.trim() ? title.trim() : "(untitled)";
  const bar = "-".repeat(48);
  return `Title: ${shownTitle}\nDropped: ${utcHuman(now)}\n${bar}\n${text}`;
}

function titleFromBody(body: string): string {
  const first = body.split("\n", 1)[0] || "";
  const m = /^Title:\s*(.*)$/.exec(first);
  if (!m) return "(untitled)";
  const t = m[1].trim();
  return t || "(untitled)";
}

/* One idea, one file, never overwritten. The body is written to a .tmp first
   and only then linked into place: link(2) is atomic AND fails with EEXIST if
   the name is taken, so a collision picks the next suffix instead of clobbering
   an idea, and no reader ever sees a half-written file. */
export const dropIdea = createServerFn({ method: "POST" })
  .validator((d: { key: string; title: string; text: string }) => d)
  .handler(async ({ data }): Promise<Ok<{ name: string; size: number; title: string }> | Err> => {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    const crypto = await import("node:crypto");
    if (!(await keyMatches(data?.key))) return refusal();
    await ensureDir();

    const title = String(data?.title ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, MAX_TITLE);
    const text = String(data?.text ?? "");

    if (!text.trim()) {
      return { ok: false, error: "The idea box is empty — there is nothing to drop yet." };
    }

    const size = Buffer.byteLength(text, "utf8");
    if (size > MAX_IDEA) {
      return {
        ok: false,
        error: `That idea is ${fmt(size)}. The limit is 64 kB per idea, so this one was refused — split it into two ideas, or trim it down.`,
      };
    }

    const free = await freeBytes();
    if (free - size < MIN_FREE) {
      return {
        ok: false,
        error: `The disk has ${fmt(free)} free and ideas stop before free space drops under 120 MB. This idea needs ${fmt(size)}.`,
      };
    }

    const now = new Date();
    const body = composeBody(title, text, now);
    const stem = `${utcStamp(now)}-${slugify(title)}`;
    const tmp = path.join(DIR, `.tmp-${crypto.randomBytes(8).toString("hex")}`);

    try {
      await fsp.writeFile(tmp, body, { encoding: "utf8", mode: 0o644 });
      const written = (await fsp.stat(tmp)).size;

      for (let i = 0; i < 500; i++) {
        const name = i === 0 ? `${stem}.txt` : `${stem}-${i}.txt`;
        const dest = path.join(DIR, name);
        try {
          await fsp.link(tmp, dest); // atomic, refuses to overwrite
        } catch (e: any) {
          if (e && e.code === "EEXIST") continue; // taken — try the next suffix
          // Filesystem without hard links: fall back to a checked rename.
          try {
            await fsp.access(dest);
            continue;
          } catch {
            await fsp.rename(tmp, dest);
          }
        }
        await fsp.rm(tmp, { force: true });
        return { ok: true, name, size: written, title: title || "(untitled)" };
      }
      await fsp.rm(tmp, { force: true });
      return {
        ok: false,
        error: "That idea could not be given a free file name. Try again, or give it a different title.",
      };
    } catch {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      return { ok: false, error: "The idea could not be saved. Try again." };
    }
  });

/* --------------------------------------------------------------- listing -- */

export const listIdeas = createServerFn({ method: "POST" })
  .validator((d: { key: string }) => d)
  .handler(async ({ data }): Promise<
    | Ok<{
        files: { name: string; size: number; mtime: number; title: string }[];
        used: number;
        maxIdea: number;
        free: number;
        minFree: number;
        dir: string;
      }>
    | Err
  > => {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    if (!(await keyMatches(data?.key))) return refusal();
    await ensureDir();
    const files: { name: string; size: number; mtime: number; title: string }[] = [];
    let used = 0;
    try {
      for (const e of await fsp.readdir(DIR, { withFileTypes: true })) {
        if (!e.isFile() || e.name.startsWith(".")) continue;
        if (!e.name.toLowerCase().endsWith(".txt")) continue;
        try {
          const full = path.join(DIR, e.name);
          const st = await fsp.stat(full);
          used += st.size;
          let title = e.name.replace(/\.txt$/i, "");
          try {
            title = titleFromBody(await fsp.readFile(full, "utf8"));
          } catch {
            /* keep the name as the title */
          }
          files.push({ name: e.name, size: st.size, mtime: st.mtimeMs, title });
        } catch {
          /* file vanished mid-scan — ignore */
        }
      }
    } catch {
      /* empty folder */
    }
    files.sort((a, b) => b.mtime - a.mtime || (a.name < b.name ? 1 : -1));
    return {
      ok: true,
      files,
      used,
      maxIdea: MAX_IDEA,
      free: await freeBytes(),
      minFree: MIN_FREE,
      dir: DIR,
    };
  });

/* -------------------------------------------------------------- download -- */

export const downloadIdea = createServerFn({ method: "POST" })
  .validator((d: { key: string; name: string }) => d)
  .handler(async ({ data }): Promise<Ok<{ name: string; b64: string }> | Err> => {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    if (!(await keyMatches(data?.key))) return refusal();
    const name = String(data?.name || "");
    if (!name || name !== path.basename(name) || name.startsWith(".")) {
      return { ok: false, error: "That file name is not valid." };
    }
    try {
      const buf = await fsp.readFile(path.join(DIR, name));
      return { ok: true, name, b64: buf.toString("base64") };
    } catch {
      return { ok: false, error: "That idea is no longer in the folder. Refresh the list." };
    }
  });
