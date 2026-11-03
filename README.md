# Piierce

The shared Pierce Collabs library: one TypeScript client for the site's `/api/v1` surface, and the `pc` CLI built on it.

Any project in the ecosystem — Sip Drip, Chew Pay, Press Pay Btn, Rice Milker, Roasted Bean, Water Vibrate, the Art Integration App, or something new — imports this instead of re-implementing HTTP calls, envelopes and error handling.

The **site** (`jaypwhy/Pierce-collabs`) serves `/api/v1`. **Piierce** is the client side: it holds no account, no formula and no rate. Everything numeric — the Pi Algo formula, the drip cooldown, the ladder rungs, the conversion minimum — is read out of the API response, so when the site changes a number this library follows without a release.

## Install

Not on npm yet — install from the repository:

```bash
npm install github:jaypwhy/Piierce
# or, in a repo that vendors it:
bun add github:jaypwhy/Piierce
```

The package is ESM, needs Node 18+ (global `fetch`), and ships compiled JS plus `.d.ts` in `dist/`. `npm install` from a git URL runs `prepublishOnly`; if your installer does not build git dependencies, run `npm run build` in the package once.

## Client

```ts
import { createClient, PiierceError } from "piierce";

const client = createClient();                      // the working site
// const client = createClient({ api: LIVE_API });  // the published site
// const client = createClient("http://localhost:3000");

const balance = await client.balance();
console.log(balance.points, balance.dollarValue, balance.conversion.formula);
//                                   ^ the Pi Algo value      ^ the rule itself, from the API

await client.sip({ points: 5, note: "chew pay" });
await client.drip();                                // cooldown is the server's call
await client.convert(10);                           // dollars come back in the envelope
const ladder = await client.ladder();               // { formula, minimumPoints, rungs }
await client.artSave({ name: "Vase", media: "Pottery wheel", thumb: dataUrl });
const { pieces } = await client.artList();
const registry = await client.services();           // every service, its status and actions
```

Every method returns the envelope's `data` and throws `PiierceError` when the service refuses. A planned service is not a crash:

```ts
try {
  await client.data("ruhbi", "ledger");
} catch (error) {
  if (error instanceof PiierceError && error.isNotConnected) {
    // ruhbi has not landed yet — offer the bridge instead
  }
}
```

### Raw envelopes

`call()` never throws on a service error, which is what you want when the error *is* the answer:

```ts
const envelope = await client.call("upayu", "drip");
if (!envelope.ok && envelope.error.code === "cooldown") {
  // 429 — the drip is resting
}
```

`client.data(service, action, { body })` is the throwing form, and is how a service Piierce has no named method for is still reachable — every adapter the site adds works here immediately.

### Options

| Option | Default | Meaning |
| --- | --- | --- |
| `api` | the working site (`DEFAULT_API`) | Base URL of an instance serving `/api/v1` |
| `timeoutMs` | `20000` | Per-request timeout |
| `headers` | `{}` | Extra headers, merged over `accept: application/json` |
| `fetch` | global `fetch` | Inject your own (tests, another runtime) |

`client.url("/api/v1/upayu/balance")` gives the absolute URL for logging or a `curl` repro.

## CLI

```bash
npx pc services
npx pc balance
npx pc sip --points 5 --note "chew pay"
npx pc drip
npx pc convert 10
npx pc ladder
npx pc art list
npx pc art save --name "Vase" --media "Pottery wheel"
```

The default target is the working site. Point it anywhere with `--api`, or set `PC_API` for a whole shell:

```bash
pc balance --api http://localhost:3000
PC_API=https://d6fba97f0124d530d64629080c843c5e.cto.site pc balance
```

`--json` prints the raw envelope for scripts and other agents. Exit codes: `0` ok · `1` error · `2` bad usage · `3` service not connected (planned, not broken).

Any service/action pair works even before it has a subcommand — `pc <service> <action> [json]`, where a JSON argument means POST:

```bash
pc ruhbi ledger
pc mission complete '{"task":"..."}'
```

From the package itself: `npm run pc -- balance`.

## Integrating a new app

1. Add the dependency, create one client at the app's edge.
2. Call the same methods every other project calls — one account, one balance, one ledger.
3. Award points with `sip()` (or a service-specific action once one exists) rather than keeping a second balance.
4. Show value by reading `dollarValue`, `conversion.formula` and `ladder()` from the API. Do not copy the formula into the app: it is the site's, and it changes there.
5. Treat `PiierceError` with `isNotConnected` as "coming soon", not as an outage.

The site's own `pc` command line (`site/bin/pc.ts`) and this one speak the same API and the same flags; this package is the version other repositories import.

## Development

```bash
npm install
npm run build      # tsc -> dist
npm run typecheck
npm run pc -- services
```
