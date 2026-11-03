#!/usr/bin/env node
/**
 * The `pc` bin — a thin wrapper so `npx pc`, `bunx pc` or a global install all
 * land on the same compiled CLI.
 */
import { run } from "../dist/cli.js";

process.exit(await run(process.argv.slice(2)));
