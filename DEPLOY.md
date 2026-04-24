# 신한하우징 사이트 재배포 가이드

AWS S3 + CloudFront 기반 정적 사이트 재배포 절차 정리.

---

## 배포 리소스 정보

| 항목 | 값 |
|---|---|
| 사이트 URL | https://dtjrr0o5pruoy.cloudfront.net/ |
| S3 버킷 | `shinhan-housing-site-20260418` |
| 리전 | `ap-northeast-2` (서울) |
| CloudFront 배포 ID | `E3KUVSK86MJUSQ` |
| OAC ID | `E2K4ZYITDCBIUI` |
| AWS 계정 | `057054813180` |

---

## 사전 준비

- AWS CLI v2 설치 및 `aws configure` 완료 (이미 설정됨)
- 작업 디렉터리: `D:/repository/shinhan`

```bash
# 자격증명 확인
aws sts get-caller-identity
```

---

## 1. HTML 업데이트 (index.html 변경 시)

HTML은 짧은 캐시(5분)로 업로드하여 변경 사항이 빠르게 반영되도록 한다.

```bash
cd D:/repository/shinhan

aws s3 cp index.html s3://shinhan-housing-site-20260418/index.html \
  --content-type "text/html; charset=utf-8" \
  --cache-control "max-age=300, public"
```

---

## 2. 이미지·프레임 업데이트

webp는 파일명이 바뀌지 않는 한 1년 캐시(immutable)로 업로드한다. 동일 파일명으로 내용만 바뀌는 경우는 [4. 캐시 무효화](#4-캐시-무효화) 필요.

### 2-1. frames/ 디렉터리 동기화

```bash
cd D:/repository/shinhan

aws s3 sync frames/ s3://shinhan-housing-site-20260418/frames/ \
  --content-type "image/webp" \
  --cache-control "max-age=31536000, public, immutable" \
  --exclude "*" --include "*.webp"
```

### 2-2. images/ 디렉터리 동기화

```bash
aws s3 sync images/ s3://shinhan-housing-site-20260418/images/ \
  --content-type "image/webp" \
  --cache-control "max-age=31536000, public, immutable" \
  --exclude "*" --include "*.webp"
```

### 2-3. 단일 이미지만 업로드

```bash
aws s3 cp images/gate-wrought-iron-luxury-lg.webp \
  s3://shinhan-housing-site-20260418/images/gate-wrought-iron-luxury-lg.webp \
  --content-type "image/webp" \
  --cache-control "max-age=31536000, public, immutable"
```

---

## 3. 전체 재배포 (일괄)

모든 변경 사항을 한번에 올리는 통합 스크립트.

```bash
cd D:/repository/shinhan

# HTML (짧은 캐시) — 4개 페이지
for page in index.html products.html product.html admin.html; do
  aws s3 cp "$page" "s3://shinhan-housing-site-20260418/$page" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "max-age=300, public"
done

# assets/js (짧은 캐시 — API 클라이언트 수정 시 즉시 반영)
aws s3 cp assets/js/api.js s3://shinhan-housing-site-20260418/assets/js/api.js \
  --content-type "application/javascript; charset=utf-8" \
  --cache-control "max-age=300, public"

# assets/products.json (1단계 mock 모드용 — 백엔드 연결 후에는 업로드 불필요)
aws s3 cp assets/products.json s3://shinhan-housing-site-20260418/assets/products.json \
  --content-type "application/json; charset=utf-8" \
  --cache-control "max-age=300, public"

# frames (immutable 캐시)
aws s3 sync frames/ s3://shinhan-housing-site-20260418/frames/ \
  --content-type "image/webp" \
  --cache-control "max-age=31536000, public, immutable" \
  --exclude "*" --include "*.webp"

# images (immutable 캐시)
aws s3 sync images/ s3://shinhan-housing-site-20260418/images/ \
  --content-type "image/webp" \
  --cache-control "max-age=31536000, public, immutable" \
  --exclude "*" --include "*.webp"

# 제품 이미지 (seed-products.js가 S3에 직접 업로드하지만, 수동 동기화가 필요한 경우)
# aws s3 sync assets/products/ s3://shinhan-housing-site-20260418/assets/products/ \
#   --content-type "image/webp" \
#   --cache-control "max-age=31536000, public, immutable" \
#   --exclude "*" --include "*.webp"
```

---

## 4. 캐시 무효화 (CloudFront Invalidation)

CloudFront 엣지 캐시를 즉시 갱신해 변경 사항을 모든 사용자에게 반영한다.

> **비용**: 월 1,000 경로까지 무료, 초과분은 경로당 $0.005.

### 4-1. 전체 무효화 (가장 확실, 권장)

```bash
aws cloudfront create-invalidation \
  --distribution-id E3KUVSK86MJUSQ \
  --paths "/*"
```

### 4-2. 특정 파일만 무효화

```bash
aws cloudfront create-invalidation \
  --distribution-id E3KUVSK86MJUSQ \
  --paths "/index.html" "/images/gate-wrought-iron-luxury-lg.webp"
```

### 4-3. 무효화 상태 확인

```bash
# 생성된 invalidation 목록
aws cloudfront list-invalidations --distribution-id E3KUVSK86MJUSQ

# 특정 invalidation 상세 (ID는 list-invalidations 결과에서 확인)
aws cloudfront get-invalidation \
  --distribution-id E3KUVSK86MJUSQ \
  --id I12345ABCDEF
```

무효화는 보통 1~3분 내에 완료된다.

---

## 표준 재배포 워크플로

1. 로컬에서 파일 수정 (`index.html`, `frames/`, `images/`)
2. **3. 전체 재배포** 스크립트 실행하여 S3 업로드
3. **4-1. 전체 무효화** 실행하여 캐시 갱신
4. 브라우저에서 강력 새로고침(Ctrl+F5)으로 확인

---

## 배포 상태 확인

### CloudFront 배포 상태

```bash
aws cloudfront get-distribution \
  --id E3KUVSK86MJUSQ \
  --query "Distribution.Status" \
  --output text
```

- `InProgress` — 변경 사항 전파 중 (5~10분 소요)
- `Deployed` — 전파 완료

### S3 업로드 확인

```bash
# 파일 목록 + 총 용량
aws s3 ls s3://shinhan-housing-site-20260418/ --recursive --summarize

# 특정 파일의 메타데이터 (Content-Type, Cache-Control)
aws s3api head-object \
  --bucket shinhan-housing-site-20260418 \
  --key index.html
```

### 접속 테스트

```bash
curl -sI https://dtjrr0o5pruoy.cloudfront.net/
curl -sI https://dtjrr0o5pruoy.cloudfront.net/images/gate-wrought-iron-luxury-lg.webp
```

HTTP 200 OK가 뜨면 정상.

---

## 파일 삭제

로컬에서 파일을 삭제한 경우 S3에서도 제거해야 한다. `sync`는 기본적으로 삭제를 전파하지 않으므로 `--delete` 플래그를 사용한다.

```bash
# 주의: 로컬에 없는 파일은 S3에서도 삭제됨
aws s3 sync images/ s3://shinhan-housing-site-20260418/images/ \
  --delete \
  --content-type "image/webp" \
  --cache-control "max-age=31536000, public, immutable" \
  --exclude "*" --include "*.webp"
```

단일 파일 삭제:

```bash
aws s3 rm s3://shinhan-housing-site-20260418/images/old-image.webp
```

삭제 후에는 [4-1. 전체 무효화](#4-1-전체-무효화-가장-확실-권장) 실행.

---

## 문제 해결

### 변경 사항이 반영되지 않음
- CloudFront 캐시 무효화 실행 (`aws cloudfront create-invalidation --distribution-id E3KUVSK86MJUSQ --paths "/*"`)
- 브라우저 강력 새로고침(Ctrl+F5) 또는 시크릿 모드로 확인

### 403 Forbidden
- S3 버킷 정책이 CloudFront OAC를 허용하는지 확인:
  ```bash
  aws s3api get-bucket-policy --bucket shinhan-housing-site-20260418 --output text
  ```
- 업로드된 객체 Content-Type이 올바른지 확인 (`head-object` 사용)

### 배포가 10분 이상 `InProgress`
- AWS 콘솔 → CloudFront → 해당 배포에서 상세 오류 확인
- 드물지만 AWS 리전 장애일 수 있음 — [status.aws.amazon.com](https://status.aws.amazon.com/) 참조

### 이미지가 깨져 보임
- Content-Type이 `image/webp`로 올바르게 설정됐는지 확인
- 재업로드 시 `--content-type "image/webp"` 옵션을 반드시 포함

---

## 캐시 정책 요약

| 파일 유형 | Cache-Control | 이유 |
|---|---|---|
| `index.html` | `max-age=300, public` | 5분 — 변경 사항을 빠르게 반영 |
| `*.webp` (frames, images) | `max-age=31536000, public, immutable` | 1년 — 파일명이 해시/불변이라 가정, 대역폭 절약 |

파일 내용이 바뀌었는데 파일명은 그대로인 경우, 반드시 [캐시 무효화](#4-캐시-무효화)를 실행해야 한다.

---

## 참고: 향후 커스텀 도메인 연결

`shinhan-housing.co.kr` 같은 자체 도메인을 붙일 경우 절차:

1. AWS Certificate Manager(`us-east-1` 리전 필수)에서 ACM 인증서 발급
2. CloudFront 배포 편집 → Alternate Domain Name(CNAME) 추가 + ACM 인증서 선택
3. 도메인 등록처(가비아/Route53 등)에서 CNAME(또는 ALIAS)로 `dtjrr0o5pruoy.cloudfront.net` 지정

필요 시 별도 가이드 작성 요청 가능.

---

## 백엔드 API 배포

제품·문의 데이터를 MariaDB에 저장하려면 별도의 EC2 + RDS 백엔드가 필요합니다.
상세 프로비저닝 절차는 `infra/README.md`를 참고하세요.

### 요약

```bash
# 1. RDS MariaDB + EC2 t3.small 프로비저닝 (최초 1회)
#    infra/README.md 섹션 1~3 참고

# 2. API 소스 업로드 후 EC2에서
cd /opt/shinhan-api
npm ci --production
cp .env.example .env   # DATABASE_URL·JWT·SES 설정
npx prisma migrate deploy
node scripts/seed-categories.js
node scripts/create-admin.js

# 3. 제품 초기 시드 (로컬에서 실행 권장 — 1,481개 이미지 업로드)
cd D:/repository/shinhan/api
node scripts/seed-products.js

# 4. PM2로 API 실행
cd /opt/shinhan-api
pm2 start ../infra/pm2.config.js --env production
pm2 save

# 5. CloudFront에 /api/* 비헤이비어 추가 (infra/README.md 섹션 7)

# 6. 프론트엔드 mock 모드 비활성화
#    products.html, product.html, index.html에서 window.SH_API_MOCK__ = true → false
#    (또는 해당 줄 제거)
```

### 연결 후 확인
```bash
curl https://api.shinhanhousing.co.kr/api/health      # {"ok":true}
curl https://api.shinhanhousing.co.kr/api/categories   # 23개 카테고리
curl https://dtjrr0o5pruoy.cloudfront.net/api/health   # CloudFront 경유 동일 결과
```
