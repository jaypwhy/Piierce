/**
 * Piierce — the shared Pierce Collabs client for the /api/v1 surface.
 *
 *   import { createClient } from "piierce";
 *   const client = createClient();            // the working site
 *   const balance = await client.balance();   // points, dollars, the Pi Algo value
 */
export {
  DEFAULT_API,
  LIVE_API,
  PiierceClient,
  PiierceError,
  createClient,
  type CallOptions,
  type ClientOptions,
} from "./client.js";

export type {
  ArtSavedData,
  BalanceData,
  ChangeData,
  Envelope,
  ErrorCode,
  LadderData,
  LedgerEntry,
  PieceSummary,
  PiecesData,
  RegistryData,
  ServiceInfo,
  ServiceStatus,
} from "./envelope.js";

export { run } from "./cli.js";
