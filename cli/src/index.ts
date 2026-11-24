#!/usr/bin/env node
import { runCli } from "./program.js";
import { createDefaultRuntime } from "./runtime.js";

process.exitCode = await runCli(process.argv.slice(2), createDefaultRuntime());
