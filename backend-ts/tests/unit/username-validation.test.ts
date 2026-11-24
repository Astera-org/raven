import { isValidUsername } from "#src/lib/auth.js";
import { describe, expect, it } from "vitest";

describe("isValidUsername", () => {
  it("accepts a username made only of letters and numbers", () => {
    expect(isValidUsername("user123")).toBe(true);
  });

  it("accepts a username containing an underscore in the middle", () => {
    expect(isValidUsername("user_name")).toBe(true);
  });

  it("accepts a username containing a hyphen in the middle", () => {
    expect(isValidUsername("user-name")).toBe(true);
  });

  it("accepts a username containing a period in the middle", () => {
    expect(isValidUsername("user.name")).toBe(true);
  });

  it("accepts a username mixing multiple allowed special characters, each isolated between alphanumerics", () => {
    expect(isValidUsername("user.name-1_2")).toBe(true);
  });

  it("rejects a username containing a space", () => {
    expect(isValidUsername("user name")).toBe(false);
  });

  it("rejects a username containing an at sign", () => {
    expect(isValidUsername("user@name")).toBe(false);
  });

  it("rejects a username containing an exclamation mark", () => {
    expect(isValidUsername("user!name")).toBe(false);
  });

  it("rejects a username that begins with a hyphen", () => {
    expect(isValidUsername("-username")).toBe(false);
  });

  it("rejects a username that begins with an underscore", () => {
    expect(isValidUsername("_username")).toBe(false);
  });

  it("rejects a username that begins with a period", () => {
    expect(isValidUsername(".username")).toBe(false);
  });

  it("rejects a username that ends with a hyphen", () => {
    expect(isValidUsername("username-")).toBe(false);
  });

  it("rejects a username that ends with an underscore", () => {
    expect(isValidUsername("username_")).toBe(false);
  });

  it("rejects a username that ends with a period", () => {
    expect(isValidUsername("username.")).toBe(false);
  });

  it("rejects a username with two consecutive hyphens", () => {
    expect(isValidUsername("user--name")).toBe(false);
  });

  it("rejects a username with two consecutive underscores", () => {
    expect(isValidUsername("user__name")).toBe(false);
  });

  it("rejects a username with two consecutive periods", () => {
    expect(isValidUsername("user..name")).toBe(false);
  });

  it("rejects a username with consecutive special characters of different kinds", () => {
    expect(isValidUsername("user-_name")).toBe(false);
  });

  it("enforces username length", () => {
    expect(isValidUsername("a")).toBe(false);
    expect(isValidUsername("aa")).toBe(false);
    expect(isValidUsername("aaa")).toBe(true);
    expect(isValidUsername("aaabbbcccdddeeefff")).toBe(true);
    expect(isValidUsername("aaabbbcccdddeeefffg")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isValidUsername("")).toBe(false);
  });

  it("rejects a username consisting only of a special character", () => {
    expect(isValidUsername("-")).toBe(false);
  });
});
