import { getConfig } from "#src/config.js";
import { S3Client } from "@aws-sdk/client-s3";

function createS3Client(endpoint: string): S3Client {
  const cfg = getConfig();
  return new S3Client({
    region: cfg.AWS_REGION,
    credentials: cfg.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: cfg.AWS_ACCESS_KEY_ID,
          secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
    // Point at a local S3-compatible service (e.g. Garage) when configured.
    // Use path-style requests there, since per-bucket subdomains would need
    // wildcard DNS for the endpoint's host.
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(endpoint),
  });
}

export function getS3Client(): S3Client {
  return createS3Client(getConfig().AWS_S3_ENDPOINT);
}

export function getS3PresigningClient(): S3Client {
  const cfg = getConfig();
  return createS3Client(cfg.AWS_S3_PUBLIC_ENDPOINT || cfg.AWS_S3_ENDPOINT);
}
