import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { plainFetch } from "./plain-fetch.js";

describe("plainFetch", () => {
  let server: Server;
  let baseUrl: string;
  let received: { headers: IncomingHttpHeaders; body: string } | undefined;
  let status: number;

  beforeEach(async () => {
    status = 201;
    server = createServer((request, response) => {
      let body = "";
      request.on("data", (chunk: Buffer) => (body += chunk.toString()));
      request.on("end", () => {
        received = { headers: request.headers, body };
        response.writeHead(status, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ ok: true }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  it("sends the request without Sec-Fetch headers", async () => {
    const response = await plainFetch(`${baseUrl}/sign-in/email`, {
      method: "POST",
      headers: new Headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ email: "a@b.c" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ ok: true });
    expect(received?.body).toBe('{"email":"a@b.c"}');
    expect(received?.headers["content-length"]).toBe("17");
    expect(
      Object.keys(received?.headers ?? {}).filter((name) =>
        name.startsWith("sec-fetch-")
      )
    ).toEqual([]);
  });

  it("returns an empty body for null-body statuses", async () => {
    status = 205;

    const response = await plainFetch(`${baseUrl}/sign-out`, {
      method: "POST",
      headers: new Headers(),
      body: "{}",
    });

    expect(response.status).toBe(205);
    expect(response.body).toBeNull();
  });

  it("rejects a status that can't become a Response", async () => {
    status = 600;

    await expect(
      plainFetch(`${baseUrl}/get-session`, {
        method: "GET",
        headers: new Headers(),
      })
    ).rejects.toBeInstanceOf(RangeError);
  });

  it("rejects when the server can't be reached", async () => {
    await new Promise((resolve) => server.close(resolve));

    await expect(
      plainFetch(`${baseUrl}/get-session`, {
        method: "GET",
        headers: new Headers(),
      })
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
  });
});
