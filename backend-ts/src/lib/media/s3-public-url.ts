import { ConfigError, getConfig } from "#src/config.js";
import { _s3BucketName } from "./s3-bucket-name.js";

// Base URL used when constructing the public URL for an object, e.g.
// "https://bucket.s3.amazonaws.com", "http://localhost:9000/bucket" for a
// path-style S3-compatible endpoint, or AWS_S3_PUBLIC_BASE_URL as-is
// (e.g. "http://raven-dev-media.web.localhost:3902" for Garage's web
// endpoint, which picks the bucket from the Host header).
export function _s3PublicBaseUrl(bucket: string): string {
  const cfg = getConfig();
  if (cfg.AWS_S3_PUBLIC_BASE_URL) {
    if (!URL.canParse(cfg.AWS_S3_PUBLIC_BASE_URL)) {
      throw new ConfigError("AWS_S3_PUBLIC_BASE_URL", "Not a valid URL");
    }
    return cfg.AWS_S3_PUBLIC_BASE_URL;
  }
  if (cfg.AWS_S3_PUBLIC_ENDPOINT) {
    const endpoint = cfg.AWS_S3_PUBLIC_ENDPOINT;
    try {
      return new URL(bucket, `${endpoint}/`).toString();
    } catch (e) {
      throw new ConfigError("AWS_S3_PUBLIC_ENDPOINT", "Not a valid URL", {
        cause: e,
      });
    }
  }
  return `https://${bucket}.s3.amazonaws.com`;
}

export function getS3PublicUrl(key: string): string {
  const bucket = _s3BucketName();
  return `${_s3PublicBaseUrl(bucket)}/${key}`;
}
