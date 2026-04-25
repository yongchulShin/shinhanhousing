import nodemailer from 'nodemailer';
import { mailConfig } from '../config/env.js';

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: mailConfig.smtp.host,
    port: mailConfig.smtp.port,
    secure: mailConfig.smtp.secure,
    auth: {
      user: mailConfig.smtp.user,
      pass: mailConfig.smtp.pass,
    },
  });

  return transporter;
}

export async function sendInquiryNotification(inquiry) {
  const to = mailConfig.adminNotifyEmail;
  const from = mailConfig.from;
  if (!to || !from || !mailConfig.smtp.host || !mailConfig.smtp.user || !mailConfig.smtp.pass) {
    console.warn('[mailer] SMTP 설정 또는 ADMIN_NOTIFY_EMAIL 미설정 — 이메일 전송을 건너뜁니다.');
    return { skipped: true };
  }

  const productLine = inquiry.productCode
    ? `문의 제품: ${inquiry.productCode} (${inquiry.productType || '—'})`
    : `문의 품목: ${inquiry.productType || '—'}`;

  const text = [
    `신한하우징 새 문의가 접수되었습니다.`,
    ``,
    `접수번호: ${inquiry.id}`,
    `성함: ${inquiry.name}`,
    `연락처: ${inquiry.phone}`,
    inquiry.email ? `이메일: ${inquiry.email}` : null,
    productLine,
    ``,
    `내용:`,
    inquiry.message,
    ``,
    `─────────────`,
    `접수 시각: ${new Date(inquiry.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`,
    inquiry.ipAddress ? `IP: ${inquiry.ipAddress}` : null,
  ].filter(Boolean).join('\n');

  const html = `<div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#fff;color:#222;">
    <h2 style="color:#B17A2A;border-bottom:2px solid #D4A056;padding-bottom:10px;">신한하우징 · 새 문의</h2>
    <p><strong>접수번호:</strong> ${escapeHtml(String(inquiry.id))}</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#666;width:100px;">성함</td><td style="padding:6px 0;">${escapeHtml(inquiry.name)}</td></tr>
      <tr><td style="padding:6px 0;color:#666;">연락처</td><td style="padding:6px 0;"><a href="tel:${escapeAttr(inquiry.phone)}">${escapeHtml(inquiry.phone)}</a></td></tr>
      ${inquiry.email ? `<tr><td style="padding:6px 0;color:#666;">이메일</td><td style="padding:6px 0;"><a href="mailto:${escapeAttr(inquiry.email)}">${escapeHtml(inquiry.email)}</a></td></tr>` : ''}
      ${inquiry.productCode ? `<tr><td style="padding:6px 0;color:#666;">제품 코드</td><td style="padding:6px 0;font-family:monospace;color:#B17A2A;"><strong>${escapeHtml(inquiry.productCode)}</strong></td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#666;">품목</td><td style="padding:6px 0;">${escapeHtml(inquiry.productType || '—')}</td></tr>
    </table>
    <h3 style="color:#333;margin-top:20px;">문의 내용</h3>
    <div style="background:#f7f5f1;padding:16px;border-left:3px solid #D4A056;white-space:pre-wrap;">${escapeHtml(inquiry.message)}</div>
    <p style="font-size:12px;color:#999;margin-top:24px;">
      접수 시각: ${new Date(inquiry.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}<br />
      ${inquiry.ipAddress ? `IP: ${escapeHtml(inquiry.ipAddress)}` : ''}
    </p>
  </div>`;

  try {
    const res = await getTransporter().sendMail({
      from,
      to,
      replyTo: inquiry.email || undefined,
      subject: `[신한하우징 문의] ${inquiry.name} · ${inquiry.productCode || inquiry.productType || '신규'}`,
      text,
      html,
    });
    return { messageId: res.messageId };
  } catch (e) {
    console.error('[mailer] 이메일 전송 실패:', e);
    return { error: e.message };
  }
}

function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function escapeAttr(s) { return escapeHtml(s); }
