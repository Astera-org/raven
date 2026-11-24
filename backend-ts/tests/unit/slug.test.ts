import type * as DbModule from "#src/db/index.js";
import { generateSlug } from "#src/lib/utils/generate-slug.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindBySlug = vi.hoisted(() => vi.fn());
const mockListSlugsWithPrefix = vi.hoisted(() => vi.fn());

vi.mock("#src/db/index.js", async (importOriginal) => ({
  ...(await importOriginal<typeof DbModule>()),
  getDb: () => ({}),
}));

vi.mock("#src/api-v1/db-repositories/publications-repository.js", () => ({
  PublicationsRepository: class {
    findBySlug = mockFindBySlug;
    listSlugsWithPrefix = mockListSlugsWithPrefix;
  },
}));

const { validateSlug } =
  await import("#src/api-v1/routes/publications/helpers/validate-slug.js");

describe("generateSlug", () => {
  it("combines a kebab-cased title with the pub ulid", () => {
    expect(generateSlug("My Great Title", "01ABC")).toBe(
      "my-great-title-01abc"
    );
  });

  it("falls back to just the ulid when the title is empty", () => {
    expect(generateSlug("", "01ABC")).toBe("01abc");
  });

  it("lowercases the result", () => {
    expect(generateSlug("SOME Title", "01ABC")).toBe("some-title-01abc");
  });

  it("returns null when the title and ulid are both empty", () => {
    expect(generateSlug("", "")).toBeNull();
  });
});

describe("validateSlug", () => {
  const currentSlug = "current-slug-123";

  beforeEach(() => {
    mockFindBySlug.mockReset();
    mockListSlugsWithPrefix.mockReset();
  });

  it("leaves the slug unchanged when the body has no slug field", async () => {
    expect(await validateSlug(currentSlug, {})).toEqual({ slug: currentSlug });
    expect(mockFindBySlug).not.toHaveBeenCalled();
  });

  it("leaves the slug unchanged when the provided slug only differs in case/whitespace", async () => {
    expect(
      await validateSlug(currentSlug, {
        slug: ` ${currentSlug.toUpperCase()} `,
      })
    ).toEqual({ slug: currentSlug });
    expect(mockFindBySlug).not.toHaveBeenCalled();
  });

  it("rejects updating the slug when the publication is not a draft", async () => {
    expect(
      await validateSlug(currentSlug, { slug: "a-brand-new-slug" }, "PUBLISHED")
    ).toEqual({
      slug: currentSlug,
      rejection: {
        code: "custom",
        path: ["slug"],
        message:
          "Slug can only be updated while the publication is being drafted",
      },
    });
    expect(mockFindBySlug).not.toHaveBeenCalled();
  });

  it("allows updating the slug while the publication is a draft", async () => {
    mockFindBySlug.mockResolvedValue(undefined);
    expect(
      await validateSlug(currentSlug, { slug: "a-brand-new-slug" }, "DRAFT")
    ).toEqual({ slug: "a-brand-new-slug" });
  });

  it("allows the slug when no publication state is provided", async () => {
    mockFindBySlug.mockResolvedValue(undefined);
    expect(
      await validateSlug(currentSlug, { slug: "a-brand-new-slug" })
    ).toEqual({ slug: "a-brand-new-slug" });
  });

  it("rejects a slug shorter than 12 characters", async () => {
    const result = await validateSlug(currentSlug, { slug: "short" }, "DRAFT");
    expect(result.slug).toBe(currentSlug);
    expect(result.rejection?.message).toBe(
      "Slug must be at least 12 characters long"
    );
    expect(mockFindBySlug).not.toHaveBeenCalled();
  });

  it("rejects a slug containing invalid characters", async () => {
    const result = await validateSlug(
      currentSlug,
      { slug: "invalid_slug_here" },
      "DRAFT"
    );
    expect(result.slug).toBe(currentSlug);
    expect(result.rejection?.message).toBe(
      "Slug can only contain lowercase letters, numbers, and hyphens"
    );
  });

  it("rejects a slug with consecutive hyphens", async () => {
    const result = await validateSlug(
      currentSlug,
      { slug: "has--double-hyphens" },
      "DRAFT"
    );
    expect(result.slug).toBe(currentSlug);
    expect(result.rejection?.message).toBe(
      "Slug must not start or end with a hyphen and must not have consecutive hyphens"
    );
  });

  it("uses the first free variant of a slug taken by another publication", async () => {
    mockFindBySlug.mockResolvedValue({ slug: "a-taken-new-slug" });
    mockListSlugsWithPrefix.mockResolvedValue([
      "a-taken-new-slug",
      "a-taken-new-slug-2",
    ]);
    expect(
      await validateSlug(currentSlug, { slug: "a-taken-new-slug" }, "DRAFT")
    ).toEqual({
      slug: "a-taken-new-slug-3",
      warning: {
        code: "slug_replaced",
        path: ["slug"],
        message:
          'The slug "a-taken-new-slug" is already taken, so "a-taken-new-slug-3" was used instead',
      },
    });
  });

  it("treats the publication's own slug as a free variant", async () => {
    mockFindBySlug.mockResolvedValue({ slug: "a-taken-new-slug" });
    mockListSlugsWithPrefix.mockResolvedValue([
      "a-taken-new-slug",
      "a-taken-new-slug-2",
    ]);
    const result = await validateSlug(
      "a-taken-new-slug-2",
      { slug: "a-taken-new-slug" },
      "DRAFT"
    );
    expect(result.slug).toBe("a-taken-new-slug-2");
  });

  it("truncates a long slug so the free variant fits the length limit", async () => {
    const longSlug = "a".repeat(255);
    mockFindBySlug.mockResolvedValue({ slug: longSlug });
    mockListSlugsWithPrefix.mockResolvedValue([longSlug]);
    const result = await validateSlug(currentSlug, { slug: longSlug }, "DRAFT");
    expect(result.slug).toBe(`${"a".repeat(253)}-2`);
  });
});
