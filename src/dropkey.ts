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

/* Every character a phone keyboard might put where a hyphen belongs. An en
   dash is what iOS and Android autocorrect produce between two words, so the
   owner typing "Albatross–Shoebill" is typing the key, not a wrong key.
   Listed by code point so the file stays readable in any editor:
     U+2010 hyphen, U+2011 non-breaking hyphen, U+2012 figure dash,
     U+2013 en dash, U+2014 em dash, U+2015 horizontal bar,
     U+2212 minus sign, U+FE63 small hyphen-minus, U+FF0D fullwidth hyphen. */
const DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE63\uFF0D]/g;

/* One form for both sides of the comparison: dashes folded to "-", every run
   of whitespace (including non-breaking spaces, which is what a paste from a
   document brings) collapsed to one space, and the ends trimmed. */
function normaliseKey(raw: unknown): string {
  return String(raw ?? "")
    .replace(DASHES, "-")
    .replace(/[\s\u00A0\u2000-\u200B\u202F\u205F\u3000]+/g, " ")
    .trim()
    .toLowerCase();
}

/* Case-insensitive on purpose: the key is read off a screen and typed on a
   phone, and the capitals carry no meaning. An empty stored key matches
   nothing, so a missing file locks both pages instead of opening them. */
export async function keyMatches(given: unknown): Promise<boolean> {
  const stored = normaliseKey(await readStoredKey());
  if (!stored) return false;
  const candidate = normaliseKey(given);
  return candidate.length > 0 && candidate === stored;
}

/* The shape every gated handler returns when the key is wrong. */
export function refusal(): { ok: false; error: string } {
  return { ok: false, error: KEY_REFUSAL };
}
