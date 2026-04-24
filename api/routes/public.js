import express from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const router = express.Router();

// GET /api/categories
router.get('/categories', async (_req, res, next) => {
  try {
    const cats = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }],
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    res.json(cats.map(c => ({
      id: c.id, type: c.type, slug: c.slug, name: c.name, icon: c.icon,
      sortOrder: c.sortOrder, isActive: c.isActive, count: c._count.products,
    })));
  } catch (e) { next(e); }
});

// GET /api/products?type=&category=&q=&page=&limit=
router.get('/products', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(120, Math.max(1, parseInt(req.query.limit || '24', 10)));

    const where = { isActive: true };
    if (req.query.type) where.type = req.query.type;
    if (req.query.category) {
      const cat = await prisma.category.findFirst({ where: { slug: req.query.category, ...(req.query.type ? { type: req.query.type } : {}) } });
      if (cat) where.categoryId = cat.id;
      else return res.json({ items: [], total: 0, page, limit, hasMore: false });
    }
    if (req.query.q) {
      const q = String(req.query.q).trim();
      where.OR = [
        { code: { contains: q } },
        { name: { contains: q } },
      ];
    }

    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          category: { select: { name: true, slug: true, type: true } },
          images: { where: { role: 'main' }, take: 1, orderBy: { sortOrder: 'asc' } },
        },
      }),
    ]);

    const mapped = items.map(p => {
      const main = p.images[0];
      return {
        id: p.id, code: p.code, name: p.name,
        type: p.type, category: p.category.name, categorySlug: p.category.slug, categoryId: p.categoryId,
        thumbUrl: main?.thumbUrl || null, mainImage: main?.url || null,
        isFeatured: p.isFeatured,
      };
    });

    res.json({ items: mapped, total, page, limit, hasMore: page * limit < total });
  } catch (e) { next(e); }
});

// GET /api/products/:code
router.get('/products/:code', async (req, res, next) => {
  try {
    const product = await prisma.product.findUnique({
      where: { code: req.params.code },
      include: {
        category: { select: { id: true, name: true, slug: true, type: true } },
        images: { orderBy: [{ role: 'desc' }, { sortOrder: 'asc' }] },
      },
    });
    if (!product || !product.isActive) return res.status(404).json({ error: 'not_found' });

    res.json({
      id: product.id, code: product.code, name: product.name, type: product.type,
      description: product.description,
      categoryId: product.category.id, category: product.category.name, categorySlug: product.category.slug,
      specs: product.specsJson || {},
      isFeatured: product.isFeatured,
      mainImage: product.images.find(i => i.role === 'main')?.url || product.images[0]?.url || null,
      thumbUrl: product.images.find(i => i.role === 'main')?.thumbUrl || product.images[0]?.thumbUrl || null,
      images: product.images.map(i => ({
        id: i.id, url: i.url, thumbUrl: i.thumbUrl, caption: i.caption, role: i.role, sortOrder: i.sortOrder,
      })),
    });
  } catch (e) { next(e); }
});

export default router;
