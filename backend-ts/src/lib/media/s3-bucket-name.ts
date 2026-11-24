import { ConfigError, getConfig } from "#src/config.js";

export function _s3BucketName(): string {
  const cfg = getConfig();
  if (!cfg.AWS_S3_BUCKET_NAME) {
    throw new ConfigError(
      "AWS_S3_BUCKET_NAME",
      "Media storage is not configured. Please contact the site administrator."
    );
  }
  return cfg.AWS_S3_BUCKET_NAME;
}
