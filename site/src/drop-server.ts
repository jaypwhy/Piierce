import { createServerFn } from "@tanstack/react-start";

/* Server side of /drop. Nothing here is ever bundled into the client: every
   handler body runs on the server, and node builtins are imported inside the
   handlers so the client bundle never sees them. */

const DIR = "/home/team/shared/uploads";
const TMP = DIR + "/.tmp";
const KEYFILE = DIR + "/.dropkey";

const MAX_FILE = 20 * 1024 * 1024; // 20 MB per file
const MAX_FOLDER = 100 * 1024 * 1024; // 100 MB for the whole folder
const MIN_FREE = 120 * 1024 * 1024; // never let free disk fall below 120 MB

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

function fmt(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} kB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function ensureDir() {
  const fsp = await import("node:fs/promises");
  await fsp.mkdir(TMP, { recursive: true });
}

async function folderBytes(): Promise<number> {
  const fsp = await import("node:fs/promises");
  const path = await import("node:path");
  let total = 0;
  const entries = await fsp.readdir(DIR, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith(".")) continue;
    try {
      total += (await fsp.stat(path.join(DIR, e.name))).size;
    } catch {
      /* file vanished mid-scan — ignore */
    }
  }
  return total;
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

async function readKey(): Promise<string> {
  const fsp = await import("node:fs/promises");
  try {
    return (await fsp.readFile(KEYFILE, "utf8")).trim();
  } catch {
    return "";
  }
}

function sanitiseName(raw: string): string {
  let name = String(raw || "").split(/[\\/]/).pop() || "";
  name = name.replace(/[\u0000-\u001f\u007f]/g, "").replace(/[:*?"<>|]/g, "_").trim();
  name = name.replace(/^\.+/, "");
  if (!name) name = "file";
  if (name.length > 120) {
    const dot = name.lastIndexOf(".");
    const ext = dot > 0 && name.length - dot <= 12 ? name.slice(dot) : "";
    name = name.slice(0, 120 - ext.length) + ext;
  }
  return name;
}

async function uniqueName(base: string): Promise<string> {
  const fsp = await import("node:fs/promises");
  const path = await import("node:path");
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let candidate = base;
  for (let i = 1; i < 500; i++) {
    try {
      await fsp.access(path.join(DIR, candidate));
      candidate = `${stem}-${i}${ext}`;
    } catch {
      return candidate;
    }
  }
  return `${stem}-${Date.now()}${ext}`;
}

/* ---------------------------------------------------------------- key ---- */

export const mintDropKey = createServerFn({ method: "POST" }).handler(
  async (): Promise<Ok<{ key: string }>> => {
    const fsp = await import("node:fs/promises");
    const crypto = await import("node:crypto");
    await ensureDir();
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const pick = (n: number) =>
      Array.from(crypto.randomBytes(n))
        .map((b) => alphabet[b % alphabet.length])
        .join("");
    const key = `DROP-${pick(4)}-${pick(4)}-${pick(4)}`;
    await fsp.writeFile(KEYFILE, key + "\n", { mode: 0o600 });
    return { ok: true, key };
  },
);

/* -------------------------------------------------------------- uploads -- */

export const beginUpload = createServerFn({ method: "POST" })
  .validator((d: { key: string; name: string; size: number }) => d)
  .handler(async ({ data }): Promise<Ok<{ id: string }> | Err> => {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    const crypto = await import("node:crypto");
    await ensureDir();

    const stored = await readKey();
    if (!stored) {
      return { ok: false, error: "No DropKey exists yet. Mint one on this page first." };
    }
    if (!data?.key || data.key.trim().toUpperCase() !== stored.toUpperCase()) {
      return {
        ok: false,
        error: "That DropKey is not the current one. Paste the current key, or mint a new one.",
      };
    }

    const size = Number(data.size);
    if (!Number.isFinite(size) || size <= 0) {
      return { ok: false, error: "That file is empty (0 bytes), so there is nothing to send." };
    }
    if (size > MAX_FILE) {
      return {
        ok: false,
        error: `That file is ${fmt(size)}. The limit is 20 MB per file, so this one was refused.`,
      };
    }

    const used = await folderBytes();
    if (used + size > MAX_FOLDER) {
      return {
        ok: false,
        error: `The folder already holds ${fmt(used)} of its 100 MB. Adding ${fmt(size)} would pass the cap — ask the team to clear space, then try again.`,
      };
    }

    const free = await freeBytes();
    if (free - size < MIN_FREE) {
      return {
        ok: false,
        error: `The disk has ${fmt(free)} free and uploads stop before free space drops under 120 MB. This file needs ${fmt(size)}.`,
      };
    }

    const id = crypto.randomBytes(8).toString("hex");
    await fsp.writeFile(path.join(TMP, id + ".part"), new Uint8Array());
    await fsp.writeFile(
      path.join(TMP, id + ".json"),
      JSON.stringify({ name: String(data.name || "file"), size }),
    );
    return { ok: true, id };
  });

export const appendChunk = createServerFn({ method: "POST" })
  .validator((d: { id: string; b64: string }) => d)
  .handler(async ({ data }): Promise<Ok<{ received: number }> | Err> => {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    if (!/^[a-f0-9]{16}$/.test(String(data?.id || ""))) {
      return { ok: false, error: "That upload session is not valid." };
    }
    const part = path.join(TMP, data.id + ".part");
    try {
      await fsp.appendFile(part, Buffer.from(String(data.b64 || ""), "base64"));
      const st = await fsp.stat(part);
      if (st.size > MAX_FILE) {
        await fsp.rm(part, { force: true });
        return { ok: false, error: "That upload passed 20 MB and was refused." };
      }
      return { ok: true, received: st.size };
    } catch {
      return { ok: false, error: "The upload session was lost. Start the file again." };
    }
  });

export const finishUpload = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }): Promise<Ok<{ name: string; size: number }> | Err> => {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    if (!/^[a-f0-9]{16}$/.test(String(data?.id || ""))) {
      return { ok: false, error: "That upload session is not valid." };
    }
    const part = path.join(TMP, data.id + ".part");
    const metaFile = path.join(TMP, data.id + ".json");
    try {
      const meta = JSON.parse(await fsp.readFile(metaFile, "utf8"));
      const st = await fsp.stat(part);
      if (st.size === 0) {
        await fsp.rm(part, { force: true });
        await fsp.rm(metaFile, { force: true });
        return { ok: false, error: "Nothing arrived — the file was empty." };
      }
      if (Number(meta.size) && st.size !== Number(meta.size)) {
        await fsp.rm(part, { force: true });
        await fsp.rm(metaFile, { force: true });
        return {
          ok: false,
          error: `The upload broke off (${fmt(st.size)} of ${fmt(Number(meta.size))} arrived). Try that file again.`,
        };
      }
      const name = await uniqueName(sanitiseName(meta.name));
      await fsp.rename(part, path.join(DIR, name));
      await fsp.rm(metaFile, { force: true });
      return { ok: true, name, size: st.size };
    } catch {
      return { ok: false, error: "The upload could not be finished. Try that file again." };
    }
  });

/* --------------------------------------------------------------- listing -- */

export const listFiles = createServerFn({ method: "GET" }).handler(
  async (): Promise<
    Ok<{
      files: { name: string; size: number; mtime: number }[];
      used: number;
      maxFile: number;
      maxFolder: number;
      free: number;
      minFree: number;
      hasKey: boolean;
    }>
  > => {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    await ensureDir();
    const files: { name: string; size: number; mtime: number }[] = [];
    let used = 0;
    try {
      for (const e of await fsp.readdir(DIR, { withFileTypes: true })) {
        if (!e.isFile() || e.name.startsWith(".")) continue;
        try {
          const st = await fsp.stat(path.join(DIR, e.name));
          files.push({ name: e.name, size: st.size, mtime: st.mtimeMs });
          used += st.size;
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* empty folder */
    }
    files.sort((a, b) => b.mtime - a.mtime);
    return {
      ok: true,
      files,
      used,
      maxFile: MAX_FILE,
      maxFolder: MAX_FOLDER,
      free: await freeBytes(),
      minFree: MIN_FREE,
      hasKey: (await readKey()) !== "",
    };
  },
);

/* -------------------------------------------------------------- download -- */

export const downloadFile = createServerFn({ method: "POST" })
  .validator((d: { name: string }) => d)
  .handler(async ({ data }): Promise<Ok<{ name: string; b64: string }> | Err> => {
    const fsp = await import("node:fs/promises");
    const path = await import("node:path");
    const name = String(data?.name || "");
    if (!name || name !== path.basename(name) || name.startsWith(".")) {
      return { ok: false, error: "That file name is not valid." };
    }
    try {
      const buf = await fsp.readFile(path.join(DIR, name));
      return { ok: true, name, b64: buf.toString("base64") };
    } catch {
      return { ok: false, error: "That file is no longer in the folder. Refresh the list." };
    }
  });
