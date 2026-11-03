/**
 * The universal envelope, as /api/v1 answers it.
 *
 *   { ok: true,  service: "upayu", action: "sip", data: { ... } }
 *   { ok: false, service: "ruhbi", action: "ledger", error: { code, message } }
 *
 * This file only mirrors the shape the site already sends. It does not restate
 * any service's numbers — the Pi Algo, the cooldown and the ladder all arrive in
 * `data`, so a client reads them instead of hardcoding them.
 */
export type ServiceStatus = "live" | "planned";
export type ErrorCode = "not_connected" | "bad_request" | "not_found" | "cooldown" | "failed";
export type Envelope<T = unknown> = {
    ok: true;
    service: string;
    action: string;
    data: T;
} | {
    ok: false;
    service: string;
    action: string;
    error: {
        code: ErrorCode;
        message: string;
    };
};
/** `GET /api/v1/services` */
export type ServiceInfo = {
    name: string;
    status: ServiceStatus;
    actions: string[];
    blurb: string;
    base: string;
};
export type RegistryData = {
    version: string;
    count: number;
    live: number;
    planned: number;
    services: ServiceInfo[];
};
/** `upayu balance`, and the shape every upayu change answers with. */
export type LedgerEntry = {
    at: string;
    kind: string;
    points: number;
    note?: string;
    [key: string]: unknown;
};
export type BalanceData = {
    points: number;
    dollars: number;
    /** Points valued at the Pi Algo — the formula is in `conversion.formula`. */
    dollarValue: number;
    totalValue: number;
    lifetimePoints: number;
    pieces: number;
    conversion: {
        minimumPoints: number;
        formula: string;
    };
    drip: {
        points: number;
        cooldownMs: number;
        remainingMs: number;
        ready: boolean;
    };
    recent: LedgerEntry[];
};
/** What sip, drip and convert answer with: the balance plus what changed. */
export type ChangeData = BalanceData & {
    awarded?: number;
    message?: string;
};
/** `upayu ladder` — the rungs come from the API, formula included. */
export type LadderData = {
    formula: string;
    minimumPoints: number;
    rungs: {
        points: number;
        dollars: number;
    }[];
};
/** `art list` — a piece without its thumbnail. */
export type PieceSummary = {
    name: string;
    media: string;
    points: number;
    at: string;
    hasThumb: boolean;
    [key: string]: unknown;
};
export type PiecesData = {
    count: number;
    pieces: PieceSummary[];
};
export type ArtSavedData = {
    piece: PieceSummary | null;
    awarded?: number;
    message?: string;
    points: number;
    dollarValue: number;
};
//# sourceMappingURL=envelope.d.ts.map