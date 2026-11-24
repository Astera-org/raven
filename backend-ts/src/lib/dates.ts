import dayjs, { type Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import utc from "dayjs/plugin/utc.js";

// dayjs plugins are global, so they're registered once here; other modules use
// the helpers below rather than dayjs.
dayjs.extend(customParseFormat);
dayjs.extend(utc);

const DB_DATE_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";
const DB_DATE_TIME_WITH_MILLISECONDS_FORMAT = "YYYY-MM-DD HH:mm:ss.SSS";

/**
 * Note: This module contains duplicate functionality that is defined in the frontend.
 * Until we move to a monorepo we will need to have these duplicate definitions.
 */

/**
 * Parses a date string formatted as "YYYY-MM-DD HH:mm:ss[.SSS]" strictly as UTC.
 *
 * @param dateStr - The date string to parse (e.g., "2026-08-18 15:59:55.123")
 * @returns A native JavaScript Date object in UTC
 */
function parseAsUtcDate(
  date: string | number | Date | Dayjs | null | undefined
): Dayjs {
  // dayjs.utc() reads the string directly as a UTC timestamp instead of local
  // time. No format string: with customParseFormat registered above, a format
  // without `.SSS` would drop the milliseconds of datetime(3) columns.
  return dayjs.utc(date);
}

/**
 * Converts a date to a string formatted as `"YYYY/MM/DD"`.
 * @param date - The date to convert
 * @returns A string formatted as `"YYYY/MM/DD"`, or null if the input is null or undefined
 */
export function dateToSlashYYYYMMDD(date: null | undefined): null;
export function dateToSlashYYYYMMDD(
  date: string | number | Date | Dayjs
): string;
export function dateToSlashYYYYMMDD(
  date: string | number | Date | Dayjs | null | undefined
): string | null;
export function dateToSlashYYYYMMDD(
  date: string | number | Date | Dayjs | null | undefined
): string | null {
  if (!date) return null;
  const djs = dayjs(date);
  if (!djs.isValid()) return null;
  return djs.format("YYYY/MM/DD");
}

/**
 * Converts a date to a string formatted as `"YYYY/MM/DD"`.
 * @param date - The date to convert (expected to be in the format "YYYY-MM-DD HH:mm:ss" in UTC)
 * @returns A string formatted as `"YYYY/MM/DD"`, or null if the input is null or undefined
 */
export function dbDateToSlashYYYYMMDD(date: null | undefined): null;
export function dbDateToSlashYYYYMMDD(date: string): string;
export function dbDateToSlashYYYYMMDD(
  date: string | null | undefined
): string | null;
export function dbDateToSlashYYYYMMDD(
  date: string | null | undefined
): string | null {
  if (!date) return null;
  return dateToSlashYYYYMMDD(parseAsUtcDate(date));
}

/**
 * Converts a date to a string formatted as `"YYYY-MM-DD"`.
 * @param date - The date to convert
 * @returns A string formatted as `"YYYY-MM-DD"`, or null if the input is null or undefined
 */
export function dateToDashYYYYMMDD(date: null | undefined): null;
export function dateToDashYYYYMMDD(
  date: string | number | Date | Dayjs
): string;
export function dateToDashYYYYMMDD(
  date: string | number | Date | Dayjs | null | undefined
): string | null;
export function dateToDashYYYYMMDD(
  date: string | number | Date | Dayjs | null | undefined
): string | null {
  if (!date) return null;
  const djs = dayjs(date);
  if (!djs.isValid()) return null;
  return djs.format("YYYY-MM-DD");
}

/**
 * Converts a date to a string formatted as `"YYYY-MM-DD"`.
 * @param date - The date to convert (expected to be in the format "YYYY-MM-DD HH:mm:ss" in UTC)
 * @returns A string formatted as `"YYYY-MM-DD"`, or null if the input is null or undefined
 */
export function dbDateToDashYYYYMMDD(date: null | undefined): null;
export function dbDateToDashYYYYMMDD(date: string): string;
export function dbDateToDashYYYYMMDD(
  date: string | null | undefined
): string | null;
export function dbDateToDashYYYYMMDD(
  date: string | null | undefined
): string | null {
  if (!date) return null;
  return dateToDashYYYYMMDD(parseAsUtcDate(date));
}

/**
 * Converts a date to an ISO 8601 string in UTC format.
 * @param date - The date to convert
 * @returns An ISO 8601 string in UTC format, or null if the input is null or undefined
 */
export function dateToIso8601(date: null | undefined): null;
export function dateToIso8601(date: string | number | Date | Dayjs): string;
export function dateToIso8601(
  date: string | number | Date | Dayjs | null | undefined
): string | null;
export function dateToIso8601(
  date: string | number | Date | Dayjs | null | undefined
): string | null {
  if (!date) return null;
  const djs = dayjs(date);
  if (!djs.isValid()) return null;
  return djs.toISOString();
}

/**
 * Converts a date to an ISO 8601 string in UTC format.
 * @param date - The date to convert (expected to be in the format "YYYY-MM-DD HH:mm:ss" in UTC)
 * @returns An ISO 8601 string in UTC format, or null if the input is null or undefined
 */
export function dbDateToIso8601(date: null | undefined): null;
export function dbDateToIso8601(date: string): string;
export function dbDateToIso8601(date: string | null | undefined): string | null;
export function dbDateToIso8601(
  date: string | null | undefined
): string | null {
  if (!date) return null;
  return dateToIso8601(parseAsUtcDate(date));
}

/**
 * Whether a "YYYY-MM-DD HH:mm:ss[.SSS]" value is a real date and time.
 * Impossible ones such as 2024-02-30 are rejected rather than rolled over.
 */
export function isValidDbDateTime(value: string): boolean {
  const withoutFraction = value.replace(/\.\d{3}$/, "");
  return dayjs.utc(withoutFraction, DB_DATE_TIME_FORMAT, true).isValid();
}

/**
 * Converts an ISO 8601 datetime to the database's UTC
 * "YYYY-MM-DD HH:mm:ss.SSS". A value with an offset is converted to UTC; one
 * without is read as UTC.
 */
export function iso8601ToDbDate(value: string): string {
  return dayjs.utc(value).format(DB_DATE_TIME_WITH_MILLISECONDS_FORMAT);
}

/** Whether UTC datetime `date` is after `other`. */
export function isUtcDateAfter(date: string, other: string): boolean {
  return dayjs.utc(date).isAfter(dayjs.utc(other));
}
