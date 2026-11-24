import type { Locator, Page } from "@playwright/test";

const MONTH = "(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)";

/**
 * Leaf elements showing a date, like "Oct 8", "Published Oct 8, 2026" or
 * "Member since Oct 2026". The seeded data gets new dates whenever the
 * deployment is reset, so shots hide them.
 */
export function dates(page: Page): Locator {
  return page
    .getByText(
      new RegExp(`^(Published |Member since )?${MONTH} \\d{1,4}(, \\d{4})?$`)
    )
    .filter({ visible: true });
}

/**
 * Elements showing a relative time, like "edited 3 minutes ago" or "synced a
 * few seconds ago". These change with every run.
 */
export function relativeTimes(page: Page): Locator {
  return page.getByText(/\bago$/).filter({ visible: true });
}
