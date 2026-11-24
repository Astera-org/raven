import { type TestCase } from "@harness/types.ts";
import { mkdir, writeFile } from "node:fs/promises";
import { afterAll, beforeAll, describe } from "vitest";
import {
  bootstrapWorker,
  defineCase,
  teardown,
  type WorkerHarness,
} from "../../harness/runner.ts";
import { TINY_PNG } from "../../harness/test-assets.ts";

describe("files", () => {
  const workerHarnessRef: { harness: WorkerHarness } = {
    harness: null as unknown as WorkerHarness,
  };
  beforeAll(async () => {
    console.log("Booting test harness...");
    const workerHarness = await bootstrapWorker();
    workerHarnessRef.harness = workerHarness;

    // Seed a test image into each target's IMG_DIR so 200 cases can serve it.
    for (const { imgDir } of Object.values(workerHarness.targets)) {
      if (!imgDir) continue;
      await mkdir(imgDir, { recursive: true });
      await writeFile(`${imgDir}/test.png`, TINY_PNG);
    }
  });

  afterAll(async () => {
    console.log("Tearing down test harness...");
    await teardown(workerHarnessRef.harness);
  });

  const defineFilesCase = (testCase: TestCase) =>
    defineCase("files", testCase, workerHarnessRef);

  defineFilesCase({
    name: "GET existing file returns 200",
    fixtures: ["empty"],
    request: { method: "GET", path: "/files/test.png" },
    assert: { status: 200 },
    ignoreHeaders: ["cache-control"],
  });

  defineFilesCase({
    name: "GET unknown filename returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/files/does-not-exist.png" },
    assert: { status: 404 },
  });

  // Path traversal attempts must not escape the configured IMG_DIR. Unlike
  // the simple missing-file case, this exercises the security guard
  // explicitly.
  defineFilesCase({
    name: "GET path traversal attempt returns 404",
    fixtures: ["empty"],
    request: { method: "GET", path: "/files/../../etc/passwd" },
    assert: { status: 404 },
  });
});
