// For the upstream and S3 HEAD checks before a transfer, which hold no file.
export const MEDIA_CHECK_CONCURRENCY = 10;
// Low because each transfer holds the whole file in memory until it has been
// uploaded.
export const MEDIA_TRANSFER_CONCURRENCY = 4;

export const MEDIA_IMPORT_IN_PROGRESS_MESSAGE =
  "The body can't be edited until its imported media has finished uploading";

export const UNRESOLVED_MEDIA_REF_MESSAGE =
  "The body has imported media that failed to upload; remove or replace it before publishing";
