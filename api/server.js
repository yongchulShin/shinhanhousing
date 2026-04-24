import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import pino from 'pino';
import { isProduction, serverConfig } from './config/env.js';

import publicRoutes from './routes/public.js';
import inquiryRoutes from './routes/inquiries.js';
import adminRoutes from './routes/admin.js';

const logger = pino({ level: serverConfig.logLevel });
const app = express();

app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin(origin, cb) {
    if (!origin || serverConfig.allowedOrigins.length === 0 || serverConfig.allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('CORS: origin not allowed: ' + origin));
  },
  credentials: true,
}));

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(pinoHttp({ logger, customLogLevel: (_, res, err) => err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info' }));

// BigInt JSON 직렬화 (Prisma Product.id 등)
BigInt.prototype.toJSON = function () { return this.toString(); };

// Health check
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// Public routes
app.use('/api', publicRoutes);
app.use('/api/inquiries', inquiryRoutes);

// Admin routes (JWT-protected 내부)
app.use('/api/admin', adminRoutes);

// 404
app.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));

// Error handler
app.use((err, req, res, _next) => {
  req.log?.error({ err }, 'request failed');
  const status = err.status || 500;
  res.status(status).json({
    error: err.code || 'internal_error',
    message: isProduction && status === 500 ? 'Internal Server Error' : err.message,
  });
});

app.listen(serverConfig.port, () => logger.info(`Shinhan Housing API listening on :${serverConfig.port}`));
