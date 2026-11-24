import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { _s3BucketName } from "./s3-bucket-name.js";
import { getS3Client } from "./s3-client.js";

export async function _isObjectInS3(s3Key: string): Promise<boolean> {
  const bucket = _s3BucketName();
  const client = getS3Client();

  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: s3Key }));
    return true;
  } catch (e) {
    const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw e;
  }
}
