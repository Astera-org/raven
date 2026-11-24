import { type Repositories } from "#v1/db-repositories/index.js";
import { type DraftPublicationResponse } from "#v1/routes/publications/route-responses/publication.js";
import {
  type PublishablePublication,
  PublishablePublicationSchema,
} from "#v1/routes/publications/schemas/publishable-publication.js";
import { buildDraftPublicationResponseFromIds } from "./build-get-publication-response.js";

export async function getPublicationResponseAndReadiness(
  publicationId: string,
  draftVersionId: string
): Promise<
  | {
      publication: DraftPublicationResponse;
      readiness: ReturnType<typeof PublishablePublicationSchema.safeParse>;
      ownerId: string | null;
    }
  | {
      publication: undefined;
      readiness?: never;
      ownerId?: never;
    }
> {
  const { publication, ownerId } = await buildDraftPublicationResponseFromIds(
    publicationId,
    draftVersionId,
    { getDraft: true }
  );

  if (publication === undefined) {
    return { publication: undefined };
  }

  const readiness = PublishablePublicationSchema.safeParse(publication);

  return { publication, readiness, ownerId };
}

export async function getReadiness(
  repos: Repositories,
  publicationId: string,
  draftVersionId: string,
  inputValues?: Partial<PublishablePublication>
) {
  // Same non-blocking publish-readiness echo as PUT — see the comment there.
  const [publication, version, contributorsList, linkedAssets] =
    await Promise.all([
      repos.publications.findById(publicationId),
      repos.versions.findById(draftVersionId),
      repos.contributors.listByVersionId(draftVersionId),
      repos.versions.listLinkedAssets(draftVersionId),
    ]);

  const readiness = PublishablePublicationSchema.safeParse({
    slug: publication?.slug,
    title: version?.title,
    subtitle: version?.subtitle,
    abstract: version?.abstract,
    body: version?.body,
    versionDesc: version?.versionDesc,
    doi: publication?.doi,
    license: publication?.license,
    contributors: contributorsList,
    linkedAssets,
    socialPostsEmbedSrc: publication?.socialPostsEmbedSrc,
    feedbackFormEmbedSrc: publication?.feedbackFormEmbedSrc,
    state: publication?.state,
    ...(inputValues ?? {}),
  });
  return readiness;
}
