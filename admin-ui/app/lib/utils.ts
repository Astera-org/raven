import { clsx, type ClassValue } from "clsx";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import utc from "dayjs/plugin/utc";
import { extendTailwindMerge } from "tailwind-merge";
import { ApiError, firstErrorMessage } from "~/api/api-error";

dayjs.extend(relativeTime);
dayjs.extend(utc);

function isCustomTextSize(cn: string) {
  return ["headline", "body", "caption"].some((val) => cn.startsWith(val));
}

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [isCustomTextSize],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert a string to sentence case: first letter uppercase, the rest
 * lowercase (e.g. "not actively updating" -> "Not actively updating").
 */
export function toSentenceCase(str: string) {
  return capitalize(str.toLowerCase());
}

export function formatDate(
  date: string | Date,
  format: string = "MMM D, YYYY HH:mm A"
) {
  return dayjs(date).format(format);
}

export function relativeTimeFromNow(date: string) {
  return capitalize(dayjs(date).fromNow());
}

export function formatUtcDateTime(date: string): string {
  const d = dayjs.utc(date);
  return `${d.format("MMM D, YYYY")} · ${d.format("HH:mm")} UTC`;
}

export function isCurrentYear(date: string): boolean {
  return dayjs(date).isSame(dayjs(), "year");
}

/**
 * From a list of publication tags, return the shortest one that isn't "iced".
 */
export function getShortestPublicationTag(tags: string[]): string | undefined {
  const filteredTags = tags.filter((tag) => tag.toLowerCase() !== "iced");
  if (filteredTags.length === 0) {
    return;
  }
  return filteredTags.reduce((shortest, current) =>
    shortest.length < current.length ? shortest : current
  );
}

/**
 * Download a file from the given URL and save it to the user's local machine
 * with the given filename.
 *
 * Notes:
 * - This roundabout method is required to set custom filenames for URLs that
 *   are cross-origin requests.
 * - If the `url` is a cross-origin request, CORS must be disabled for the current
 *   origin on the server.
 *
 * @param src - The URL of the file to download.
 * @param filename - The filename to save the file as.
 */
export function formatState(state: string): string {
  return state
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Pretty-prints a value as JSON, two spaces per level. */
export function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return formatDate(value, "YYYY-MM-DD");
}

/** Inverse of `toDateInputValue`: a date input's `YYYY-MM-DD` as midnight in
 * the browser's time zone, as an ISO timestamp. */
export function fromDateInputValue(
  value: string | null | undefined
): string | null {
  if (!value) return null;
  return dayjs(value).toISOString();
}

export function paginationInfo(page: number, perPage: number, total: number) {
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const rangeStart = Math.min((page - 1) * perPage + 1, total);
  const rangeEnd = Math.min(page * perPage, total);
  return { totalPages, rangeStart, rangeEnd };
}

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return firstErrorMessage(err, fallback);
  return fallback;
}

export async function downloadFromUrl(src: string, filename: string) {
  const response = await fetch(src, {
    mode: "cors",
    cache: "no-cache",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch: ${response.status} ${response.statusText}`
    );
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();

  // Clean up the link and the blob URL.
  link.remove();
  URL.revokeObjectURL(url);
}
