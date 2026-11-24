import { spawn } from "node:child_process";
import { constants } from "node:os";

// pnpm forwards SIGINT to its child, and Ctrl-C also delivers SIGINT to the
// whole terminal process group. `tsx watch` treats a second SIGINT during
// shutdown as a request to SIGKILL the server, so it must only see one.
// This launcher sits between pnpm and tsx, swallowing pnpm's forwarded SIGINT
// (tsx gets Ctrl-C directly from the terminal) and relaying SIGTERM, which
// the terminal never sends.
const child = spawn(
  "tsx",
  ["watch", "--conditions=@raven/backend-source", "src/index.ts"],
  { stdio: "inherit" }
);

process.on("SIGINT", () => {});
process.on("SIGTERM", () => child.kill("SIGTERM"));

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(128 + constants.signals[signal]);
  }
  process.exit(code ?? 1);
});
