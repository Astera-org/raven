import { isAbsolute, relative } from "node:path";

/** Relative to the working directory when inside it, otherwise absolute. */
export function displayPath(path: string): string {
  const fromCwd = relative(process.cwd(), path);
  return fromCwd && !fromCwd.startsWith("..") && !isAbsolute(fromCwd)
    ? fromCwd
    : path;
}
