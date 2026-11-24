import { ApiError } from "../api/api-error";

/**
 * Doesn't really do anything but throw whatever you input, but it feels better
 * than not catching your request at all.
 */
export function rethrowForRoute(e: unknown): never {
  if (e instanceof ApiError) {
    throw e;
  }
  throw e;
}
