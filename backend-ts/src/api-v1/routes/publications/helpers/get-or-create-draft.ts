import { type Publication, type Version } from "#src/db/schema.js";
import { type Repositories } from "#v1/db-repositories/index.js";

type GetOrCreateDraftResult =
  | { status: "existing" | "created"; draft: Version }
  | { status: "missing-latest-version" };

export async function getOrCreateDraft(
  repos: Repositories,
  publication: Publication
): Promise<GetOrCreateDraftResult> {
  const existing = await repos.versions.findDraftForPublication(publication.id);

  if (existing) {
    return { status: "existing", draft: existing };
  }

  const latestVersion = await repos.versions.findByVersionNumberOfPublication(
    publication.id,
    publication.latestVersionNumber
  );

  if (!latestVersion) {
    return { status: "missing-latest-version" };
  }

  try {
    const draft = await repos.transaction((txRepos) =>
      txRepos.versions.createDraftFromVersion(latestVersion)
    );
    return { status: "created", draft };
  } catch (e) {
    // A concurrent request may have created the draft first, claiming the
    // next version number.
    const raced = await repos.versions.findDraftForPublication(publication.id);
    if (raced) {
      return { status: "existing", draft: raced };
    }
    throw e;
  }
}
