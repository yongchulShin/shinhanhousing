# 신한하우징 백엔드 API

Express + Prisma + MariaDB 기반 제품·문의 관리 API.

## 빠른 시작 (로컬 개발)

### 1. MariaDB 로컬 실행 (Docker 추천)

```bash
docker run -d --name shinhan-mariadb \
  -p 3306:3306 \
  -e MARIADB_ROOT_PASSWORD=rootpass \
  -e MARIADB_DATABASE=shinhan \
  -e MARIADB_USER=shinhan \
  -e MARIADB_PASSWORD=shinhan \
  mariadb:10.11
```

### 2. 의존성 설치 + 환경 변수

```bash
cd D:/repository/shinhan/api
npm install
cp .env.example .env
# .env 편집: DATABASE_URL="mysql://shinhan:shinhan@localhost:3306/shinhan"
```

### 3. Prisma 마이그레이션

```bash
npx prisma generate
npx prisma migrate dev --name init
```

### 4. 초기 데이터 시드

```bash
# 카테고리 23개
node scripts/seed-categories.js

# 관리자 계정 생성 (대화형)
node scripts/create-admin.js

# 제품 1,481개 + 이미지 S3 업로드 (수 분 소요)
# ※ AWS 자격증명과 S3 버킷이 준비되어 있어야 함
node scripts/seed-products.js
```

### 5. API 서버 실행

```bash
npm run dev   # 또는 npm start
# http://localhost:3000/api/health → {"ok":true}
```

### 6. 프론트엔드와 연동

`products.html`, `product.html`, `index.html`, `admin.html`의 스크립트 영역에서:

```html
<script>
  window.SH_API_MOCK__ = false;        // mock 비활성화
  window.SH_API_BASE__ = 'http://localhost:3000/api';  // API 엔드포인트
</script>
```

로컬 정적 서버 실행:

```bash
cd D:/repository/shinhan
python -m http.server 8000
# http://localhost:8000/products.html
```

## API 엔드포인트 요약

### Public (인증 불필요)
- `GET /api/health`
- `GET /api/categories`
- `GET /api/products?type=&category=&q=&page=&limit=`
- `GET /api/products/:code`
- `POST /api/inquiries`

### Admin (JWT Bearer 필수)
- `POST /api/admin/login` → `{ accessToken, refreshToken, admin }`
- `POST /api/admin/refresh`
- `GET/POST/PUT/DELETE /api/admin/products[/:id]`
- `POST /api/admin/products/:id/images/upload-url` → S3 presigned URL
- `POST /api/admin/products/:id/images/confirm` → DB 등록 + WebP 변환
- `PUT/DELETE /api/admin/products/:pid/images/:iid`
- `GET /api/admin/inquiries?status=&page=`
- `PUT /api/admin/inquiries/:id`

## 아키텍처 결정 사항

- **Prisma ORM**: MariaDB ↔ MySQL 프로토콜 호환. `provider = "mysql"`로 접속.
- **BigInt ID**: `Product.id`, `Inquiry.id` 등은 `BigInt`. JSON 직렬화를 위해 `server.js`에서 `BigInt.prototype.toJSON` 오버라이드.
- **이미지 업로드**: S3 presigned URL로 브라우저 직접 업로드 → `/confirm` 요청 시 서버가 원본 다운로드 → sharp로 WebP + 썸네일 생성 → 공개 S3 업로드. 원본 raw는 S3 수명주기로 7일 후 자동 삭제(별도 설정 필요).
- **Rate Limiting**: `/api/inquiries` 1분 1회·1시간 10회, `/api/admin/login` 5분 5회.
- **CORS**: `ALLOWED_ORIGINS`에 나열된 origin만 허용.

## 운영

프로덕션 배포(EC2 + RDS + nginx + PM2)는 `../infra/README.md` 참고.
