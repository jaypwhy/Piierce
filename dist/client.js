/** The working site — the default target. */
export const DEFAULT_API = "https://d6fba97f0124d530d64629080c843c5e-dev.cto.site";
/** What the public sees once the site is published. */
export const LIVE_API = "https://d6fba97f0124d530d64629080c843c5e.cto.site";
/** A service answered `ok: false`, or the request never reached it. */
export class PiierceError extends Error {
    code;
    service;
    action;
    status;
    constructor(message, details) {
        super(message);
        this.name = "PiierceError";
        this.code = details.code;
        this.service = details.service;
        this.action = details.action;
        this.status = details.status;
    }
    /** A service that does not exist yet answers this — not a bug in the caller. */
    get isNotConnected() {
        return this.code === "not_connected";
    }
}
/**
 * The few actions whose URL does not follow /api/v1/<service>/<action>. `art
 * list` lives at /api/v1/art/pieces, because the route is named for what it
 * returns. Everything else — including services added later — follows the rule.
 */
const ROUTES = {
    "art/list": "/api/v1/art/pieces",
    // A reserved service answers at its base — there is no action to name.
    "home-key/status": "/api/v1/home-key",
};
/** The path a service/action lands on, so the client and the CLI agree. */
export function routePath(service, action) {
    if (service === "registry")
        return "/api/v1/services";
    return ROUTES[`${service}/${action}`] ?? `/api/v1/${service}/${action}`;
}
export class PiierceClient {
    api;
    timeoutMs;
    headers;
    fetchImpl;
    constructor(options = {}) {
        const opts = typeof options === "string" ? { api: options } : options;
        this.api = (opts.api ?? DEFAULT_API).replace(/\/+$/, "");
        this.timeoutMs = opts.timeoutMs ?? 20_000;
        this.headers = { accept: "application/json", ...opts.headers };
        this.fetchImpl = opts.fetch ?? fetch;
    }
    /** The URL a service/action lands on, so callers can log or curl it. */
    url(path) {
        return `${this.api}${path.startsWith("/") ? path : `/${path}`}`;
    }
    /**
     * One call, one envelope — never throws on a service error. Use this when the
     * error itself matters (`not_connected`, `cooldown`) or when you want the raw
     * envelope for `--json`.
     */
    async call(service, action, options = {}) {
        const method = options.method ?? (options.body ? "POST" : "GET");
        const path = routePath(service, action);
        const init = {
            method,
            headers: { ...this.headers },
            signal: options.signal ?? AbortSignal.timeout(this.timeoutMs),
        };
        if (method === "POST") {
            init.headers["content-type"] = "application/json";
            init.body = JSON.stringify(options.body ?? {});
        }
        let response;
        try {
            response = await this.fetchImpl(this.url(path), init);
        }
        catch (error) {
            throw new PiierceError(`Could not reach ${this.api} — ${error instanceof Error ? error.message : "request failed"}`, { code: "network", service, action, status: 0 });
        }
        const text = await response.text();
        let parsed;
        try {
            parsed = JSON.parse(text);
        }
        catch {
            throw new PiierceError(`${method} ${path} answered ${response.status}, not an envelope.`, {
                code: "failed",
                service,
                action,
                status: response.status,
            });
        }
        const envelope = parsed;
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
    async data(service, action, options = {}) {
        const envelope = await this.call(service, action, options);
        if (envelope.ok)
            return envelope.data;
        throw new PiierceError(envelope.error.message, {
            code: envelope.error.code,
            service: envelope.service,
            action: envelope.action,
            status: 0,
        });
    }
    // ---- registry -----------------------------------------------------------
    /** Every service in the ecosystem, its status and its actions. */
    services() {
        return this.data("registry", "services", { method: "GET" });
    }
    // ---- upayu --------------------------------------------------------------
    balance() {
        return this.data("upayu", "balance", { method: "GET" });
    }
    /** Points into the account. The default and the note are the site's call. */
    sip(input = {}) {
        return this.data("upayu", "sip", { body: input });
    }
    /** The base-income drip — the server decides the amount and the cooldown. */
    drip() {
        return this.data("upayu", "drip", { body: {} });
    }
    /** Convert points at the Pi Algo. The dollars come back in the envelope. */
    convert(points) {
        return this.data("upayu", "convert", { body: { points } });
    }
    /** The pi ladder as the API states it: `formula` plus the rungs. */
    ladder() {
        return this.data("upayu", "ladder", { method: "GET" });
    }
    // ---- art ----------------------------------------------------------------
    artList() {
        return this.data("art", "list", { method: "GET" });
    }
    artSave(input) {
        return this.data("art", "save", { body: input });
    }
}
/** `new PiierceClient()` with the working site as the target. */
export function createClient(options = {}) {
    return new PiierceClient(options);
}
//# sourceMappingURL=client.js.map