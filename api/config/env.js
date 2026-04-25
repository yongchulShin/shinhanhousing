import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appEnv = process.env.APP_ENV || process.env.NODE_ENV || 'local';
const envFiles = appEnv === 'local'
  ? ['.env.local', '.env']
  : [`.env.${appEnv}`, '.env'];

for (const file of envFiles) {
  dotenv.config({ path: path.join(API_ROOT, file), override: false });
}

function list(name) {
  return (process.env[name] || '').split(',').map(value => value.trim()).filter(Boolean);
}

function int(name, fallback) {
  const value = parseInt(process.env[name] || '', 10);
  return Number.isFinite(value) ? value : fallback;
}

function bool(name, fallback = false) {
  const value = (process.env[name] || '').trim().toLowerCase();
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value);
}

export const isProduction = appEnv === 'production' || process.env.NODE_ENV === 'production';

export const serverConfig = {
  env: appEnv,
  nodeEnv: process.env.NODE_ENV || appEnv,
  port: int('PORT', 3000),
  logLevel: process.env.LOG_LEVEL || 'info',
  allowedOrigins: list('ALLOWED_ORIGINS'),
};

export const authConfig = {
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessExpires: process.env.JWT_ACCESS_EXPIRES || '1h',
  refreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
};

export const awsConfig = {
  region: process.env.AWS_REGION || 'ap-northeast-2',
};

export const s3Config = {
  bucket: process.env.S3_BUCKET,
  publicBase: (process.env.S3_PUBLIC_BASE || '').replace(/\/$/, ''),
  productsPrefix: (process.env.S3_PRODUCTS_PREFIX || 'assets/products').replace(/^\/+|\/+$/g, ''),
};

export const mailConfig = {
  provider: process.env.MAIL_PROVIDER || 'smtp',
  from: process.env.MAIL_FROM || process.env.SMTP_USER || process.env.SES_FROM,
  adminNotifyEmail: process.env.ADMIN_NOTIFY_EMAIL,
  smtp: {
    host: process.env.SMTP_HOST,
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
};

export const recaptchaConfig = {
  secret: process.env.RECAPTCHA_SECRET,
};

export const seedConfig = {
  sourceXlsx: process.env.SEED_SOURCE_XLSX || '../신한하우징 제품/신한하우징_제품목록.xlsx',
  imageRoot: process.env.SEED_IMAGE_ROOT || '../신한하우징 제품/신한하우징_제품이미지',
};
