import {
  DoiLockTimeoutError,
  withPublicationDoiLock,
} from "#src/lib/publication-doi-lock.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const getConnectionMock = vi.fn();

vi.mock("#src/db/index.js", () => ({
  getLockPool: () => ({ getConnection: getConnectionMock }),
}));

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  getConnectionMock.mockReset();
  getConnectionMock.mockResolvedValue({
    query: queryMock,
    release: releaseMock,
  });
});

describe("withPublicationDoiLock", () => {
  it("runs fn and releases the lock and connection when GET_LOCK succeeds", async () => {
    queryMock
      .mockResolvedValueOnce([[{ acquired: 1 }]]) // GET_LOCK
      .mockResolvedValueOnce([[]]); // RELEASE_LOCK

    const fn = vi.fn().mockResolvedValue("result");
    const result = await withPublicationDoiLock("42", fn);

    expect(result).toBe("result");
    expect(fn).toHaveBeenCalledOnce();
    expect(queryMock).toHaveBeenNthCalledWith(
      1,
      "SELECT GET_LOCK(?, ?) AS acquired",
      ["doi:publication:42", 10]
    );
    expect(queryMock).toHaveBeenNthCalledWith(2, "SELECT RELEASE_LOCK(?)", [
      "doi:publication:42",
    ]);
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("throws DoiLockTimeoutError, skips RELEASE_LOCK, and still releases the connection when the lock can't be acquired", async () => {
    queryMock.mockResolvedValueOnce([[{ acquired: 0 }]]); // GET_LOCK timed out

    const fn = vi.fn();
    await expect(withPublicationDoiLock("7", fn, 1)).rejects.toBeInstanceOf(
      DoiLockTimeoutError
    );

    expect(fn).not.toHaveBeenCalled();
    // Never issue RELEASE_LOCK for a lock this session doesn't hold.
    expect(queryMock).toHaveBeenCalledOnce();
    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("propagates errors from fn but still releases the lock and connection", async () => {
    queryMock
      .mockResolvedValueOnce([[{ acquired: 1 }]]) // GET_LOCK
      .mockResolvedValueOnce([[]]); // RELEASE_LOCK

    const fn = vi.fn().mockRejectedValue(new Error("mint failed"));
    await expect(withPublicationDoiLock("1", fn)).rejects.toThrow(
      "mint failed"
    );

    expect(releaseMock).toHaveBeenCalledOnce();
  });

  it("still releases the connection if RELEASE_LOCK itself fails", async () => {
    queryMock
      .mockResolvedValueOnce([[{ acquired: 1 }]]) // GET_LOCK
      .mockRejectedValueOnce(new Error("connection dropped")); // RELEASE_LOCK

    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withPublicationDoiLock("9", fn);

    expect(result).toBe("ok");
    expect(releaseMock).toHaveBeenCalledOnce();
  });
});
