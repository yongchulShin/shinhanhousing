import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { authConfig } from '../config/env.js';

const prisma = new PrismaClient();

export function signAccess(payload) {
  return jwt.sign(payload, authConfig.jwtSecret, { expiresIn: authConfig.accessExpires });
}
export function signRefresh(payload) {
  return jwt.sign(payload, authConfig.jwtRefreshSecret, { expiresIn: authConfig.refreshExpires });
}

export async function requireAdmin(req, res, next) {
  try {
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'missing_token' });
    const token = auth.slice(7);
    const decoded = jwt.verify(token, authConfig.jwtSecret);
    if (!decoded?.adminId) return res.status(401).json({ error: 'invalid_token' });

    const admin = await prisma.admin.findUnique({ where: { id: decoded.adminId } });
    if (!admin) return res.status(401).json({ error: 'admin_not_found' });

    req.admin = { id: admin.id, email: admin.email, role: admin.role };
    next();
  } catch (e) {
    if (e.name === 'TokenExpiredError') return res.status(401).json({ error: 'token_expired' });
    return res.status(401).json({ error: 'invalid_token', message: e.message });
  }
}
