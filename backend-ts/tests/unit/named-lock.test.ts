import { NamedLockTimeoutError, withNamedLock } from "#src/lib/named-lock.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();

vi.mock("#src/db/index.js", () => ({
  getLockPool: () => ({
    getConnection: () =>
      Promise.resolve({ query: queryMock, release: releaseMock }),
  }),
}));

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
});

describe("withNamedLock", () => {
  it("throws a NamedLockTimeoutError naming the lock by default", async () => {
    queryMock.mockResolvedValueOnce([[{ acquired: 0 }]]); // GET_LOCK timed out

    const fn = vi.fn();
    const error = await withNamedLock("draft-source:publication:x", fn).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(NamedLockTimeoutError);
    expect((error as NamedLockTimeoutError).lockName).toBe(
      "draft-source:publication:x"
    );
    expect(fn).not.toHaveBeenCalled();
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
