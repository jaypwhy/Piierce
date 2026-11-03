/**
 * Piierce — the shared Pierce Collabs client for the /api/v1 surface.
 *
 *   import { createClient } from "piierce";
 *   const client = createClient();            // the working site
 *   const balance = await client.balance();   // points, dollars, the Pi Algo value
 */
export { DEFAULT_API, LIVE_API, PiierceClient, PiierceError, createClient, } from "./client.js";
export { run } from "./cli.js";
//# sourceMappingURL=index.js.map