import {
  execFileSync,
  type ExecFileSyncOptionsWithStringEncoding,
} from "node:child_process";
import { readFileSync } from "node:fs";
import { hostname as osHostname } from "node:os";

// Short timeout so a missing or hung binary never stalls the caller.
// stderr is ignored so messages like "HostName: not set" don't leak to the console.
const EXEC_OPTS: ExecFileSyncOptionsWithStringEncoding = {
  encoding: "utf8",
  timeout: 1000,
  windowsHide: true,
  stdio: ["ignore", "pipe", "ignore"],
};

const clean = (value: unknown): string | null => {
  const s = typeof value === "string" ? value.trim() : "";
  return s || null;
};

function runSync(cmd: string, args: string[]): string | null {
  try {
    return clean(execFileSync(cmd, args, EXEC_OPTS));
  } catch {
    return null;
  }
}

// /etc/machine-info is a simple KEY=value file; the value may be quoted.
function parsePrettyHostname(text: string): string | null {
  const match = text.match(/^PRETTY_HOSTNAME=(.*)$/m);
  if (!match) return null;
  return clean(match[1]?.replace(/^(["'])(.*)\1$/, "$2"));
}

/**
 * Every name this machine is known by, de-duplicated: the user-facing name
 * first (macOS ComputerName, Linux pretty hostname), then the network
 * hostname. Blocks on short subprocess calls.
 */
export function getHostnames(): string[] {
  const hostnames = new Set<string>();
  if (process.platform === "darwin") {
    const computerName = runSync("scutil", ["--get", "ComputerName"]);
    if (computerName) hostnames.add(computerName);

    const localHostName = runSync("scutil", ["--get", "LocalHostName"]);
    if (localHostName) hostnames.add(localHostName);
  }

  if (process.platform === "linux") {
    const pretty = runSync("hostnamectl", ["--pretty"]);
    if (pretty) hostnames.add(pretty);
    try {
      const fromFile = parsePrettyHostname(
        readFileSync("/etc/machine-info", "utf8")
      );
      if (fromFile) hostnames.add(fromFile);
    } catch {
      // fall through
    }
  }

  hostnames.add(osHostname());

  return Array.from(hostnames);
}
