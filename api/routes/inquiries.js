import express from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { inquiryLimiter, inquiryHourlyLimiter } from '../middleware/rateLimit.js';
import { sendInquiryNotification } from '../services/mailer.js';
import { recaptchaConfig } from '../config/env.js';

const prisma = new PrismaClient();
const router = express.Router();

const inquirySchema = z.object({
  name: z.string().trim().min(1).max(64),
  phone: z.string().trim().min(4).max(32),
  email: z.string().trim().email().max(128).optional().or(z.literal('').transform(() => undefined)),
  productCode: z.string().trim().max(64).optional().nullable(),
  productType: z.string().trim().max(64).optional().nullable(),
  message: z.string().trim().min(2).max(5000),
  recaptchaToken: z.string().trim().optional(),
});

async function verifyRecaptcha(token) {
  const secret = recaptchaConfig.secret;
  if (!secret || !token) return { ok: true, skipped: true };
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(secret)}&response=${encodeURIComponent(token)}`,
    });
    const data = await res.json();
    return { ok: data.success && (data.score === undefined || data.score > 0.3), data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// POST /api/inquiries
router.post('/', inquiryLimiter, inquiryHourlyLimiter, async (req, res, next) => {
  try {
    const parsed = inquirySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'validation_failed', issues: parsed.error.issues });
    }
    const data = parsed.data;

    const captcha = await verifyRecaptcha(data.recaptchaToken);
    if (!captcha.ok) return res.status(400).json({ error: 'captcha_failed' });

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    const ua = (req.headers['user-agent'] || '').slice(0, 500);

    const inquiry = await prisma.inquiry.create({
      data: {
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        productCode: data.productCode || null,
        productType: data.productType || null,
        message: data.message,
        ipAddress: ip,
        userAgent: ua,
      },
    });

    // 비동기로 이메일 전송 (실패해도 접수는 유지)
    sendInquiryNotification(inquiry).catch(err => req.log?.error({ err }, '이메일 전송 실패'));

    res.status(201).json({
      id: inquiry.id.toString(),
      status: inquiry.status,
      message: '문의가 접수되었습니다.',
    });
  } catch (e) { next(e); }
});

export default router;
