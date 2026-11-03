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
export {};
//# sourceMappingURL=envelope.js.map