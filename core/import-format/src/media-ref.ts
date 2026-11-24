export const MEDIA_REF_PREFIX = "raven-media://";

const MEDIA_REF_ID = "[A-Za-z0-9._-]+";
const MEDIA_REF_PATTERN = `${MEDIA_REF_PREFIX}${MEDIA_REF_ID}`;

export type MediaRef = `${typeof MEDIA_REF_PREFIX}${string}`;

/**
 * Builds the placeholder an importer puts in the body wherever media is used,
 * e.g. `:::image{src=raven-media://${ulid}}`. `id` may only contain letters,
 * digits, `.`, `_` and `-` so a ref can't run into the text around it.
 */
export function mediaRef(id: string): MediaRef {
  const ref = `${MEDIA_REF_PREFIX}${id}` as const;
  if (!isMediaRef(ref)) {
    throw new Error(`Invalid media ref id "${id}"`);
  }
  return ref;
}

export function isMediaRef(value: string): value is MediaRef {
  return new RegExp(`^${MEDIA_REF_PATTERN}$`).test(value);
}

/** True if `text` still holds a media ref, e.g. one whose upload failed. */
export function containsMediaRef(text: string): boolean {
  return new RegExp(MEDIA_REF_PATTERN).test(text);
}

/**
 * Replaces each whole media ref in `text`. Refs `replace` returns undefined
 * for are left in place.
 */
export function replaceMediaRefs(
  text: string,
  replace: (ref: MediaRef) => string | undefined
): string {
  return text.replace(
    new RegExp(MEDIA_REF_PATTERN, "g"),
    (ref) => replace(ref as MediaRef) ?? ref
  );
}
