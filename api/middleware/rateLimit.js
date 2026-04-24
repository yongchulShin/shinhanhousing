import rateLimit from 'express-rate-limit';

// 문의 폼: IP당 1분 1회, 1시간 10회
export const inquiryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited', message: '잠시 후 다시 시도해 주세요.' },
});

export const inquiryHourlyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limited_hourly', message: '문의가 너무 많습니다. 1시간 후에 다시 시도해 주세요.' },
});

// 관리자 로그인: 5분 내 5회
export const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'login_rate_limited', message: '로그인 시도 횟수를 초과했습니다. 5분 후에 다시 시도해 주세요.' },
});
