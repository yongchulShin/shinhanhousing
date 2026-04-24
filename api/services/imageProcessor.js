import sharp from 'sharp';

// 상세 페이지용 최대 1200px, 카드 썸네일용 400px
const MAIN_MAX = 1200;
const THUMB_SIZE = 400;

export async function processToWebP(inputBuffer) {
  const img = sharp(inputBuffer, { failOn: 'truncated' });
  const meta = await img.metadata();
  if (!meta.width || !meta.height) {
    throw Object.assign(new Error('이미지 메타데이터를 읽을 수 없습니다.'), { status: 400 });
  }

  const mainBuf = await sharp(inputBuffer)
    .rotate()
    .resize({ width: MAIN_MAX, height: MAIN_MAX, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82, effort: 4 })
    .toBuffer();

  const thumbBuf = await sharp(inputBuffer)
    .rotate()
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'cover', position: 'centre' })
    .webp({ quality: 76, effort: 4 })
    .toBuffer();

  return { mainBuf, thumbBuf, width: meta.width, height: meta.height };
}
