---
description: Get a publication as Markdown, JSON, or a MyST AST instead of a web page.
kernelspec:
  name: python3
  display_name: Python 3
---

# Get a publication in other formats

Every publication on The Stacks is also available in machine-readable formats.
Use these to feed a publication to an AI agent, build your own tools, or render it somewhere else.
The [API reference](https://api.thestacks.org/api/v1/docs) covers everything this page doesn't, including drafts.

## Get Markdown or JSON

Simply add `.md` or `.json` to a publication's URL. For example:

```{list-table}
:header-rows: 1

* - URL
  - What you get
* - [thestacks.org/publications/result-chlamy-spgf](https://thestacks.org/publications/result-chlamy-spgf)
  - The web page.
* - [thestacks.org/publications/result-chlamy-spgf.md](https://thestacks.org/publications/result-chlamy-spgf.md)
  - The publication as Markdown. The title, authors, DOI, license, and version are in YAML frontmatter at the top.
* - [thestacks.org/publications/result-chlamy-spgf.json](https://thestacks.org/publications/result-chlamy-spgf.json)
  - The publication's full record and metadata. Currently, the content source is markdown.
```

These URLs will return the **latest** published version.
To get an older version, put its number before the suffix, like [thestacks.org/publications/result-chlamy-spgf/v1.md](https://thestacks.org/publications/result-chlamy-spgf/v1.md).

Here's an example in Python that gets a publication as Markdown and as JSON:

```{code-cell} python
import requests

slug = "result-chlamy-spgf"
markdown = requests.get(f"https://thestacks.org/publications/{slug}.md").text
print(markdown.split("\n---\n")[0])  # the YAML frontmatter

pub = requests.get(f"https://thestacks.org/publications/{slug}.json").json()["publication"]
print(pub["title"], pub["doi"])
```

You can also ask for a format with the `Accept` header instead of a suffix:

```bash
curl -H "Accept: text/markdown" https://thestacks.org/publications/result-chlamy-spgf
```

The same request in Python:

```{code-cell} python
import requests

response = requests.get(
    "https://thestacks.org/publications/result-chlamy-spgf",
    headers={"Accept": "text/markdown"},
)
print(response.headers["Content-Type"])
```

## Get the MyST AST

Publications written in [MyST](https://mystmd.org) are also available as a MyST AST, the parsed document tree that thestacks.org renders.[^gdocs]

[^gdocs]: Publications in the Google Docs format don't have one, so the API will return a `406` error in this case. To check which type of content you have, look at `content.format` in the JSON. For MyST publications it will be called `myst`.

To get the AST, ask the API for a version of the publication, with the AST type in the `Accept` header.
The latest version number is `version_number` in the JSON.
Here's an example that gets the AST of a MyST publication and prints its first few section headings:

```{code-cell} python
import requests

def headings(node):
    if node["type"] == "heading":
        yield "".join(child.get("value", "") for child in node["children"])
    for child in node.get("children", []):
        yield from headings(child)

slug = "perspective-computational-fibers-white-paper"
pub = requests.get(f"https://thestacks.org/publications/{slug}.json").json()["publication"]

if pub["content"]["format"] == "myst":
    url = f"https://api.thestacks.org/api/v1/publications/p/{slug}/versions/v{pub['version_number']}"
    response = requests.get(url, headers={"Accept": "application/vnd.thestacks.mdast+json"})
    abstract, body = response.json()["tree"]["children"]
    print("\n".join(list(headings(body))[:5]))
```

The response has these fields:

- `tree`: the MyST AST. Its root has two blocks, the abstract and the body.
- `citations.order`: reference URLs in the order they're cited. A `cite` node's `enumerator` is its position in this list, counting from 1.
- `frontmatter.math`: LaTeX macros the document's math uses. It's missing when there are none.

## Find publications

- Every publication is listed in `thestacks.org/sitemaps/sitemap-publications.xml`.
- Each organization has an [RSS feed](#api:rss-feed) of its publications.

Here's an example that reads the sitemap and downloads the first three publications as Markdown.

```{code-cell} python
import requests
import xml.etree.ElementTree as ET

sitemap = requests.get("https://thestacks.org/sitemaps/sitemap-publications.xml")
ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
urls = [loc.text for loc in ET.fromstring(sitemap.content).iterfind(".//sm:loc", ns)]

for url in urls[:3]:
    markdown = requests.get(f"{url}.md").text
    print(url, len(markdown), "characters")
```

(api:rss-feed)=
## Subscribe to an organization's RSS feed

Each organization has an RSS feed of its publications that you can add to any feed reader.
Access each feed at:

```
api.thestacks.org/api/publications/rss/<organization>`
```

Where `<organization>` is the organization's name with hyphens for spaces.
For example, [Arcadia Science's feed](https://api.thestacks.org/api/publications/rss/arcadia-science) is the following:

```
api.thestacks.org/api/publications/rss/arcadia-science
```

To learn how feeds work, see [organizations in the Raven docs](xref:raven/admins/organizations).
