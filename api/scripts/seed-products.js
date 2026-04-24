/**
 * 엑셀 기반 제품 시드 스크립트
 *
 * 역할:
 * 1) `신한하우징 제품/신한하우징_제품목록.xlsx`에서 제품·카테고리 메타데이터 파싱
 * 2) `신한하우징_제품이미지/` 폴더를 재귀 스캔하여 제품명 ↔ 파일 매핑
 * 3) 각 이미지를 sharp로 WebP·썸네일 변환 후 S3 업로드
 * 4) Product + ProductImage 레코드 생성 (upsert)
 *
 * 실행:
 *   node scripts/seed-categories.js   # 먼저 카테고리 시드
 *   node scripts/seed-products.js
 *
 * 재실행 시 이미 DB에 있는 제품 코드는 건너뛰고 신규만 추가합니다.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { PrismaClient } from '@prisma/client';
import { processToWebP } from '../services/imageProcessor.js';
import { putWebP, buildProductKey } from '../services/uploader.js';
import { CATEGORY_NAME_MAP } from './seed-categories.js';

const prisma = new PrismaClient();

const SEED_SOURCE_XLSX = process.env.SEED_SOURCE_XLSX || '../신한하우징 제품/신한하우징_제품목록.xlsx';
const SEED_IMAGE_ROOT = process.env.SEED_IMAGE_ROOT || '../신한하우징 제품/신한하우징_제품이미지';
const SHEET_TYPES = [
  { sheetName: '단조제품', type: 'forged' },
  { sheetName: '알루미늄제품', type: 'aluminum' },
];

function cleanCell(value) {
  return String(value ?? '').trim();
}

function normalizeKey(value) {
  return cleanCell(value)
    .normalize('NFC')
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

function keyVariants(value) {
  const raw = cleanCell(value).replace(/\.[^.]+$/, '');
  if (!raw) return [];

  const variants = new Set([raw]);
  variants.add(raw.split(/[\s_,]/)[0]);
  variants.add(raw.replace(/\([^)]*\)/g, ''));
  variants.add(raw.split(/[([]/)[0]);

  const modelMatches = raw.match(/[A-Z]{1,8}[A-Z0-9]*-\d+[A-Z가-힣]*/gi) || [];
  for (const match of modelMatches) variants.add(match);

  return [...variants].map(normalizeKey).filter(Boolean);
}

// 엑셀 시트에서 제품 목록 파싱
function parseProductsFromExcel() {
  const workbook = XLSX.readFile(path.resolve(SEED_SOURCE_XLSX));
  const rawProducts = [];

  for (const { sheetName, type } of SHEET_TYPES) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) throw new Error(`엑셀 시트를 찾을 수 없습니다: ${sheetName}`);

    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    let rowIndex = rows.findIndex(row => cleanCell(row[1]) === '제품번호');
    if (rowIndex === -1) throw new Error(`${sheetName} 시트의 헤더 행을 찾을 수 없습니다.`);

    for (rowIndex += 1; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      if (cleanCell(row[0]).startsWith('▶')) continue;

      const no = cleanCell(row[1]);
      const productName = cleanCell(row[2]);
      const categoryKo = cleanCell(row[4]);
      if (!no || !productName || !categoryKo) continue;

      const categorySlug = CATEGORY_NAME_MAP[type]?.[categoryKo];
      if (!categorySlug) {
        console.warn(`  ⚠ 알 수 없는 카테고리 '${sheetName}/${categoryKo}'`);
        continue;
      }

      rawProducts.push({
        no: parseInt(no, 10),
        productNo: no,
        codeBase: productName,
        name: productName,
        type,
        categoryKo,
        categorySlug,
      });
    }
  }

  const nameCounts = rawProducts.reduce((acc, p) => acc.set(p.codeBase, (acc.get(p.codeBase) || 0) + 1), new Map());
  return rawProducts.map(p => ({
    ...p,
    code: nameCounts.get(p.codeBase) > 1 ? `${p.codeBase}-${p.productNo}` : p.codeBase,
  }));
}

// 이미지 폴더 재귀 스캔: { 파일명(소문자 기본, 확장자 제거) → 전체 경로 }
async function scanImages(root) {
  const map = new Map();
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (/\.(jpe?g|png|webp)$/i.test(e.name)) {
        for (const k of keyVariants(e.name)) {
          if (!map.has(k)) map.set(k, []);
          map.get(k).push(full);
        }
      }
    }
  }
  await walk(path.resolve(root));
  return map;
}

async function processAndUpload(filePath, productCode) {
  const buf = await fs.readFile(filePath);
  const { mainBuf, thumbBuf } = await processToWebP(buf);
  const mainKey = buildProductKey(productCode, 'main');
  const thumbKey = mainKey.replace(/\.webp$/, '-thumb.webp');
  const [mainUrl, thumbUrl] = await Promise.all([
    putWebP(mainKey, mainBuf),
    putWebP(thumbKey, thumbBuf),
  ]);
  return { mainUrl, thumbUrl };
}

function parseSpecsFromFilename(filename) {
  const specs = {};
  const widthM = filename.match(/W(\d{3,4})/i);
  const heightM = filename.match(/H(\d{3,4})/i);
  if (widthM) specs.width = widthM[1];
  if (heightM) specs.height = heightM[1];
  return specs;
}

function isInstallation(filename) {
  return /설치사례|설치\s*사례|installation/i.test(filename);
}

async function main() {
  console.log('▶ 제품 시드 시작…\n');

  const products = parseProductsFromExcel();
  console.log(`✓ 엑셀에서 ${products.length}개 제품 메타데이터 파싱 완료.`);

  const imageMap = await scanImages(SEED_IMAGE_ROOT);
  console.log(`✓ 이미지 ${imageMap.size}개 코드 후보로 스캔 완료.\n`);

  const categories = await prisma.category.findMany();
  const catByKey = new Map(categories.map(c => [`${c.type}/${c.slug}`, c.id]));

  const seen = new Set();
  let created = 0, skipped = 0, imagesCreated = 0, errors = 0;

  for (const p of products) {
    if (seen.has(p.code)) continue;
    seen.add(p.code);

    const categoryId = catByKey.get(`${p.type}/${p.categorySlug}`);
    if (!categoryId) { console.warn(`  ⚠ 카테고리 누락: ${p.code} (${p.type}/${p.categorySlug})`); continue; }

    // 이미지 파일 찾기: DB 고유 코드가 아닌 엑셀 제품명을 기준으로 매칭
    const keys = [...new Set([...keyVariants(p.name), ...keyVariants(p.codeBase)])];
    let files = null;
    for (const k of keys) { if (imageMap.has(k)) { files = imageMap.get(k); break; } }
    if (!files || !files.length) { skipped++; continue; }

    // 제품 upsert
    let product;
    try {
      product = await prisma.product.upsert({
        where: { code: p.code },
        update: {
          name: p.name,
          type: p.type,
          categoryId,
          sortOrder: 9999 - p.no,
        },
        create: {
          code: p.code,
          name: p.name,
          type: p.type,
          categoryId,
          sortOrder: 9999 - p.no,
        },
      });
    } catch (e) {
      console.error(`  ❌ 제품 생성 실패 ${p.code}: ${e.message}`);
      errors++;
      continue;
    }

    // 이미지가 이미 있으면 스킵
    const existingImgCount = await prisma.productImage.count({ where: { productId: product.id } });
    if (existingImgCount > 0) { skipped++; continue; }

    created++;
    process.stdout.write(`\r  처리 중: ${created}/${products.length} · ${p.code} (${files.length}장)      `);

    let sortOrder = 0;
    let mainAssigned = false;
    for (const file of files) {
      try {
        const { mainUrl, thumbUrl } = await processAndUpload(file, p.code);
        const role = isInstallation(path.basename(file)) ? 'installation' : (!mainAssigned ? 'main' : 'detail');
        if (role === 'main') mainAssigned = true;

        const specs = parseSpecsFromFilename(path.basename(file));
        await prisma.productImage.create({
          data: {
            productId: product.id, url: mainUrl, thumbUrl,
            caption: role === 'installation' ? path.basename(file).replace(/\.[^.]+$/, '') : null,
            role, sortOrder: sortOrder++,
          },
        });
        imagesCreated++;

        if (role === 'main' && Object.keys(specs).length) {
          await prisma.product.update({ where: { id: product.id }, data: { specsJson: specs } });
        }
      } catch (e) {
        console.error(`\n  ❌ 이미지 실패 ${path.basename(file)}: ${e.message}`);
        errors++;
      }
    }
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  시드 완료`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  · 신규 제품: ${created}`);
  console.log(`  · 스킵 (이미지 없음·기등록): ${skipped}`);
  console.log(`  · 업로드된 이미지: ${imagesCreated}`);
  if (errors) console.log(`  ⚠  오류: ${errors}`);
  console.log('');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
