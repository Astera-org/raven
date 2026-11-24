// A myst-listing collector: `:source: stacks` turns publication slugs (one per line in the
// directive body) into items, using The Stacks API at build time.
// See https://github.com/myst-contrib/myst-listing/blob/main/docs/develop/extending.md
const API = "https://api.thestacks.org/api/publications/";
const SITE = "https://thestacks.org/publications/";

// ponytail: in-memory cache, so `myst start` fetches each publication once per session.
const cache = new Map();

// Titles and subtitles are MyST; cards show plain text.
const plain = (s) => (s ?? "").replace(/\\:/g, ":").replace(/[*_]/g, "").trim();

async function fetchPublication(slug) {
  const res = await fetch(API + encodeURIComponent(slug));
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for "${slug}"`);
  const { publication: p } = await res.json();
  return {
    title: plain(p.title),
    url: SITE + encodeURIComponent(slug),
    description: plain(p.subtitle || p.abstract),
    // The first image in the body. Embeds and videos aren't images, so those pubs get no thumbnail.
    thumbnail: p.body?.match(/image\{[^}]*src=["']([^"']+)["']/)?.[1],
  };
}

const collectStacks = {
  name: "listing-collect-stacks",
  stage: "document",
  plugin: () => async (tree, vfile) => {
    const placeholders = [];
    (function walk(node) {
      if (node.type === "listingPlaceholder" && node.source === "stacks") placeholders.push(node);
      node.children?.forEach(walk);
    })(tree);
    for (const node of placeholders) {
      const slugs = (node.body ?? "").split(/\s+/).filter(Boolean);
      const results = await Promise.allSettled(
        slugs.map((slug) => {
          if (!cache.has(slug)) {
            // Forget failures so the next rebuild retries instead of reusing the rejection.
            const pending = fetchPublication(slug).catch((err) => {
              cache.delete(slug);
              throw err;
            });
            cache.set(slug, pending);
          }
          return cache.get(slug);
        }),
      );
      const failures = results.filter((r) => r.status === "rejected").map((r) => r.reason.message);
      if (failures.length === slugs.length && slugs.length > 0) {
        node.error = `Couldn't fetch publications from The Stacks: ${failures.join("; ")}`;
        continue;
      }
      // Skip the publications that failed so the rest still show.
      for (const message of failures) {
        vfile.message(`Couldn't fetch a publication from The Stacks: ${message}`, node);
      }
      node.items = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
      node.ordered = true; // keep the order written in the page
    }
  },
};

export default { name: "The Stacks publications", transforms: [collectStacks] };
