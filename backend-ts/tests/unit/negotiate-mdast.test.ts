import {
  MDAST_MEDIA_TYPE,
  negotiateMdast,
} from "#v1/routes/publications/helpers/negotiate-mdast.js";
import { describe, expect, it } from "vitest";

const OTHERS = ["application/json", "application/*", "*/*"];

function negotiate(accept: string | undefined, enabled = true) {
  return negotiateMdast(accept, {
    enabled,
    servesOtherwise: (preference) => OTHERS.includes(preference),
  });
}

describe("negotiateMdast", () => {
  it("defaults the schema and leaves the version to the server", () => {
    expect(negotiate(MDAST_MEDIA_TYPE)).toEqual({
      format: "mdast",
      schema: 1,
      version: undefined,
    });
  });

  it.each([
    `${MDAST_MEDIA_TYPE}; schema=1; version=2`,
    `${MDAST_MEDIA_TYPE};version=2;schema=1`,
    `Application/VND.thestacks.mdast+JSON; Version="2"; SCHEMA=1`,
    `${MDAST_MEDIA_TYPE}; charset=utf-8; version=2`,
  ])("reads the parameters of %s", (accept) => {
    expect(negotiate(accept)).toEqual({
      format: "mdast",
      schema: 1,
      version: 2,
    });
  });

  it("serves another type the client prefers", () => {
    expect(negotiate(`application/json, ${MDAST_MEDIA_TYPE};q=0.5`)).toEqual({
      format: "none",
    });
    expect(
      negotiate(`application/json;q=0.5, ${MDAST_MEDIA_TYPE}`)
    ).toMatchObject({ format: "mdast" });
  });

  it("never picks the AST for a wildcard or a missing header", () => {
    expect(negotiate("*/*")).toEqual({ format: "none" });
    expect(negotiate("application/*")).toEqual({ format: "none" });
    expect(negotiate(undefined)).toEqual({ format: "none" });
  });

  it("skips types the route does not serve", () => {
    expect(negotiate(`text/html, ${MDAST_MEDIA_TYPE};q=0.5`)).toMatchObject({
      format: "mdast",
    });
  });

  it.each([
    ["a zero version", `${MDAST_MEDIA_TYPE}; version=0`],
    ["a non-integer version", `${MDAST_MEDIA_TYPE}; version=2.5`],
    ["a non-integer schema", `${MDAST_MEDIA_TYPE}; schema=one`],
    ["an unsupported schema", `${MDAST_MEDIA_TYPE}; schema=99`],
  ])("refuses %s", (_, accept) => {
    expect(negotiate(accept)).toMatchObject({ format: "not-acceptable" });
  });

  it("refuses the AST while it is switched off", () => {
    expect(negotiate(MDAST_MEDIA_TYPE, false)).toMatchObject({
      format: "not-acceptable",
    });
    expect(negotiate("application/json", false)).toEqual({ format: "none" });
  });
});
