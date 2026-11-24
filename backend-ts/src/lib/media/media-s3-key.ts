export function mediaS3Key({
  publicationId,
  suffix,
}: {
  publicationId: string | null | undefined;
  suffix: string;
}): string {
  return publicationId
    ? `publications/${publicationId}/media_${suffix}`
    : `media/media_${suffix}`;
}
