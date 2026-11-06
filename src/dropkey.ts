/* The one DropKey, shared by /drop and /ideas.
 *
 * The key is the team's, not the page's: it is written to a single file on the
 * server by the team, and no page can mint, change or read it back. Everything
 * below runs on the server only — the file is read inside the function, so the
 * client bundle never carries the path, and the stored value is never returned
 * to a browser. Only a yes/no comes back.
 */

const KEYFILE = "/home/team/shared/uploads/.dropkey";

/* One plain line, used by every refusal on both pages. It says nothing about
   whether a key exists, how long it is, or whether it is close. */
export const KEY_REFUSAL = "That DropKey is not right.";

async function readStoredKey(): Promise<string> {
  const fsp = await import("node:fs/promises");
  try {
    return (await fsp.readFile(KEYFILE, "utf8")).trim();
  } catch {
    return "";
  }
}

/* Case-insensitive on purpose: the key is read off a screen and typed on a
   phone, and the capitals carry no meaning. An empty stored key matches
   nothing, so a missing file locks both pages instead of opening them. */
export async function keyMatches(given: unknown): Promise<boolean> {
  const stored = await readStoredKey();
  if (!stored) return false;
  const candidate = String(given ?? "")
    .trim()
    .toLowerCase();
  return candidate.length > 0 && candidate === stored.toLowerCase();
}

/* The shape every gated handler returns when the key is wrong. */
export function refusal(): { ok: false; error: string } {
  return { ok: false, error: KEY_REFUSAL };
}
