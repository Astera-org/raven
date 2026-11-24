import { getConfig } from "#src/config.js";
import { attachFileToIssue, createLinearIssue } from "#src/lib/linear.js";
import { emptyToNull } from "#src/lib/utils/string.js";
import type { AppEnv } from "#src/types/hono.js";
import { dbSelect } from "#v0/lib/db/db-select.js";
import { getSessionUserId, userBelongsToOrgs } from "#v0/lib/rutils.js";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

const app = new Hono<AppEnv>();

export function contactUsAllowedOrgs(): string[] {
  return getConfig().PUBLICATION_CREATOR_ORGS;
}

const ALLOWED_SCREENSHOT_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".mp4",
  ".mov",
]);
const MAX_SCREENSHOT_SIZE_BYTES = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Validation
//
// Fields mirror the Linear "STACKS" triage template:
// Title, Stakeholders, Team, Request type, Due date (optional), Have you
// tried anything already? (optional). Bug reports and feature requests each
// additionally require their own type-specific fields.
// ---------------------------------------------------------------------------

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Treats missing keys, non-strings, and blank/whitespace-only strings as
// absent, matching emptyToNull's semantics used elsewhere in this codebase.
const requiredField = (message: string) =>
  z.preprocess(emptyToNull, z.string({ error: message }));

const optionalField = () => z.preprocess(emptyToNull, z.string().nullable());

const dueDateField = z.preprocess(
  emptyToNull,
  z.string().regex(DATE_REGEX, "Must be a date in YYYY-MM-DD format").nullable()
);

const commonFields = {
  title: requiredField("Missing title"),
  stakeholders: requiredField("Missing stakeholders"),
  team: requiredField("Missing team"),
  dueDate: dueDateField,
  url: optionalField(),
  triedAlready: optionalField(),
};

const bugReportSchema = z.object({
  ...commonFields,
  type: z.literal("bug"),
  whatDoesItCurrentlyDo: requiredField(
    "Missing answer for 'What does it currently do?'"
  ),
  whatCantYouDoBecauseOfThis: requiredField(
    "Missing answer for 'What can't you do because of this?'"
  ),
  whatAreTheRisks: requiredField("Missing answer for 'What are the risks?'"),
  stepsToReproduce: requiredField("Missing steps to reproduce"),
  expectedBehavior: requiredField("Missing expected behavior"),
  actualBehavior: requiredField("Missing actual behavior"),
  severity: optionalField(),
});

const featureRequestSchema = z.object({
  ...commonFields,
  type: z.literal("featureRequest"),
  whatAreYouTryingToDo: requiredField(
    "Missing answer for 'What are you trying to accomplish?'"
  ),
  whatsStoppingYou: requiredField(
    "Missing answer for 'What's stopping you from doing this today?'"
  ),
  impactIfNotBuilt: requiredField(
    "Missing answer for 'What's the impact if this isn't built?'"
  ),
  proposedSolution: optionalField(),
});

const contactUsSchema = z.discriminatedUnion("type", [
  bugReportSchema,
  featureRequestSchema,
]);

type ContactUsFields = z.infer<typeof contactUsSchema>;

function toFieldErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    const message =
      issue.code === "invalid_union" && key === "type"
        ? 'Must be "bug" or "featureRequest"'
        : issue.message;
    (errors[key] ??= []).push(message);
  }
  return errors;
}

function validateContactUsForm(
  body: Record<string, unknown>
): { fields: ContactUsFields } | { errors: Record<string, string[]> } {
  const result = contactUsSchema.safeParse(body);
  if (!result.success) return { errors: toFieldErrors(result.error) };
  return { fields: result.data };
}

// ---------------------------------------------------------------------------
// Description building
// ---------------------------------------------------------------------------

interface ReporterContext {
  name: string;
  email: string;
  userAgent: string | null;
  pageUrl: string | null;
}

function buildDescription(
  fields: ContactUsFields,
  reporter: ReporterContext
): string {
  const sections: string[] = [
    `### Stakeholders\n${fields.stakeholders}`,
    `### Team\n${fields.team}`,
    `### Request type\n${fields.type === "bug" ? "Bug" : "Feature request"}`,
  ];
  if (fields.triedAlready)
    sections.push(
      `### Have you tried anything already?\n${fields.triedAlready}`
    );

  if (fields.type === "bug") {
    sections.push(
      `### What does it currently do?\n${fields.whatDoesItCurrentlyDo}`,
      `### What can't you do because of this?\n${fields.whatCantYouDoBecauseOfThis}`,
      `### What are the risks?\n${fields.whatAreTheRisks}`,
      `### Steps to reproduce\n${fields.stepsToReproduce}`,
      `### Expected behavior\n${fields.expectedBehavior}`,
      `### Actual behavior\n${fields.actualBehavior}`
    );
    if (fields.severity) sections.push(`### Severity\n${fields.severity}`);
  } else {
    sections.push(
      `### What are you trying to accomplish?\n${fields.whatAreYouTryingToDo}`,
      `### What's stopping you from doing this today?\n${fields.whatsStoppingYou}`,
      `### What's the impact if this isn't built?\n${fields.impactIfNotBuilt}`
    );
    if (fields.proposedSolution)
      sections.push(`### Proposed solution\n${fields.proposedSolution}`);
  }

  const contextLines: string[] = [
    `Reported by: ${reporter.name} (${reporter.email})`,
  ];
  if (reporter.pageUrl) contextLines.push(`Page: ${reporter.pageUrl}`);
  if (reporter.userAgent)
    contextLines.push(`User agent: ${reporter.userAgent}`);
  if (fields.url) sections.push(`URL: ${fields.url}`);
  sections.push(`### Context\n${contextLines.join("\n")}`);

  return sections.join("\n\n");
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.post("/", async (c) => {
  const userId = await getSessionUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  // `*` allows all, not a true glob.
  const allowedOrgs = contactUsAllowedOrgs();
  if (!allowedOrgs.includes("*")) {
    if (!(await userBelongsToOrgs(userId, allowedOrgs))) {
      return c.json({ error: "Permission denied" }, 403);
    }
  }

  const body = await c.req.parseBody().catch(() => null);
  if (!body) return c.json({ error: "Invalid request body" }, 400);

  const result = validateContactUsForm(body as Record<string, unknown>);
  if ("errors" in result) return c.json({ errors: result.errors }, 400);
  const { fields } = result;

  let screenshot: File | null = null;
  const screenshotValue = body["screenshot"];
  if (screenshotValue instanceof File && screenshotValue.size > 0) {
    const ext = screenshotValue.name.slice(
      screenshotValue.name.lastIndexOf(".")
    );
    if (!ALLOWED_SCREENSHOT_EXTENSIONS.has(ext.toLowerCase()))
      return c.json({ error: "Unsupported screenshot file type" }, 400);
    if (screenshotValue.size > MAX_SCREENSHOT_SIZE_BYTES)
      return c.json({ error: "Screenshot file is too large, max 10MB" }, 400);
    screenshot = screenshotValue;
  }

  const userRows = await dbSelect(
    sql`SELECT email, first_name, last_name FROM users WHERE id_int = ${userId}`
  );
  const user = userRows[0];
  const reporter: ReporterContext = {
    name: user ? `${user["first_name"]} ${user["last_name"]}` : "Unknown",
    email: (user?.["email"] as string) ?? "unknown",
    userAgent: c.req.header("user-agent") ?? null,
    pageUrl: emptyToNull(body["pageUrl"] as string | null),
  };

  const issue = await createLinearIssue({
    title: fields.title,
    description: buildDescription(fields, reporter),
    dueDate: fields.dueDate,
  });
  if (!issue) return c.json({ error: "Failed to create issue" }, 502);

  if (screenshot) await attachFileToIssue(issue.id, screenshot);

  return c.json(
    {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      issueUrl: issue.url,
    },
    201
  );
});

export default app;
