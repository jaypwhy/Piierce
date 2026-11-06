import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/framework")({
  component: Framework,
});

/* Past timeline entries — years only where well-established */
const PAST: { era: string; items: { year: string; title: string; blurb: string }[] }[] = [
  {
    era: "19th century — touch becomes reading",
    items: [
      {
        year: "1829",
        title: "Braille",
        blurb:
          "Louis Braille publishes his raised-dot alphabet. Six dots, felt with a fingertip, become full literacy — proof that touch alone can carry language.",
      },
      {
        year: "1800s",
        title: "Early hearing aids",
        blurb:
          "Ear trumpets and conversation tubes amplify sound mechanically. Crude, but the first mass attempt to bridge a weakened sense with a tool.",
      },
      {
        year: "1800s",
        title: "Typewriters for blind legibility",
        blurb:
          "Early writing machines are developed partly to produce clear, legible text for blind readers — embossing letters so fingers can follow what eyes cannot.",
      },
    ],
  },
  {
    era: "20th century — sound and touch go electric",
    items: [
      {
        year: "1930s",
        title: "Talking books",
        blurb:
          "Recorded books give blind readers a listening path to literature — sound steps in where print is closed off.",
      },
      {
        year: "1930s–80s",
        title: "Speech synthesizers",
        blurb:
          "Machines learn to speak: electronic voices turn text into sound, foreshadowing today's screen readers.",
      },
      {
        year: "1950s",
        title: "Sip-and-puff controls",
        blurb:
          "Breath-operated switches let people with very limited mobility drive wheelchairs and type — one remaining channel (breath) carries full intent.",
      },
      {
        year: "1951",
        title: "Perkins Brailler",
        blurb:
          "A sturdy, affordable mechanical Braille typewriter brings tactile writing to classrooms everywhere.",
      },
    ],
  },
  {
    era: "Late 20th / early 21st century — the digital bridge",
    items: [
      {
        year: "1980s–90s",
        title: "Screen readers",
        blurb:
          "Software narrates what's on screen, opening computers and then the web to blind users.",
      },
      {
        year: "1990s–2000s",
        title: "Voice recognition",
        blurb:
          "Speech-to-text lets people write and command machines by talking — hearing and voice become input devices.",
      },
      {
        year: "1900s–today",
        title: "Assistive listening",
        blurb:
          "From hearing-aid loops to cochlear implants and live captioning, technology keeps routing sound around damage.",
      },
      {
        year: "2000s–today",
        title: "Advanced prosthetics",
        blurb:
          "Myoelectric limbs read muscle signals to grip and gesture — the body and the device start speaking the same electrical language.",
      },
    ],
  },
];

const FUTURE: { title: string; points: string[]; morbrai: string }[] = [
  {
    title: "Brain–Computer Interfaces",
    points: ["Motor control", "Sensory input", "Communication"],
    morbrai:
      "Morbraii is a no-implant first step: today's phone haptics train the brain to read vibration as language, no surgery needed.",
  },
  {
    title: "AR / VR",
    points: ["Simulated experience", "Sensory enhancement"],
    morbrai:
      "Morbraii pairs a visual glyph with touch and sound — one small version of the multi-sense overlays AR/VR aims for, running on a phone today.",
  },
  {
    title: "AI / ML",
    points: ["Predictive adaptation", "Personalized learning"],
    morbrai:
      "Morbraii's lessons adapt pace and streaks to the learner — a simple, low-cost preview of personalized sensory learning, with vibration plus melody doing the teaching.",
  },
];

function Framework() {
  return (
    <main className="min-h-dvh bg-slate-950 px-4 pb-16 pt-6 text-slate-100">
      <div className="mx-auto w-full max-w-xl">
        <Link
          to="/"
          className="inline-block rounded-xl border-2 border-slate-600 bg-slate-800 px-4 py-3 text-sm font-bold text-slate-200"
        >
          ← Back to demo
        </Link>

        {/* Hero */}
        <header className="mt-4 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-cyan-300">
            Past &amp; Future Adaptive Tech
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            Where Morbraii comes from — and where it&apos;s going
          </h1>
          <p className="mt-3 text-base text-slate-300">
            Braille taught fingertips to read; Morse taught rhythm to speak.
            Morbraii reunites them as touch-as-language — reconnecting senses
            that technology kept apart.
          </p>
        </header>

        {/* Past timeline */}
        <section aria-label="Past timeline" className="mt-8">
          <h2 className="text-lg font-bold">The past — senses, bridged by hand</h2>
          {PAST.map((block) => (
            <div key={block.era} className="mt-4">
              <h3 className="text-base font-bold text-cyan-300">{block.era}</h3>
              <div className="mt-2 flex flex-col gap-2">
                {block.items.map((it) => (
                  <article
                    key={it.title}
                    className="rounded-2xl border border-slate-700 bg-slate-900 p-4"
                  >
                    <p className="font-mono text-xs uppercase tracking-widest text-amber-300">
                      {it.year}
                    </p>
                    <h4 className="mt-1 text-base font-black text-white">
                      {it.title}
                    </h4>
                    <p className="mt-1 text-sm text-slate-300">{it.blurb}</p>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* Future */}
        <section aria-label="Future directions" className="mt-8">
          <h2 className="text-lg font-bold">The future — and Morbraii&apos;s place in it</h2>
          <div className="mt-3 flex flex-col gap-3">
            {FUTURE.map((f) => (
              <article
                key={f.title}
                className="rounded-2xl border border-slate-700 bg-slate-900 p-5"
              >
                <h3 className="text-base font-black text-white">{f.title}</h3>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {f.points.map((p) => (
                    <li
                      key={p}
                      className="rounded-full bg-slate-800 px-3 py-1 text-sm font-bold text-cyan-200"
                    >
                      {p}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-slate-300">{f.morbrai}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Closing */}
        <section aria-label="Reconnecting senses" className="mt-8">
          <h2 className="text-lg font-bold">Reconnecting senses</h2>
          <div className="mt-3 rounded-2xl border border-cyan-800 bg-cyan-950/40 p-5">
            <p className="text-base text-slate-200">
              Morbraii treats vibration, touch, and sound as one language: every
              letter buzzes its rhythm, rings its note, and shows its glyph at
              the same time. No channel works alone — and that&apos;s the
              point. It&apos;s a small, low-cost bridge toward fuller sensory
              connection: a reminder that our senses were never meant to work
              apart.
            </p>
            <Link
              to="/"
              className="mt-4 block min-h-[56px] rounded-2xl bg-cyan-400 px-4 py-4 text-center text-lg font-black text-slate-950"
            >
              Try the demo — feel A, B, C
            </Link>
          </div>
        </section>

        <footer className="mt-8 text-center text-xs text-slate-400">
          <p>Morbraii — Morse timing × Braille touch × one hybrid glyph.</p>
        </footer>
      </div>
    </main>
  );
}
