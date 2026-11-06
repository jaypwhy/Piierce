/* Prove the shared module and the page produce the same schedule.
 *
 *   node --experimental-strip-types scripts/miracle-schedule.ts [page.json]
 *
 * With no argument it prints the MIRACLE schedule at standard 5 wpm.
 * With a page.json written by the browser probe ({ calls: [[ms, [..pattern]]] },
 * one navigator.vibrate call per letter, timestamps relative to the click) it
 * also compares the page's measured letter onsets and element durations with
 * the module's, and exits non-zero on any mismatch.
 */
import { readFileSync } from "node:fs";
import {
  buildTiming,
  encodeMessage,
  STANDARD_DEFAULT_WPM,
  unitOfWpm,
} from "../src/lib/morbrai.ts";

const timing = buildTiming("standard", unitOfWpm(STANDARD_DEFAULT_WPM));
const schedule = encodeMessage("MIRACLE", timing);

const patternOf = (letter: (typeof schedule.letters)[number]): number[] => {
  const out: number[] = [];
  letter.elements.forEach((e, i) => {
    out.push(e.durationMs);
    if (i < letter.elements.length - 1) out.push(e.gapAfterMs);
  });
  return out;
};

console.log(
  JSON.stringify(
    {
      profile: schedule.profile,
      unitMs: schedule.unitMs,
      wpm: schedule.wpm,
      totalMs: schedule.totalMs,
      letters: schedule.letters.map((l) => ({
        letter: l.letter,
        morse: l.morse,
        braille: l.braille,
        hz: Number(l.hz.toFixed(2)),
        startMs: l.startMs,
        pattern: patternOf(l),
      })),
    },
    null,
    1,
  ),
);

const file = process.argv[2];
if (!file) process.exit(0);

const page = JSON.parse(readFileSync(file, "utf8")) as {
  calls: [number, number[]][];
};
if (page.calls.length !== schedule.letters.length) {
  console.error(
    `MISMATCH letter count: page ${page.calls.length}, module ${schedule.letters.length}`,
  );
  process.exit(1);
}

let worstOnset = 0;
let badPatterns = 0;
/* The click handler itself starts some milliseconds after the probe's
   reference point, so align on the SECOND letter: every later onset is
   scheduled from the handler's own t = 0. */
const t0 = page.calls.length > 1 ? page.calls[1][0] - schedule.letters[1].startMs : page.calls[0][0];
page.calls.forEach(([ms, pattern], i) => {
  const l = schedule.letters[i];
  const onset = ms - t0;
  /* Letter 0 carries the click handler's own start-up latency, not timing. */
  if (i > 0) worstOnset = Math.max(worstOnset, Math.abs(onset - l.startMs));
  const mine = patternOf(l);
  if (mine.join(",") !== pattern.join(",")) {
    badPatterns += 1;
    console.error(`pattern mismatch ${l.letter}: page [${pattern}] module [${mine}]`);
  }
});

console.log(
  `\npage vs module — MIRACLE, standard 5 wpm: ${page.calls.length} letters, ` +
    `patterns identical: ${badPatterns === 0}, worst letter-onset difference ` +
    `${worstOnset} ms (timer jitter), total ${schedule.totalMs} ms`,
);
process.exit(badPatterns === 0 && worstOnset <= 5 ? 0 : 1);
