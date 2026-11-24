import type { Locator, Page } from "@playwright/test";
import path from "node:path";

import { OUT_DIR } from "./env";

interface ShootOptions {
  /** Crop to this element. Omit for a viewport shot. */
  target?: Locator;
  /** Covered with a solid box, keeping the layout. */
  mask?: Locator[];
  /** Made invisible, keeping the layout. Use for dates and other volatile text. */
  hide?: (string | Locator)[];
  /** Extra CSS applied only while the shot is taken. */
  css?: string;
  fullPage?: boolean;
}

// Sticky headers would otherwise be drawn over an element that the page has
// to scroll to reach.
const UNSTICK =
  ".sticky { position: relative !important; top: auto !important; }";

// Toasts and other transient UI that would make shots differ between runs.
const ALWAYS_HIDDEN = ["[data-sonner-toaster]", "[data-sonner-toast]"];

/**
 * Settles the page, then writes `out/<name>.png`. That directory is what gets
 * uploaded for the docs, so `name` must be stable. It starts with the app's
 * folder: `stacks/` for The Stacks, `raven/` for the Raven admin UI.
 */
export async function shoot(
  page: Page,
  name: string,
  {
    target,
    mask = [],
    hide = [],
    css = "",
    fullPage = false,
  }: ShootOptions = {}
): Promise<void> {
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {
    // Still busy. Locators in the spec wait for what the shot needs.
  });
  await page.evaluate(() => document.fonts.ready);

  const selectors = [...ALWAYS_HIDDEN];
  for (const item of hide) {
    if (typeof item === "string") {
      selectors.push(item);
      continue;
    }
    await item.evaluateAll((elements) => {
      for (const element of elements) {
        (element as HTMLElement).style.setProperty(
          "visibility",
          "hidden",
          "important"
        );
      }
    });
  }

  const style = `${selectors.join(", ")} { visibility: hidden !important; }
*, *::before, *::after { caret-color: transparent !important; }
${css}`;
  const options = {
    path: path.join(OUT_DIR, `${name}.png`),
    mask,
    style,
    animations: "disabled" as const,
  };

  if (target) {
    await shootElement(page, target, options);
    return;
  }
  await page.screenshot({ ...options, fullPage });
}

/**
 * Grows the viewport to fit a target taller than it, so the element is
 * captured in one piece instead of stitched from scrolled frames.
 */
async function shootElement(
  page: Page,
  target: Locator,
  options: {
    path: string;
    mask: Locator[];
    style: string;
    animations: "disabled";
  }
): Promise<void> {
  const viewport = page.viewportSize();
  const box = await target.boundingBox();
  const tall = viewport && box && box.height > viewport.height;
  if (tall) {
    await page.setViewportSize({
      width: viewport.width,
      height: Math.ceil(box.height) + 200,
    });
  }
  try {
    await target.scrollIntoViewIfNeeded();
    await target.screenshot({
      ...options,
      style: `${options.style}\n${UNSTICK}`,
    });
  } finally {
    if (tall) await page.setViewportSize(viewport);
  }
}
