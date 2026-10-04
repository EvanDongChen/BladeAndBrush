import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

/**
 * PNG storage. Without bucket env (local dev) data URLs pass through
 * untouched and land in the row directly. With BUCKET_* configured (Render),
 * bytes go to the S3-compatible bucket (Tigris) and the public URL is stored.
 */
export async function storePng(pngDataUrl: string): Promise<string> {
  const { BUCKET_ENDPOINT, BUCKET_NAME, BUCKET_ACCESS_KEY, BUCKET_SECRET_KEY, BUCKET_PUBLIC_BASE } =
    process.env;
  const configured = [BUCKET_ENDPOINT, BUCKET_NAME, BUCKET_ACCESS_KEY, BUCKET_SECRET_KEY];
  if (configured.every((v) => !v)) return pngDataUrl;
  if (configured.some((v) => !v)) throw new Error('Bucket is only partly configured');

  const m = /^data:(image\/(?:png|jpeg));base64,(.+)$/u.exec(pngDataUrl);
  if (!m) throw new Error('png must be a PNG/JPEG data URL');
  const ext = m[1] === 'image/jpeg' ? 'jpg' : 'png';
  const key = `paintings/${randomUUID()}.${ext}`;
  const client = new S3Client({
    region: 'auto',
    endpoint: BUCKET_ENDPOINT,
    forcePathStyle: true,
    credentials: { accessKeyId: BUCKET_ACCESS_KEY as string, secretAccessKey: BUCKET_SECRET_KEY as string },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: Buffer.from(m[2], 'base64'),
      ContentType: m[1],
    }),
  );
  const base = BUCKET_PUBLIC_BASE ?? `${BUCKET_ENDPOINT}/${BUCKET_NAME}`;
  return `${base}/${key}`;
}
