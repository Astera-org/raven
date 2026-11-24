import {
  buildBibtexUrlToFormattedTextMap,
  extractRefUrls,
} from "#src/lib/references.js";
import { describe, expect, it } from "vitest";

describe("extractRefUrls", () => {
  it.each([
    ["[](https://doi.org/10.1234/test)", ["https://doi.org/10.1234/test"]],
    [
      "[](https://doi.org/10.1016/0168-9452(87)90107-5)",
      ["https://doi.org/10.1016/0168-9452(87)90107-5"],
    ],
    [
      "([](https://doi.org/10.1016/0168-9452(87)90107-5))",
      ["https://doi.org/10.1016/0168-9452(87)90107-5"],
    ],
    ["[](https://example.com/some/path)", ["https://example.com/some/path"]],
    [
      "[](https://en.wikipedia.org/wiki/Fish_(animal))\n[](https://en.wikipedia.org/wiki/fish_(animal))",
      [
        "https://en.wikipedia.org/wiki/Fish_(animal)",
        "https://en.wikipedia.org/wiki/fish_(animal)",
      ],
    ],
    ["![](https://doi.org/10.1234/test)", []],
    [
      "[](https://doi.org/10.1234/a)\n[](https://doi.org/10.5678/b)",
      ["https://doi.org/10.1234/a", "https://doi.org/10.5678/b"],
    ],
    [
      "[](https://doi.org/10.1234/a)\n[](https://doi.org/10.1234/a)",
      ["https://doi.org/10.1234/a"],
    ],
    [
      "[](https://doi.org/10.1234/ABC)\n[](https://doi.org/10.1234/abc)",
      ["https://doi.org/10.1234/abc"],
    ],
    [
      String.raw`[](https://doi.org/10.1016/0168-9452\(87\)90107-5)`,
      ["https://doi.org/10.1016/0168-9452(87)90107-5"],
    ],
    ["[  ](https://doi.org/10.1234/test)", ["https://doi.org/10.1234/test"]],
    ["", []],
    ["just some text with no links", []],
    ["[click here](https://doi.org/10.1234/test)", []],
    [
      "[](https://doi.org/10.1002/(SICI)1097-0258(19980730)17:14<1623::AID-SIM871>3.0.CO;2-S)",
      [
        "https://doi.org/10.1002/(sici)1097-0258(19980730)17:14<1623::aid-sim871>3.0.co;2-s",
      ],
    ],
    [
      '<a href="https://doi.org/10.1234/test"></a>',
      ["https://doi.org/10.1234/test"],
    ],
    [
      '<a href="https://doi.org/10.1234/test" />',
      ["https://doi.org/10.1234/test"],
    ],
    [
      "<a href='https://doi.org/10.1234/test'></a>",
      ["https://doi.org/10.1234/test"],
    ],
    ['<a href="https://doi.org/10.1234/test">click here</a>', []],
    [
      '<a class="ref" href="https://doi.org/10.1234/test" target="_blank"></a>',
      ["https://doi.org/10.1234/test"],
    ],
    ['<a href="mailto:test@example.com"></a>', []],
    [
      '<a href="https://doi.org/10.1016/0168-9452(87)90107-5"></a>',
      ["https://doi.org/10.1016/0168-9452(87)90107-5"],
    ],
    [
      '<a href="https://doi.org/10.1234/test">  </a>',
      ["https://doi.org/10.1234/test"],
    ],
    [
      '[](https://doi.org/10.1234/a)\n<a href="https://doi.org/10.5678/b"></a>',
      ["https://doi.org/10.1234/a", "https://doi.org/10.5678/b"],
    ],
    [
      '[](https://doi.org/10.1234/a)\n<a href="https://doi.org/10.1234/a"></a>',
      ["https://doi.org/10.1234/a"],
    ],
  ])("extracts empty reference URLs from %s", (content, expected) => {
    expect(extractRefUrls(content)).toEqual(expected);
  });
});

describe("buildBibtexUrlToFormattedTextMap", () => {
  it("extracts and formats a standard BibTeX URL field", () => {
    const content = `
:::bibtex
@article{arcadia-pycolor,
  title = {Title},
  author = {Author, Alice},
  year = {2024},
  url = {https://example.com/paper}
}
:::
`;
    expect(
      Object.fromEntries(buildBibtexUrlToFormattedTextMap(content))
    ).toEqual({
      "https://example.com/paper": "Author A. (2024). Title.",
    });
  });

  it("extracts and formats a BibTeX howpublished URL", () => {
    const content = `
:::bibtex
@article{arcadia-pycolor,
  title = {Title},
  author = {Author, Alice},
  year = {2024},
  howpublished = {\\url{https://example.com/paper}}
}
:::
`;
    expect(
      Object.fromEntries(buildBibtexUrlToFormattedTextMap(content))
    ).toEqual({
      "https://example.com/paper": "Author A. (2024). Title.",
    });
  });

  it("returns an empty map when BibTeX has no URL", () => {
    const content = `
:::bibtex
@article{arcadia-pycolor,
  title = {Some Paper Without a URL},
  author = {Author, Alice},
  year = {2024}
}
:::
`;
    expect(buildBibtexUrlToFormattedTextMap(content).size).toBe(0);
  });

  it("extracts and formats every entry in a block with several entries", () => {
    const content = `
:::bibtex
@Misc{ first,
  title = {First Tool},
  author = {Author, Alice},
  year = {2024},
  url = {https://example.com/first}
}

@Misc{ second,
  title = {Second Tool},
  author = {Builder, Bob},
  year = {2025},
  howpublished = {\\url{https://example.com/second}}
}
  @Misc{ no-url,
  title = {No URL},
  year = {2025}
}
@Misc{ third,
  title = {Third Tool},
  url = {https://example.com/third}
}
:::
`;
    expect(
      Object.fromEntries(buildBibtexUrlToFormattedTextMap(content))
    ).toEqual({
      "https://example.com/first": "Author A. (2024). First Tool.",
      "https://example.com/second": "Builder B. (2025). Second Tool.",
      "https://example.com/third": "(n.d.). Third Tool.",
    });
  });

  it("extracts entries across multiple blocks", () => {
    const content = `
:::bibtex
@Misc{ first,
  title = {First Tool},
  year = {2024},
  url = {https://example.com/first}
}
:::

:::bibtex
@Misc{ second,
  title = {Second Tool},
  year = {2025},
  url = {https://example.com/second}
}
:::
`;
    expect(
      Object.fromEntries(buildBibtexUrlToFormattedTextMap(content))
    ).toEqual({
      "https://example.com/first": "(2024). First Tool.",
      "https://example.com/second": "(2025). Second Tool.",
    });
  });

  it("lowercases the key so lookups match regardless of casing", () => {
    const content = `
:::bibtex
@article{arcadia-pycolor,
  title = {Title},
  author = {Author, Alice},
  year = {2024},
  url = {https://Example.COM/Paper}
}
:::
`;
    const result = buildBibtexUrlToFormattedTextMap(content);
    expect(result.has("https://example.com/paper")).toBe(true);
    expect(result.has("https://Example.COM/Paper")).toBe(false);
  });
});
