import {
  type DoiMetadataSubject,
  type PublicationUpdate,
} from "#src/db/schema.js";
import { type ValidationIssue } from "#src/lib/middleware/validation-errors.js";
import { emptyToNull } from "#src/lib/utils/string.js";
import { type Repositories } from "#v1/db-repositories/index.js";
import { z } from "@hono/zod-openapi";

type UpdatePublicationAppliedReturnType = Array<
  | "license"
  | "feedbackFormEmbedSrc"
  | "socialPostsEmbedSrc"
  | "slug"
  | "subjects"
>;

type UpdatePublicationBody = PublicationUpdate & {
  subjects?: DoiMetadataSubject[];
};

type UpdatePublicationErrorsReturnType = Partial<
  Record<UpdatePublicationAppliedReturnType[number], ValidationIssue>
>;

const HttpsSchema = z.url({ protocol: /^https$/ }).nullable();

export async function updatePublication(
  publicationId: string,
  body: UpdatePublicationBody,
  isStrict: boolean,
  repos: Repositories
): Promise<{
  applied: UpdatePublicationAppliedReturnType;
  fieldErrors: UpdatePublicationErrorsReturnType;
}> {
  const pubSetClauses: PublicationUpdate = {};
  const fieldErrors: UpdatePublicationErrorsReturnType = {};
  let subjects: DoiMetadataSubject[] | undefined;

  if (isStrict) {
    if ("license" in body && body.license != null) {
      fieldErrors.license = {
        message: "Cannot modify license after publication",
        path: ["license"],
      };
    }
    if (body.slug != null) {
      fieldErrors.slug = {
        message: "Cannot modify slug after publication",
        path: ["slug"],
      };
    }
    if (body.subjects != null) {
      fieldErrors.subjects = {
        message: "Cannot modify subjects after publication",
        path: ["subjects"],
      };
    }
  } else {
    if ("license" in body && body.license != null) {
      pubSetClauses.license = body.license;
    }
    if (body.slug != null) {
      pubSetClauses.slug = body.slug;
    }
    if (body.subjects != null) {
      subjects = body.subjects;
    }
  }

  if (body.feedbackFormEmbedSrc !== undefined) {
    const value = emptyToNull(body.feedbackFormEmbedSrc);
    const result = HttpsSchema.safeParse(value);
    if (!isStrict || result.success) {
      pubSetClauses.feedbackFormEmbedSrc = value;
    } else {
      fieldErrors.feedbackFormEmbedSrc = {
        message:
          "Once published, all feedback form urls must be valid to be saved.",
        path: ["feedbackFormEmbedSrc"],
      };
    }
  }
  if (body.socialPostsEmbedSrc !== undefined) {
    const value = emptyToNull(body.socialPostsEmbedSrc);
    const result = HttpsSchema.safeParse(value);
    if (!isStrict || result.success) {
      pubSetClauses.socialPostsEmbedSrc = value;
    } else {
      fieldErrors.socialPostsEmbedSrc = {
        message:
          "Once published, all social post urls must be valid to be saved.",
        path: ["socialPostsEmbedSrc"],
      };
    }
  }

  if (Object.keys(pubSetClauses).length > 0) {
    await repos.publications.update(publicationId, pubSetClauses);
  }
  const applied = Object.keys(
    pubSetClauses
  ) as UpdatePublicationAppliedReturnType;

  if (subjects) {
    // The repository only writes to a DRAFT publication, so this also catches
    // one published since it was loaded, and a deleted one.
    if (
      await repos.publications.updateDoiMetadataSubjects(
        publicationId,
        subjects
      )
    ) {
      applied.push("subjects");
    } else {
      fieldErrors.subjects = {
        message: "Can only modify subjects while the publication is a draft",
        path: ["subjects"],
      };
    }
  }

  return { applied, fieldErrors };
}
