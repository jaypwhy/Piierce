/**
 * The Piierce client — one HTTP client for the whole /api/v1 surface.
 *
 * Every call goes to `<api>/api/v1/<service>/<action>` and comes back as one
 * envelope, so this file never needs to know a service's numbers. Values that
 * change — the Pi Algo formula, the drip cooldown, the ladder rungs — are read
 * out of the response, never restated here.
 */
import type {
  ArtSavedData,
  BalanceData,
  ChangeData,
  Envelope,
  ErrorCode,
  LadderData,
  PiecesData,
  RegistryData,
} from "./envelope.js";

/** The working site — the default target. */
export const DEFAULT_API = "https://d6fba97f0124d530d64629080c843c5e-dev.cto.site";

/** What the public sees once the site is published. */
export const LIVE_API = "https://d6fba97f0124d530d64629080c843c5e.cto.site";

export type ClientOptions = {
  /** Base URL of an instance serving /api/v1. Defaults to DEFAULT_API. */
  api?: string;
  /** Per-request timeout in milliseconds. Defaults to 20s. */
  timeoutMs?: number;
  /** Extra headers, e.g. an Authorization token a future service asks for. */
  headers?: Record<string, string>;
  /** Inject a fetch (tests, another runtime). Defaults to global fetch. */
  fetch?: typeof fetch;
};

/** A service answered `ok: false`, or the request never reached it. */
export class PiierceError extends Error {
  readonly code: ErrorCode | "network";
  readonly service: string;
  readonly action: string;
  readonly status: number;

  constructor(
    message: string,
    details: { code: ErrorCode | "network"; service: string; action: string; status: number },
  ) {
    super(message);
    this.name = "PiierceError";
    this.code = details.code;
    this.service = details.service;
    this.action = details.action;
    this.status = details.status;
  }

  /** A service that does not exist yet answers this — not a bug in the caller. */
  get isNotConnected(): boolean {
    return this.code === "not_connected";
  }
}

export type CallOptions = {
  method?: "GET" | "POST";
  /** JSON body for a POST. */
  body?: Record<string, unknown>;
  signal?: AbortSignal;
};

/**
 * The few actions whose URL does not follow /api/v1/<service>/<action>. `art
 * list` lives at /api/v1/art/pieces, because the route is named for what it
 * returns. Everything else — including services added later — follows the rule.
 */
const ROUTES: Record<string, string> = {
  "art/list": "/api/v1/art/pieces",
  // A reserved service answers at its base — there is no action to name.
  "home-key/status": "/api/v1/home-key",
};

/** The path a service/action lands on, so the client and the CLI agree. */
export function routePath(service: string, action: string): string {
  if (service === "registry") return "/api/v1/services";
  return ROUTES[`${service}/${action}`] ?? `/api/v1/${service}/${action}`;
}

export class PiierceClient {
  readonly api: string;
  readonly timeoutMs: number;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ClientOptions | string = {}) {
    const opts: ClientOptions = typeof options === "string" ? { api: options } : options;
    this.api = (opts.api ?? DEFAULT_API).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.headers = { accept: "application/json", ...opts.headers };
    this.fetchImpl = opts.fetch ?? fetch;
  }

  /** The URL a service/action lands on, so callers can log or curl it. */
  url(path: string): string {
    return `${this.api}${path.startsWith("/") ? path : `/${path}`}`;
  }

  /**
   * One call, one envelope — never throws on a service error. Use this when the
   * error itself matters (`not_connected`, `cooldown`) or when you want the raw
   * envelope for `--json`.
   */
  async call<T = unknown>(
    service: string,
    action: string,
    options: CallOptions = {},
  ): Promise<Envelope<T>> {
    const method = options.method ?? (options.body ? "POST" : "GET");
    const path = routePath(service, action);
    const init: RequestInit = {
      method,
      headers: { ...this.headers },
      signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
    };
    if (method === "POST") {
      (init.headers as Record<string, string>)["content-type"] = "application/json";
      init.body = JSON.stringify(options.body ?? {});
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.url(path), init);
    } catch (error) {
      throw new PiierceError(
        `Could not reach ${this.api} — ${error instanceof Error ? error.message : "request failed"}`,
        { code: "network", service, action, status: 0 },
      );
    }

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new PiierceError(`${method} ${path} answered ${response.status}, not an envelope.`, {
        code: "failed",
        service,
        action,
        status: response.status,
      });
    }

    const envelope = parsed as Envelope<T>;
    if (typeof envelope?.ok !== "boolean") {
      throw new PiierceError(`${method} ${path} answered ${response.status}, not an envelope.`, {
        code: "failed",
        service,
        action,
        status: response.status,
      });
    }
    return envelope;
  }

  /** One call, unwrapped: returns `data` or throws a PiierceError. */
  async data<T = unknown>(
    service: string,
    action: string,
    options: CallOptions = {},
  ): Promise<T> {
    const envelope = await this.call<T>(service, action, options);
    if (envelope.ok) return envelope.data;
    throw new PiierceError(envelope.error.message, {
      code: envelope.error.code,
      service: envelope.service,
      action: envelope.action,
      status: 0,
    });
  }

  // ---- registry -----------------------------------------------------------

  /** Every service in the ecosystem, its status and its actions. */
  services(): Promise<RegistryData> {
    return this.data<RegistryData>("registry", "services", { method: "GET" });
  }

  // ---- upayu --------------------------------------------------------------

  balance(): Promise<BalanceData> {
    return this.data<BalanceData>("upayu", "balance", { method: "GET" });
  }

  /** Points into the account. The default and the note are the site's call. */
  sip(input: { points?: number; note?: string } = {}): Promise<ChangeData> {
    return this.data<ChangeData>("upayu", "sip", { body: input });
  }

  /** The base-income drip — the server decides the amount and the cooldown. */
  drip(): Promise<ChangeData> {
    return this.data<ChangeData>("upayu", "drip", { body: {} });
  }

  /** Convert points at the Pi Algo. The dollars come back in the envelope. */
  convert(points: number): Promise<ChangeData> {
    return this.data<ChangeData>("upayu", "convert", { body: { points } });
  }

  /** The pi ladder as the API states it: `formula` plus the rungs. */
  ladder(): Promise<LadderData> {
    return this.data<LadderData>("upayu", "ladder", { method: "GET" });
  }

  // ---- art ----------------------------------------------------------------

  artList(): Promise<PiecesData> {
    return this.data<PiecesData>("art", "list", { method: "GET" });
  }

  artSave(input: {
    name: string;
    media: string;
    thumb?: string;
    points?: number;
  }): Promise<ArtSavedData> {
    return this.data<ArtSavedData>("art", "save", { body: input });
  }
}

/** `new PiierceClient()` with the working site as the target. */
export function createClient(options: ClientOptions | string = {}): PiierceClient {
  return new PiierceClient(options);
}
