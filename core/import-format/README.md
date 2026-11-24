# @raven/core-import-format

The standard import format shared by Raven's backend and its importers.

- `ImportedPublicationSchema` is the result every importer returns: the
  publication, its first version, the original document, contributors, linked
  assets, and media.
- `UserRef` and `OrgRef` reference people and orgs by external identifiers
  (ORCID, email, ROR id), never Raven ids.
- `mediaRef()` builds the placeholders importers put in the body for media;
  `replaceMediaRefs()` swaps them for uploaded URLs.
- `ImportSource` and `ImporterContext` describe what an importer is given.
- `ImporterError` reports failures Raven can act on, such as
  `needs_authorization`.
- `ImportDiagnostic` reports content an importer worked around.
  `buildDiagnosticExcerpt()` keeps the text around a diagnostic's range, so
  it can still be shown after the field has been edited.

Importers list this package as a peer dependency so they share the backend's
copy (and `instanceof ImporterError` keeps working).

## Compatibility

Keep changes additive: new optional fields, context methods, source types,
and error codes. Don't rename, remove, or change the meaning of existing ones.
