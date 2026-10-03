/**
 * PNG storage. v1: data URLs pass through untouched (bucket env unset).
 * Phase 2: when BUCKET_* is configured, upload bytes here and return the
 * object URL. Throws when a bucket is half-configured so the failure is loud.
 */
export async function storePng(pngDataUrl: string): Promise<string> {
  const { BUCKET_ENDPOINT, BUCKET_NAME, BUCKET_ACCESS_KEY, BUCKET_SECRET_KEY } = process.env;
  const configured = [BUCKET_ENDPOINT, BUCKET_NAME, BUCKET_ACCESS_KEY, BUCKET_SECRET_KEY];
  if (configured.every((v) => !v)) return pngDataUrl;
  if (configured.some((v) => !v)) throw new Error('Bucket is only partly configured');
  // TODO(phase 2): PUT bytes to the bucket, return the object URL.
  throw new Error('Bucket upload is not implemented yet');
}
