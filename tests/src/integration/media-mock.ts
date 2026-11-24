import { readFileSync } from "node:fs";
import { expect } from "vitest";

// See docker-compose.test.yml's media-mock service and media-mock/server.js.
const MEDIA_MOCK_URL = process.env.MEDIA_MOCK_URL ?? "http://localhost:4322";

// The mock's network alias inside the compose network, used in publication
// bodies; test code talks to the mock via MEDIA_MOCK_URL. A backend running on
// the host reaches the mock via DEV_MEDIA_ORIGIN_OVERRIDE instead.
const MEDIA_MOCK_HOST = "http://lh3.googleusercontent.com";

const FIXTURES_DIR = new URL("../../fixtures/media/", import.meta.url);

export type MediaFixture =
  | "blank.html"
  | "pixel-animated.gif"
  | "pixel-orient6.jpg"
  | "pixel-prolog.svg"
  | "pixel-rot90.mp4"
  | "pixel.mp4"
  | "pixel.png"
  | "pixel.svg"
  | "silence.mp3";

// Routes media-mock/server.js serves without a backing fixture file.
export type MediaMockSpecialRoute =
  | "corrupt.png"
  | "mislabeled.png"
  | "missing.png"
  | "notes.txt"
  | "unavailable.png";

export type MediaDirective = "audio" | "iframe" | "image" | "video";

export interface MediaMockCall {
  method: "GET" | "HEAD";
  path: string;
  status: number;
}

export function mediaUrl(name: MediaFixture | MediaMockSpecialRoute): string {
  return `${MEDIA_MOCK_HOST}/${name}`;
}

/** A container directive the backend's media upload picks up, e.g. `:::image{src="..."}`. */
export function mediaDirective(
  directive: MediaDirective,
  name: MediaFixture | MediaMockSpecialRoute
): string {
  return `:::${directive}{src="${mediaUrl(name)}"}\n:::`;
}

export function fixtureBytes(name: MediaFixture): Buffer {
  return readFileSync(new URL(name, FIXTURES_DIR));
}

export async function resetMediaMock(): Promise<void> {
  const resp = await fetch(`${MEDIA_MOCK_URL}/_mock/reset`, {
    method: "POST",
  });
  expect(resp.ok).toBe(true);
}

export async function getMediaMockCalls(): Promise<MediaMockCall[]> {
  const resp = await fetch(`${MEDIA_MOCK_URL}/_mock/calls`);
  expect(resp.ok).toBe(true);
  const json = (await resp.json()) as { calls: MediaMockCall[] };
  return json.calls;
}

/**
 * Overrides the Last-Modified header served for `name` (defaults to now) until
 * the next resetMediaMock(), simulating the upstream file being replaced.
 */
export async function setMediaLastModified(
  name: MediaFixture | MediaMockSpecialRoute,
  lastModified?: Date
): Promise<void> {
  const resp = await fetch(`${MEDIA_MOCK_URL}/_mock/last-modified`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, lastModified: lastModified?.toISOString() }),
  });
  expect(resp.ok).toBe(true);
}
