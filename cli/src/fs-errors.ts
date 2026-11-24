export function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function isDirectory(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "EISDIR";
}
