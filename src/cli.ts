#!/usr/bin/env node
/**
 * `pc` — the Pierce Collabs CLI, built on the Piierce client.
 *
 * It talks to /api/v1 over HTTP and nothing else, so the same command works
 * against the working site, the live site or a local instance (`--api <url>`).
 * Every service answers in one envelope, so this file formats envelopes rather
 * than knowing each service — and every number it prints (the Pi Algo formula,
 * the drip cooldown, the ladder) came from the API.
 *
 *   pc services · balance · sip · drip · convert <points> · ladder · art list
 *   pc ruhbi ledger  (planned — says so, exits 3)
 *
 * Flags: --json, --api <url>, --help. Exit: 0 ok · 1 error · 2 bad usage · 3 not connected.
 */
import { DEFAULT_API, PiierceClient, PiierceError, routePath } from "./client.js";
import type {
  ArtSavedData,
  BalanceData,
  ChangeData,
  Envelope,
  LadderData,
  PiecesData,
  RegistryData,
} from "./envelope.js";

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_NOT_CONNECTED = 3;

type Flags = {
  json: boolean;
  help: boolean;
  api: string;
  values: Record<string, string>;
};

const VALUE_FLAGS = new Set(["api", "points", "note", "name", "media", "thumb", "body"]);

class UsageError extends Error {}

function parseArgs(argv: string[]): { flags: Flags; words: string[] } {
  const flags: Flags = {
    json: false,
    help: false,
    api: process.env.PC_API?.trim() || DEFAULT_API,
    values: {},
  };
  const words: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] as string;
    if (arg === "--") {
      words.push(...argv.slice(i + 1));
      break;
    }
    if (arg === "--json") {
      flags.json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      flags.help = true;
      continue;
    }
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      if (!VALUE_FLAGS.has(name)) throw new UsageError(`Unknown flag --${name}.`);
      let value: string;
      if (eq !== -1) {
        value = arg.slice(eq + 1);
      } else {
        value = argv[i + 1] as string;
        if (value === undefined) throw new UsageError(`--${name} needs a value.`);
        i++;
      }
      if (name === "api") flags.api = value;
      else flags.values[name] = value;
      continue;
    }
    words.push(arg);
  }

  return { flags, words };
}

type Command = {
  /** The words that select this command, e.g. ["art", "list"]. */
  words: string[];
  method: "GET" | "POST";
  service: string;
  action: string;
  usage: string;
  summary: string;
  /** The request body for a POST, or undefined for a GET. */
  body?: (flags: Flags, rest: string[]) => Record<string, unknown>;
};

const COMMANDS: Command[] = [
  {
    words: ["services"],
    method: "GET",
    service: "registry",
    action: "services",
    usage: "pc services",
    summary: "Every service in the ecosystem, with its status and actions.",
  },
  {
    words: ["balance"],
    method: "GET",
    service: "upayu",
    action: "balance",
    usage: "pc balance",
    summary: "Points, Pi Algo dollars and the saved pieces on the one account.",
  },
  {
    words: ["sip"],
    method: "POST",
    service: "upayu",
    action: "sip",
    usage: 'pc sip [--points 5] [--note "..."]',
    summary: "Points into the account — +5 by default.",
    body: (flags) => ({
      points: Number(flags.values.points ?? 5),
      note: flags.values.note ?? "pc sip",
    }),
  },
  {
    words: ["drip"],
    method: "POST",
    service: "upayu",
    action: "drip",
    usage: "pc drip",
    summary: "The base-income drip: +25 points, one per 60-second cooldown.",
    body: () => ({}),
  },
  {
    words: ["convert"],
    method: "POST",
    service: "upayu",
    action: "convert",
    usage: "pc convert <points>",
    summary: "Convert points at the Pi Algo — the rate is whatever the API states.",
    body: (flags, rest) => {
      const raw = rest[0] ?? flags.values.points;
      const points = Number(raw);
      if (raw === undefined || !Number.isFinite(points) || points < 1) {
        throw new UsageError("convert needs a number of points: pc convert <points>");
      }
      return { points };
    },
  },
  {
    words: ["ladder"],
    method: "GET",
    service: "upayu",
    action: "ladder",
    usage: "pc ladder",
    summary: "The pi ladder — the same rule at 1, 10, 100 and 1,000 points.",
  },
  {
    words: ["art", "list"],
    method: "GET",
    service: "art",
    action: "list",
    usage: "pc art list",
    summary: "Every saved piece, newest first.",
  },
  {
    words: ["art", "save"],
    method: "POST",
    service: "art",
    action: "save",
    usage: 'pc art save --name "Vase" --media "Pottery wheel" [--thumb <data-url>]',
    summary: "Save a piece; it earns its points into the same account.",
    body: (flags) => {
      const name = flags.values.name;
      const media = flags.values.media;
      if (!name || !media) throw new UsageError("art save needs --name and --media.");
      return { name, media, thumb: flags.values.thumb };
    },
  },
  {
    words: ["ruhbi", "ledger"],
    method: "GET",
    service: "ruhbi",
    action: "ledger",
    usage: "pc ruhbi ledger",
    summary: "Planned — the RUHBI ledger does not exist yet.",
  },
  {
    words: ["morbraii", "identity"],
    method: "GET",
    service: "morbraii",
    action: "identity",
    usage: "pc morbraii identity",
    summary: "Planned — identity is Morbraii's job and Morbraii does not exist yet.",
  },
  {
    words: ["mission", "complete"],
    method: "POST",
    service: "mission",
    action: "complete",
    usage: "pc mission complete [--body '<json>']",
    summary: "Planned — there is no task list to complete against yet.",
    body: (flags) => parseJsonFlag(flags),
  },
  {
    words: ["acorn-tap", "deposit"],
    method: "POST",
    service: "acorn-tap",
    action: "deposit",
    usage: "pc acorn-tap deposit [--body '<json>']",
    summary: "Planned — nothing here moves money yet.",
    body: (flags) => parseJsonFlag(flags),
  },
];

const SERVICE_NAMES = ["upayu", "art", "sip-drip", "ruhbi", "morbraii", "mission", "acorn-tap"];

function parseJsonFlag(flags: Flags): Record<string, unknown> {
  const raw = flags.values.body;
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new UsageError("--body must be a JSON object.");
  }
}

function findCommand(words: string[]): Command | undefined {
  return COMMANDS.find((command) => command.words.every((word, i) => words[i] === word));
}

/**
 * Anything the table does not know: `pc <service> <action> [json]` goes straight
 * at /api/v1/<service>/<action>, so a new adapter works here before its
 * subcommand exists. A JSON argument means POST, otherwise GET.
 */
function genericCommand(words: string[]): Command | undefined {
  const [service, action] = words;
  if (!service || !SERVICE_NAMES.includes(service)) return undefined;
  if (!action || action.startsWith("-")) return undefined;
  const json = words[2];
  return {
    words: [service, action],
    method: json ? "POST" : "GET",
    service,
    action,
    usage: `pc ${service} ${action}${json ? " <json>" : ""}`,
    summary: `${service} · ${action}`,
    body: json
      ? () => {
          try {
            return JSON.parse(json) as Record<string, unknown>;
          } catch {
            throw new UsageError("That argument must be a JSON object.");
          }
        }
      : undefined,
  };
}

function money(dollars: number): string {
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}

function count(points: number): string {
  return points.toLocaleString("en-US");
}

function formatServices(data: RegistryData): string {
  const lines = [`${data.count} services · ${data.live} live · ${data.planned} planned`, ""];
  for (const service of data.services) {
    const actions = service.actions.length ? service.actions.join(", ") : "uses upayu";
    lines.push(`${service.name.padEnd(11)} ${service.status.padEnd(8)} ${actions}`);
    lines.push(`${" ".repeat(12)}${service.blurb}`);
  }
  return lines.join("\n");
}

function formatBalance(data: BalanceData): string {
  const drip = data.drip.ready
    ? `ready (+${data.drip.points})`
    : `ready in ${Math.ceil(data.drip.remainingMs / 1000)}s`;
  return [
    "UPayU balance",
    `  points    ${count(data.points)}`,
    `  Pi Algo   ${money(data.dollarValue)}   (${data.conversion.formula})`,
    `  settled   ${money(data.dollars)}`,
    `  total     ${money(data.totalValue)}`,
    `  pieces    ${data.pieces}`,
    `  drip      ${drip}`,
  ].join("\n");
}

function formatChange(data: ChangeData): string {
  const lines = [data.message ?? "Done."];
  if (typeof data.points === "number") {
    lines.push(
      `points ${count(data.points)} · Pi Algo ${money(data.dollarValue)} · pieces ${data.pieces}`,
    );
  }
  return lines.join("\n");
}

function formatLadder(data: LadderData): string {
  const lines = [`Pi Algo — ${data.formula}`, ""];
  for (const rung of data.rungs) {
    lines.push(`${count(rung.points).padStart(6)} pts  ${money(rung.dollars)}`);
  }
  return lines.join("\n");
}

function formatPieces(data: PiecesData): string {
  if (!data.count) return "No pieces saved yet — the art studio is at /art.";
  const lines = [`${data.count} ${data.count === 1 ? "piece" : "pieces"}`, ""];
  for (const piece of data.pieces) {
    lines.push(`${piece.name} — ${piece.media} · ${count(piece.points)} pts · ${piece.at.slice(0, 10)}`);
  }
  return lines.join("\n");
}

function formatArtSaved(data: ArtSavedData): string {
  return [data.message ?? "Saved.", `${data.piece?.name ?? "Piece"} · points ${count(data.points)}`].join(
    "\n",
  );
}

function format(command: Command, data: unknown): string {
  if (command.service === "registry") return formatServices(data as RegistryData);
  if (command.action === "balance") return formatBalance(data as BalanceData);
  if (command.action === "ladder") return formatLadder(data as LadderData);
  if (command.action === "list") return formatPieces(data as PiecesData);
  if (command.action === "save") return formatArtSaved(data as ArtSavedData);
  if (command.action === "sip" || command.action === "drip" || command.action === "convert") {
    return formatChange(data as ChangeData);
  }
  return JSON.stringify(data, null, 2);
}

function rootHelp(): string {
  return [
    "pc — the Pierce Collabs CLI",
    "",
    "Usage: pc <command> [flags]",
    "",
    ...COMMANDS.map((command) => `  ${command.usage.padEnd(52)} ${command.summary}`),
    "",
    "Flags:",
    "  --json          raw envelope, for scripts and other agents",
    "  --api <url>     target instance (default: the working site)",
    "  --help          this list, or help for one command",
    "",
    `Default API: ${DEFAULT_API}   (PC_API overrides it)`,
    "",
    "Exit: 0 ok · 1 error · 2 bad usage · 3 service not connected",
  ].join("\n");
}

function commandHelp(command: Command): string {
  return [
    `pc ${command.words.join(" ")} — ${command.summary}`,
    "",
    `Usage: ${command.usage}`,
    "",
    `${command.method} ${routePath(command.service, command.action)}`,
    "",
    "Flags: --json · --api <url> · --help",
  ].join("\n");
}

async function request(
  client: PiierceClient,
  command: Command,
  flags: Flags,
  rest: string[],
): Promise<Envelope> {
  const body = command.method === "POST" ? (command.body ? command.body(flags, rest) : {}) : undefined;
  return client.call(command.service, command.action, { method: command.method, body });
}

export async function run(argv: string[]): Promise<number> {
  let parsed: { flags: Flags; words: string[] };
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\n${rootHelp()}`);
      return EXIT_USAGE;
    }
    throw error;
  }

  const { flags, words } = parsed;

  if (!words.length) {
    console.log(rootHelp());
    return flags.help ? EXIT_OK : EXIT_USAGE;
  }

  const command = findCommand(words) ?? genericCommand(words);

  if (!command) {
    if (words[0] === "sip-drip") {
      console.error("sip-drip has no actions of its own — use `pc sip` and `pc drip`.");
      return EXIT_USAGE;
    }
    console.error(`No such command: ${words.join(" ")}\n\n${rootHelp()}`);
    return EXIT_USAGE;
  }

  if (flags.help) {
    console.log(commandHelp(command));
    return EXIT_OK;
  }

  const client = new PiierceClient({ api: flags.api });
  const rest = words.slice(command.words.length);

  let envelope: Envelope;
  try {
    envelope = await request(client, command, flags, rest);
  } catch (error) {
    if (error instanceof UsageError) {
      console.error(`${error.message}\n\nUsage: ${command.usage}`);
      return EXIT_USAGE;
    }
    console.error(error instanceof PiierceError ? error.message : (error as Error).message);
    return EXIT_ERROR;
  }

  if (flags.json) {
    console.log(JSON.stringify(envelope, null, 2));
  } else if (envelope.ok) {
    console.log(format(command, envelope.data));
  } else {
    console.error(envelope.error.message);
  }

  if (envelope.ok) return EXIT_OK;
  return envelope.error.code === "not_connected" ? EXIT_NOT_CONNECTED : EXIT_ERROR;
}
