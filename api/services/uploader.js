import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuid } from 'uuid';

export const s3 = new S3Client({ region: process.env.AWS_REGION || 'ap-northeast-2' });
export const BUCKET = process.env.S3_BUCKET;
export const PUBLIC_BASE = (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, '');
export const PRODUCTS_PREFIX = (process.env.S3_PRODUCTS_PREFIX || 'assets/products').replace(/^\/+|\/+$/g, '');

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024;

export function validateUploadMeta({ filename, contentType, size }) {
  if (!filename || !contentType) throw Object.assign(new Error('filename과 contentType이 필요합니다.'), { status: 400 });
  if (!ALLOWED_MIME.includes(contentType)) throw Object.assign(new Error('JPG · PNG · WebP만 허용됩니다.'), { status: 400 });
  if (size && size > MAX_SIZE) throw Object.assign(new Error('파일은 최대 10MB까지 업로드 가능합니다.'), { status: 400 });
}

// 업로드용 presigned PUT URL (raw/<uuid>.<ext>로 업로드)
export async function createUploadUrl({ contentType }) {
  const ext = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
  const uploadId = uuid();
  const rawKey = `uploads/raw/${uploadId}.${ext}`;
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key: rawKey, ContentType: contentType });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 * 5 });
  return { uploadId, rawKey, uploadUrl };
}

// 업로드된 원본 다운로드 (서버측에서 sharp 변환용)
export async function downloadRaw(rawKey) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: rawKey }));
  const chunks = [];
  for await (const ch of res.Body) chunks.push(ch);
  return Buffer.concat(chunks);
}

// WebP 파일을 S3에 공개로 업로드
export async function putWebP(key, buffer) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'image/webp',
    CacheControl: 'max-age=31536000, public, immutable',
  }));
  return PUBLIC_BASE ? `${PUBLIC_BASE}/${key}` : key;
}

export async function deleteKey(key) {
  if (!key || /^https?:\/\//i.test(String(key))) return;
  // key가 풀 URL이면 접두사 제거
  if (PUBLIC_BASE && key.startsWith(PUBLIC_BASE)) key = key.slice(PUBLIC_BASE.length + 1);
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

export function buildProductKey(productCode, variant) {
  const base = `${PRODUCTS_PREFIX}/${productCode}/${uuid()}`;
  return variant === 'thumb' ? `${base}-thumb.webp` : `${base}.webp`;
}
