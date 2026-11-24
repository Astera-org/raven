import { getConfig } from "#src/config.js";
import { logger } from "#src/lib/logger.js";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

export function triggerPdfGeneration(
  slug: string,
  versionNumber: number
): void {
  const cfg = getConfig();
  if (!cfg.PDF_QUEUE_URL) return;
  const client = new SQSClient({
    region: cfg.AWS_REGION,
    credentials: cfg.AWS_ACCESS_KEY_ID
      ? {
          accessKeyId: cfg.AWS_ACCESS_KEY_ID,
          secretAccessKey: cfg.AWS_SECRET_ACCESS_KEY,
        }
      : undefined,
  });
  client
    .send(
      new SendMessageCommand({
        QueueUrl: cfg.PDF_QUEUE_URL,
        MessageBody: JSON.stringify({ slug, versionNumber }),
      })
    )
    .catch((e) =>
      logger.error({ err: e }, "Failed to send PDF generation message")
    );
}
