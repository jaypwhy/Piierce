/**
 * The Piierce client — one HTTP client for the whole /api/v1 surface.
 *
 * Every call goes to `<api>/api/v1/<service>/<action>` and comes back as one
 * envelope, so this file never needs to know a service's numbers. Values that
 * change — the Pi Algo formula, the drip cooldown, the ladder rungs — are read
 * out of the response, never restated here.
 */
import type { ArtSavedData, BalanceData, ChangeData, Envelope, ErrorCode, LadderData, PiecesData, RegistryData } from "./envelope.js";
/** The working site — the default target. */
export declare const DEFAULT_API = "https://d6fba97f0124d530d64629080c843c5e-dev.cto.site";
/** What the public sees once the site is published. */
export declare const LIVE_API = "https://d6fba97f0124d530d64629080c843c5e.cto.site";
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
export declare class PiierceError extends Error {
    readonly code: ErrorCode | "network";
    readonly service: string;
    readonly action: string;
    readonly status: number;
    constructor(message: string, details: {
        code: ErrorCode | "network";
        service: string;
        action: string;
        status: number;
    });
    /** A service that does not exist yet answers this — not a bug in the caller. */
    get isNotConnected(): boolean;
}
export type CallOptions = {
    method?: "GET" | "POST";
    /** JSON body for a POST. */
    body?: Record<string, unknown>;
    signal?: AbortSignal;
};
/** The path a service/action lands on, so the client and the CLI agree. */
export declare function routePath(service: string, action: string): string;
export declare class PiierceClient {
    readonly api: string;
    readonly timeoutMs: number;
    private readonly headers;
    private readonly fetchImpl;
    constructor(options?: ClientOptions | string);
    /** The URL a service/action lands on, so callers can log or curl it. */
    url(path: string): string;
    /**
     * One call, one envelope — never throws on a service error. Use this when the
     * error itself matters (`not_connected`, `cooldown`) or when you want the raw
     * envelope for `--json`.
     */
    call<T = unknown>(service: string, action: string, options?: CallOptions): Promise<Envelope<T>>;
    /** One call, unwrapped: returns `data` or throws a PiierceError. */
    data<T = unknown>(service: string, action: string, options?: CallOptions): Promise<T>;
    /** Every service in the ecosystem, its status and its actions. */
    services(): Promise<RegistryData>;
    balance(): Promise<BalanceData>;
    /** Points into the account. The default and the note are the site's call. */
    sip(input?: {
        points?: number;
        note?: string;
    }): Promise<ChangeData>;
    /** The base-income drip — the server decides the amount and the cooldown. */
    drip(): Promise<ChangeData>;
    /** Convert points at the Pi Algo. The dollars come back in the envelope. */
    convert(points: number): Promise<ChangeData>;
    /** The pi ladder as the API states it: `formula` plus the rungs. */
    ladder(): Promise<LadderData>;
    artList(): Promise<PiecesData>;
    artSave(input: {
        name: string;
        media: string;
        thumb?: string;
        points?: number;
    }): Promise<ArtSavedData>;
}
/** `new PiierceClient()` with the working site as the target. */
export declare function createClient(options?: ClientOptions | string): PiierceClient;
//# sourceMappingURL=client.d.ts.map