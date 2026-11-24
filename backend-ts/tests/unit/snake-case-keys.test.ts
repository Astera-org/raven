import { snakeCaseKeys } from "#src/lib/utils/snake-case-keys.js";
import { describe, expect, it } from "vitest";

describe("snakeCaseKeys", () => {
  it("converts camelCase keys to snake_case", () => {
    expect(snakeCaseKeys({ firstName: "Ada", lastLoginAt: "today" })).toEqual({
      first_name: "Ada",
      last_login_at: "today",
    });
  });

  it("returns an empty object for an empty input", () => {
    expect(snakeCaseKeys({})).toEqual({});
  });

  it("leaves already-snake_case keys unchanged", () => {
    expect(snakeCaseKeys({ first_name: "Ada" })).toEqual({
      first_name: "Ada",
    });
  });

  it("preserves values without recursing into nested objects or arrays", () => {
    const nested = { innerKey: "untouched" };
    const arr = [1, 2, 3];
    expect(snakeCaseKeys({ nestedObj: nested, listVal: arr })).toEqual({
      nested_obj: nested,
      list_val: arr,
    });
  });

  it("preserves null and undefined values", () => {
    expect(snakeCaseKeys({ someVal: null, otherVal: undefined })).toEqual({
      some_val: null,
      other_val: undefined,
    });
  });

  it("splits runs of consecutive capitals into separate words", () => {
    expect(snakeCaseKeys({ XMLHttpRequest: "acronym" })).toEqual({
      xml_http_request: "acronym",
    });
  });

  it("lowercases a lone leading capital letter", () => {
    expect(snakeCaseKeys({ ALLCAPS: "shout" })).toEqual({ allcaps: "shout" });
  });

  it("keeps digits attached to the preceding word", () => {
    expect(snakeCaseKeys({ key123Next: "x" })).toEqual({ key123_next: "x" });
  });

  it("strips leading and trailing underscores", () => {
    expect(snakeCaseKeys({ _leading: 1, trailing_: 2 })).toEqual({
      leading: 1,
      trailing: 2,
    });
  });

  it("maps a key of only underscores to an empty string key", () => {
    expect(snakeCaseKeys({ __: "x" })).toEqual({ "": "x" });
  });

  it("last-write-wins when two keys collide after conversion", () => {
    // `fooBar` and `foo_bar` both convert to `foo_bar`; object key insertion
    // order means the later entry overwrites the earlier one.
    expect(snakeCaseKeys({ fooBar: "camel", foo_bar: "snake" })).toEqual({
      foo_bar: "snake",
    });
  });

  it("does not mutate the original object", () => {
    const original = { camelCase: "value" };
    snakeCaseKeys(original);
    expect(original).toEqual({ camelCase: "value" });
  });
});
