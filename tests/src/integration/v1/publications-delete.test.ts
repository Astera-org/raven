import { describe, expect, it } from "vitest";
import {
  failDataciteDelete,
  getDataciteMockCalls,
  query,
  registerUserWithId,
  resetDataciteMock,
  seedDoiMintingOrg,
  seedOrgMember,
  seedSiteAdmin,
  type DataciteMockCall,
} from "./helpers.js";

async function createMintingPublication(slug: string) {
  const { client, user, userId, userIds } = await registerUserWithId();
  await seedSiteAdmin(userId);
  await client.login(user.username, user.password);

  const createResp = await client.post("/api/v1/publications").send({
    slug,
    title: "Delete Test Publication",
    abstract: "Abstract text.",
    body: "Body text.",
  });
  expect(createResp.status).toBe(201);
  const publicationId: string = createResp.body.publicationId;

  const { orgId, orgIdInt } = await seedDoiMintingOrg(
    "Delete Test Org",
    `${slug}-org`
  );
  await seedOrgMember(orgIdInt, userIds);
  const patchResp = await client
    .patch(`/api/v1/publications/id/${publicationId}/draft`)
    .send({
      orgs: [{ orgId }],
      contributors: [
        {
          userId: user.id,
          roles: ["author"],
          inByline: true,
          affiliations: [],
        },
      ],
    });
  expect(patchResp.status).toBe(200);

  return { client, publicationId };
}

function doisWithEvent(calls: DataciteMockCall[], event: string) {
  return calls
    .filter(
      (call) =>
        call.method === "PUT" &&
        call.body?.data?.attributes?.["event"] === event
    )
    .map((call) => call.doi);
}

describe("DELETE /api/v1/publications/id/:id", () => {
  it("permanently removes a never-published publication and its draft DOIs", async () => {
    const slug = "never-published-pub";
    const { client, publicationId } = await createMintingPublication(slug);

    const doiResp = await client.post(
      `/api/v1/publications/id/${publicationId}/doi`
    );
    expect(doiResp.status).toBe(200);
    const draftDois = [doiResp.body.doi, doiResp.body.versionDoi].filter(
      Boolean
    );
    expect(draftDois.length).toBeGreaterThan(0);

    await resetDataciteMock();
    const deleteResp = await client.delete(
      `/api/v1/publications/id/${publicationId}`
    );
    expect(deleteResp.status).toBe(204);

    expect(
      await query(`SELECT 1 FROM publications WHERE id = '${publicationId}'`)
    ).toHaveLength(0);
    expect(
      await query(
        `SELECT 1 FROM versions WHERE publication_id = '${publicationId}'`
      )
    ).toHaveLength(0);

    const deletes = (await getDataciteMockCalls()).filter(
      (call) => call.method === "DELETE"
    );
    expect(deletes.map((call) => call.doi).sort()).toEqual(draftDois.sort());
    expect(deletes.every((call) => call.status === 204)).toBe(true);

    // The slug is free again.
    const recreateResp = await client.post("/api/v1/publications").send({
      slug,
      title: "Reused Slug",
      abstract: "Abstract text.",
      body: "Body text.",
    });
    expect(recreateResp.status).toBe(201);
  });

  it("keeps a never-published publication when DataCite fails, and a retry finishes the delete", async () => {
    const slug = "datacite-failure-pub";
    const { client, publicationId } = await createMintingPublication(slug);

    const doiResp = await client.post(
      `/api/v1/publications/id/${publicationId}/doi`
    );
    expect(doiResp.status).toBe(200);
    const conceptDoi: string = doiResp.body.doi;
    const versionDoi: string = doiResp.body.versionDoi;
    expect(conceptDoi).toBeTruthy();
    expect(versionDoi).toBeTruthy();

    // The concept DOI is deleted, then the version DOI fails.
    await resetDataciteMock();
    await failDataciteDelete(versionDoi);
    const failedResp = await client.delete(
      `/api/v1/publications/id/${publicationId}`
    );
    expect(failedResp.status).toBe(502);
    expect(
      (await getDataciteMockCalls()).map((call) => [call.doi, call.status])
    ).toEqual([
      [conceptDoi, 204],
      [versionDoi, 500],
    ]);
    expect(
      await query(`SELECT 1 FROM publications WHERE id = '${publicationId}'`)
    ).toHaveLength(1);
    expect(
      await query(
        `SELECT 1 FROM versions WHERE publication_id = '${publicationId}'`
      )
    ).toHaveLength(1);

    // Retrying once DataCite recovers: the already-deleted concept DOI
    // (404) counts as gone, so the delete completes.
    await resetDataciteMock();
    const retryResp = await client.delete(
      `/api/v1/publications/id/${publicationId}`
    );
    expect(retryResp.status).toBe(204);
    expect(
      (await getDataciteMockCalls()).map((call) => [call.doi, call.status])
    ).toEqual([
      [conceptDoi, 404],
      [versionDoi, 204],
    ]);
    expect(
      await query(`SELECT 1 FROM publications WHERE id = '${publicationId}'`)
    ).toHaveLength(0);
  });

  it("hides a deleted publication's DOIs, and republishing makes them findable again", async () => {
    const slug = "published-then-deleted";
    const { client, publicationId } = await createMintingPublication(slug);

    const v1Publish = await client.post(
      `/api/v1/publications/id/${publicationId}/versions`
    );
    expect(v1Publish.status).toBe(201);
    const canonicalDoi: string = v1Publish.body.doi;
    const v1VersionDoi: string = v1Publish.body.versionDoi;
    expect(canonicalDoi).toBeTruthy();
    expect(v1VersionDoi).toBeTruthy();

    // Deleting a published publication keeps it, but hides its DOIs.
    await resetDataciteMock();
    const deleteResp = await client.delete(
      `/api/v1/publications/id/${publicationId}`
    );
    expect(deleteResp.status).toBe(204);
    const [deleted] = await query<{ state: string }>(
      `SELECT state FROM publications WHERE id = '${publicationId}'`
    );
    expect(deleted?.state).toBe("DELETED");
    const deleteCalls = await getDataciteMockCalls();
    expect(doisWithEvent(deleteCalls, "hide")).toEqual([
      canonicalDoi,
      v1VersionDoi,
    ]);
    expect((await client.get(`/api/v1/publications/p/${slug}`)).status).toBe(
      200
    );

    // Publishing a new version brings it back and makes its DOIs findable.
    const draftResp = await client.post(
      `/api/v1/publications/id/${publicationId}/draft`
    );
    expect(draftResp.status).toBe(201);
    await resetDataciteMock();
    const v2Publish = await client
      .post(`/api/v1/publications/id/${publicationId}/versions`)
      .send({ note: "Back again." });
    expect(v2Publish.status).toBe(201);
    expect(v2Publish.body.versionNumber).toBe(2);
    const [republished] = await query<{ state: string }>(
      `SELECT state FROM publications WHERE id = '${publicationId}'`
    );
    expect(republished?.state).toBe("PUBLISHED");

    const publishCalls = await getDataciteMockCalls();
    const madeFindable = doisWithEvent(publishCalls, "publish");
    expect(madeFindable).toEqual(
      expect.arrayContaining([canonicalDoi, v1VersionDoi])
    );
    expect(doisWithEvent(publishCalls, "hide")).toHaveLength(0);
  });

  it("is a no-op for an already-deleted publication", async () => {
    const { client, publicationId } =
      await createMintingPublication("deleted-twice-pub");
    expect(
      (await client.post(`/api/v1/publications/id/${publicationId}/versions`))
        .status
    ).toBe(201);
    expect(
      (await client.delete(`/api/v1/publications/id/${publicationId}`)).status
    ).toBe(204);

    await resetDataciteMock();
    expect(
      (await client.delete(`/api/v1/publications/id/${publicationId}`)).status
    ).toBe(204);
    expect(await getDataciteMockCalls()).toHaveLength(0);
  });
});
