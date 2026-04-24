import express from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import multer from 'multer';
import { requireAdmin, signAccess, signRefresh } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { validateUploadMeta, createUploadUrl, downloadRaw, putWebP, deleteKey, buildProductKey, PUBLIC_BASE, PRODUCTS_PREFIX, s3 } from '../services/uploader.js';
import { processToWebP } from '../services/imageProcessor.js';
import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import { authConfig, s3Config } from '../config/env.js';

const prisma = new PrismaClient();
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(Object.assign(new Error('JPG · PNG · WebP만 허용됩니다.'), { status: 400 }));
    }
    cb(null, true);
  },
});

// ========== 인증 ==========
router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = z.object({
      email: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const admin = await prisma.admin.findUnique({ where: { email } });
    if (!admin) return res.status(401).json({ error: 'invalid_credentials' });
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ error: 'invalid_credentials' });

    await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });

    res.json({
      accessToken: signAccess({ adminId: admin.id, email: admin.email, role: admin.role }),
      refreshToken: signRefresh({ adminId: admin.id }),
      admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
    });
  } catch (e) {
    if (e.name === 'ZodError') return res.status(400).json({ error: 'validation_failed' });
    next(e);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'missing_refresh_token' });
    const decoded = jwt.verify(refreshToken, authConfig.jwtRefreshSecret);
    const admin = await prisma.admin.findUnique({ where: { id: decoded.adminId } });
    if (!admin) return res.status(401).json({ error: 'admin_not_found' });
    res.json({
      accessToken: signAccess({ adminId: admin.id, email: admin.email, role: admin.role }),
      refreshToken: signRefresh({ adminId: admin.id }),
    });
  } catch (e) {
    if (e.name === 'TokenExpiredError' || e.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'invalid_refresh_token' });
    }
    next(e);
  }
});

// 이 라인 이후는 모두 인증 필요
router.use(requireAdmin);

// ========== 제품 관리 ==========
router.get('/products', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(120, Math.max(1, parseInt(req.query.limit || '30', 10)));
    const where = {};
    if (req.query.id) where.id = BigInt(req.query.id);
    if (req.query.type) where.type = req.query.type;
    if (req.query.q) {
      const q = String(req.query.q).trim();
      where.OR = [{ code: { contains: q } }, { name: { contains: q } }];
    }

    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { code: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { id: true, name: true, slug: true, type: true } },
          images: { orderBy: [{ sortOrder: 'asc' }] },
        },
      }),
    ]);

    res.json({ items: items.map(p => serializeProduct(p)), total, page, limit, hasMore: page * limit < total });
  } catch (e) { next(e); }
});

const productSchema = z.object({
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().max(255).optional().nullable(),
  type: z.enum(['forged', 'aluminum']),
  categoryId: z.number().int().positive(),
  description: z.string().trim().max(5000).optional().nullable(),
  specsJson: z.record(z.any()).optional().nullable(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

router.post('/products', async (req, res, next) => {
  try {
    const data = productSchema.parse(req.body);
    const created = await prisma.product.create({
      data, include: { category: true, images: true },
    });
    res.status(201).json(serializeProduct(created));
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'duplicate_code' });
    if (e.name === 'ZodError') return res.status(400).json({ error: 'validation_failed', issues: e.issues });
    next(e);
  }
});

router.put('/products/:id', async (req, res, next) => {
  try {
    const data = productSchema.partial().parse(req.body);
    const updated = await prisma.product.update({
      where: { id: BigInt(req.params.id) },
      data,
      include: { category: true, images: true },
    });
    res.json(serializeProduct(updated));
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'not_found' });
    if (e.name === 'ZodError') return res.status(400).json({ error: 'validation_failed', issues: e.issues });
    next(e);
  }
});

router.delete('/products/:id', async (req, res, next) => {
  try {
    const id = BigInt(req.params.id);
    const product = await prisma.product.findUnique({ where: { id }, include: { images: true } });
    if (!product) return res.status(404).json({ error: 'not_found' });

    // S3에서 이미지 파일 삭제 (best-effort)
    await Promise.allSettled(product.images.flatMap(img => [
      deleteKey(img.url).catch(() => {}),
      deleteKey(img.thumbUrl).catch(() => {}),
    ]));

    await prisma.product.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ========== 이미지 업로드 ==========
// 관리 화면용 직접 업로드: 브라우저→API→S3 경로라 S3 CORS 설정에 의존하지 않습니다.
router.post('/products/:id/images', upload.single('image'), async (req, res, next) => {
  try {
    const productId = BigInt(req.params.id);
    const { role = 'detail', caption } = req.body;
    if (!req.file) return res.status(400).json({ error: 'missing_file' });

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'product_not_found' });

    const { mainBuf, thumbBuf } = await processToWebP(req.file.buffer);
    const mainKey = buildProductKey(product.code, 'main');
    const thumbKey = mainKey.replace(/\.webp$/, '-thumb.webp');
    const [mainUrl, thumbUrl] = await Promise.all([
      putWebP(mainKey, mainBuf),
      putWebP(thumbKey, thumbBuf),
    ]);

    const maxOrder = await prisma.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    const safeRole = ['main', 'detail', 'installation'].includes(role) ? role : 'detail';

    const img = await prisma.productImage.create({
      data: {
        productId,
        url: mainUrl,
        thumbUrl,
        caption: caption || null,
        role: sortOrder === 0 && safeRole === 'detail' ? 'main' : safeRole,
        sortOrder,
      },
    });

    res.status(201).json({
      id: img.id.toString(), url: img.url, thumbUrl: img.thumbUrl,
      role: img.role, sortOrder: img.sortOrder, caption: img.caption,
    });
  } catch (e) { next(e); }
});

// 1) presigned URL 발급
router.post('/products/:id/images/upload-url', async (req, res, next) => {
  try {
    const { filename, contentType, size } = req.body;
    validateUploadMeta({ filename, contentType, size });
    const { uploadId, rawKey, uploadUrl } = await createUploadUrl({ contentType });
    // 어떤 제품에 속하는지 임시 메모리 추적은 불필요 — confirm에서 productId 넘김
    res.json({ uploadId, rawKey, uploadUrl, expiresIn: 300 });
  } catch (e) { next(e); }
});

// 2) 업로드 완료 확인 → 서버가 원본 다운로드 → sharp 변환 → WebP·썸네일 S3 업로드 → DB 등록
router.post('/products/:id/images/confirm', async (req, res, next) => {
  try {
    const productId = BigInt(req.params.id);
    const { uploadId, rawKey: clientRawKey, role = 'detail', caption } = req.body;
    if (!uploadId && !clientRawKey) return res.status(400).json({ error: 'missing_upload_id' });

    const rawKey = clientRawKey || `uploads/raw/${uploadId}.jpg`; // 확장자 추정: client가 정확한 rawKey를 주는 것이 안전
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'product_not_found' });

    const raw = await downloadRaw(rawKey);
    const { mainBuf, thumbBuf } = await processToWebP(raw);

    const mainKey = buildProductKey(product.code, 'main');
    const thumbKey = mainKey.replace(/\.webp$/, '-thumb.webp');
    const [mainUrl, thumbUrl] = await Promise.all([
      putWebP(mainKey, mainBuf),
      putWebP(thumbKey, thumbBuf),
    ]);

    // 원본 raw 삭제 (best-effort)
    s3.send(new DeleteObjectCommand({ Bucket: s3Config.bucket, Key: rawKey })).catch(() => {});

    const maxOrder = await prisma.productImage.aggregate({
      where: { productId },
      _max: { sortOrder: true },
    });
    const sortOrder = (maxOrder._max.sortOrder ?? -1) + 1;
    const safeRole = ['main', 'detail', 'installation'].includes(role) ? role : 'detail';

    const img = await prisma.productImage.create({
      data: {
        productId,
        url: mainUrl,
        thumbUrl: thumbUrl,
        caption: caption || null,
        role: sortOrder === 0 && safeRole === 'detail' ? 'main' : safeRole,
        sortOrder,
      },
    });

    res.status(201).json({
      id: img.id.toString(), url: img.url, thumbUrl: img.thumbUrl,
      role: img.role, sortOrder: img.sortOrder, caption: img.caption,
    });
  } catch (e) { next(e); }
});

router.put('/products/:pid/images/:iid', async (req, res, next) => {
  try {
    const { role, caption, sortOrder } = req.body;
    const data = {};
    if (role && ['main', 'detail', 'installation'].includes(role)) data.role = role;
    if (caption !== undefined) data.caption = caption || null;
    if (typeof sortOrder === 'number') data.sortOrder = sortOrder;

    // 'main'으로 지정 시 기존 main을 detail로 강등
    if (data.role === 'main') {
      await prisma.productImage.updateMany({
        where: { productId: BigInt(req.params.pid), role: 'main' },
        data: { role: 'detail' },
      });
    }

    const updated = await prisma.productImage.update({
      where: { id: BigInt(req.params.iid) },
      data,
    });
    res.json({ ...updated, id: updated.id.toString(), productId: updated.productId.toString() });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'not_found' });
    next(e);
  }
});

router.delete('/products/:pid/images/:iid', async (req, res, next) => {
  try {
    const img = await prisma.productImage.findUnique({ where: { id: BigInt(req.params.iid) } });
    if (!img) return res.status(404).json({ error: 'not_found' });
    await Promise.allSettled([deleteKey(img.url), deleteKey(img.thumbUrl)]);
    await prisma.productImage.delete({ where: { id: img.id } });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ========== 문의 관리 ==========
router.get('/inquiries', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.productCode) where.productCode = req.query.productCode;

    const [total, items] = await Promise.all([
      prisma.inquiry.count({ where }),
      prisma.inquiry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    res.json({
      items: items.map(i => ({ ...i, id: i.id.toString() })),
      total, page, limit, hasMore: page * limit < total,
    });
  } catch (e) { next(e); }
});

router.put('/inquiries/:id', async (req, res, next) => {
  try {
    const { status, adminNote } = req.body;
    const data = {};
    if (status && ['new', 'contacted', 'completed', 'rejected'].includes(status)) data.status = status;
    if (adminNote !== undefined) data.adminNote = adminNote || null;

    const updated = await prisma.inquiry.update({
      where: { id: BigInt(req.params.id) },
      data,
    });
    res.json({ ...updated, id: updated.id.toString() });
  } catch (e) {
    if (e.code === 'P2025') return res.status(404).json({ error: 'not_found' });
    next(e);
  }
});

// ========== Helper ==========
function serializeProduct(p) {
  const main = p.images.find(i => i.role === 'main') || p.images[0];
  return {
    id: p.id.toString(), code: p.code, name: p.name,
    type: p.type, categoryId: p.categoryId,
    category: p.category?.name, categorySlug: p.category?.slug,
    description: p.description, specsJson: p.specsJson, specs: p.specsJson,
    isActive: p.isActive, isFeatured: p.isFeatured, sortOrder: p.sortOrder,
    thumbUrl: main?.thumbUrl || null, mainImage: main?.url || null,
    images: p.images.map(i => ({
      id: i.id.toString(), url: i.url, thumbUrl: i.thumbUrl,
      caption: i.caption, role: i.role, sortOrder: i.sortOrder,
    })),
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

export default router;
