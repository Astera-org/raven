import { useEffect, useState } from "react";
import { safe } from "~/api/api-error";
import { apiV1 } from "~/api/hono-client";

export function useSlugAvailability(
  slug: string,
  originalSlug?: string
): string | null {
  const [slugWarning, setSlugWarning] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        if (!slug || slug === originalSlug) {
          setSlugWarning(null);
          return;
        }
        const result = await safe(
          apiV1.admin["org-slug-availability"].$get(
            { query: { slug } },
            { init: { signal: controller.signal } }
          )
        );
        if (controller.signal.aborted) return;
        setSlugWarning(
          result.ok && !result.data.available
            ? "This slug is already taken and will be auto-suffixed"
            : null
        );
      },
      slug ? 400 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [slug, originalSlug]);

  return slugWarning;
}
