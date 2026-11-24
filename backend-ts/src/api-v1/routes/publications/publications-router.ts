import type { AppEnv } from "#src/types/hono.js";
import { OpenAPIHono } from "@hono/zod-openapi";
import { deleteDraftHandler, deleteDraftRoute } from "./delete-draft.js";
import {
  deletePublicationHandler,
  deletePublicationRoute,
} from "./delete-publication.js";
import {
  getCandidateOrgsHandler,
  getCandidateOrgsRoute,
} from "./get-candidate-orgs.js";
import {
  getDoiEligibilityHandler,
  getDoiEligibilityRoute,
} from "./get-doi-eligibility.js";
import { getDoiHandler, getDoiRoute } from "./get-doi.js";
import {
  getDraftBibliographyHandler,
  getDraftBibliographyRoute,
} from "./get-draft-bibliography.js";
import {
  getDraftContentHandler,
  getDraftContentRoute,
} from "./get-draft-content.js";
import { getDraftHandler, getDraftRoute } from "./get-draft.js";
import { getDraftsHandler, getDraftsRoute } from "./get-drafts.js";
import {
  getPublicationByIdHandler,
  getPublicationByIdRoute,
} from "./get-publication-by-id.js";
import {
  getPublicationBySlugHandler,
  getPublicationBySlugRoute,
} from "./get-publication-by-slug.js";
import {
  getPublicationVersionByIdHandler,
  getPublicationVersionByIdRoute,
} from "./get-publication-version-by-id.js";
import {
  getPublicationVersionBySlugHandler,
  getPublicationVersionBySlugRoute,
} from "./get-publication-version-by-slug.js";
import {
  getPublicationsHandler,
  getPublicationsRoute,
} from "./get-publications.js";
import { patchDraftHandler, patchDraftRoute } from "./patch-draft.js";
import {
  patchPublicationHandler,
  patchPublicationRoute,
} from "./patch-publication.js";
import { postDoiHandler, postDoiRoute } from "./post-doi.js";
import {
  postDraftByIdHandler,
  postDraftByIdRoute,
} from "./post-draft-by-id.js";
import {
  postDraftBySlugHandler,
  postDraftBySlugRoute,
} from "./post-draft-by-slug.js";
import {
  postDraftMediaAssetHandler,
  postDraftMediaAssetRoute,
} from "./post-draft-media-asset.js";
import {
  postPublicationsHandler,
  postPublicationsRoute,
} from "./post-publications.js";
import { postPublishHandler, postPublishRoute } from "./post-publish.js";
import { postVersionHandler, postVersionRoute } from "./post-version.js";
import { putDoiHandler, putDoiRoute } from "./put-doi.js";
import {
  putDraftBibliographyHandler,
  putDraftBibliographyRoute,
} from "./put-draft-bibliography.js";
import {
  putDraftContentHandler,
  putDraftContentRoute,
} from "./put-draft-content.js";

const app = new OpenAPIHono<AppEnv>();

const publicationsRouter = app
  /** No existing publication specified */

  // GET /
  .openapi(getPublicationsRoute, getPublicationsHandler)
  // POST /
  .openapi(postPublicationsRoute, postPublicationsHandler)
  // GET /drafts (deprecated: GET /users/me/publications?state=draft)
  .openapi(getDraftsRoute, getDraftsHandler)

  /** Existing publication by ID */

  // GET /id/{id}
  .openapi(getPublicationByIdRoute, getPublicationByIdHandler)
  // PATCH /id/{id} (deprecated: PATCH /id/{id}/draft)
  .openapi(patchPublicationRoute, patchPublicationHandler)
  // DELETE /id/{id}
  .openapi(deletePublicationRoute, deletePublicationHandler)
  // GET /id/{id}/draft
  .openapi(getDraftRoute, getDraftHandler)
  // PATCH /id/{id}/draft
  .openapi(patchDraftRoute, patchDraftHandler)
  // POST /id/{id}/draft
  .openapi(postDraftByIdRoute, postDraftByIdHandler)
  // DELETE /id/{id}/draft
  .openapi(deleteDraftRoute, deleteDraftHandler)
  // GET /id/{id}/draft/content
  .openapi(getDraftContentRoute, getDraftContentHandler)
  // PUT /id/{id}/draft/content
  .openapi(putDraftContentRoute, putDraftContentHandler)
  // GET /id/{id}/draft/bibliography
  .openapi(getDraftBibliographyRoute, getDraftBibliographyHandler)
  // PUT /id/{id}/draft/bibliography
  .openapi(putDraftBibliographyRoute, putDraftBibliographyHandler)
  // POST /id/{id}/draft/media-assets
  .openapi(postDraftMediaAssetRoute, postDraftMediaAssetHandler)
  // POST /id/{id}/publish (deprecated: POST /id/{id}/versions)
  .openapi(postPublishRoute, postPublishHandler)
  // GET /id/{id}/candidate-orgs
  .openapi(getCandidateOrgsRoute, getCandidateOrgsHandler)
  // GET /id/{id}/doi
  .openapi(getDoiRoute, getDoiHandler)
  // GET /id/{id}/doi/eligibility
  .openapi(getDoiEligibilityRoute, getDoiEligibilityHandler)
  // PUT /id/{id}/doi - Stores an externally managed DOI in the DB
  .openapi(putDoiRoute, putDoiHandler)
  // POST /id/{id}/doi - Mints a DOI for a draft
  .openapi(postDoiRoute, postDoiHandler)
  // POST /id/{id}/versions
  .openapi(postVersionRoute, postVersionHandler)
  // GET /id/{id}/versions/{versionId}
  .openapi(getPublicationVersionByIdRoute, getPublicationVersionByIdHandler)

  /** Existing publication by slug - get only */

  // GET /p/{slug}
  .openapi(getPublicationBySlugRoute, getPublicationBySlugHandler)
  // POST /p/{slug}/draft
  .openapi(postDraftBySlugRoute, postDraftBySlugHandler)
  // GET /p/{slug}/versions/{versionId}
  .openapi(
    getPublicationVersionBySlugRoute,
    getPublicationVersionBySlugHandler
  );

export default publicationsRouter;
