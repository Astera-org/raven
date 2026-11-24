import { apiV1 } from "./hono-client";

export async function uploadOrgAvatar(slug: string, file: File): Promise<void> {
  const res = await apiV1.orgs[":idOrSlug"].avatar.$put({
    param: { idOrSlug: slug },
    form: { avatar: file },
  });
  if (res.ok) return;
  if (res.status < 500) {
    const data = await res.json();
    throw new Error(
      Object.values(data.errors)[0]?.message ?? "Unexpected error response"
    );
  }
  throw new Error("Connection or server error");
}

/**
 * Turn any asset path returned by the API into an absolute URL so that the
 * browser does not treat it as relative to the current route (e.g. /publications/…)
 * which would lead to broken requests such as "…/publications/api/v1/files/…".
 */
export function assetUrl(path: string | null | undefined): string | null {
  path = path?.trim();
  if (!path) return null;
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }

  // The API stores uploaded avatars as paths relative to its files root.
  if (path.startsWith("avatars/")) return `/api/v1/files/${path}`;

  return path.startsWith("/") ? path : `/${path}`;
}
