import { isAbsolute, relative, sep } from "node:path";

/** Whether `path` is strictly below `root`; `root` itself isn't inside. */
export function isInside(root: string, path: string): boolean {
  const fromRoot = relative(root, path);
  return (
    fromRoot !== "" &&
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

/** `path` from `root`, with `/` separators on every platform. */
export function relativePath(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}
