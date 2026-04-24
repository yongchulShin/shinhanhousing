# 신한하우징 웹사이트 운영 가이드

신한하우징 홈페이지 리뉴얼 프로젝트 — 정적 랜딩페이지 + 제품 카탈로그 + 관리자 페이지 + 문의 관리 백엔드.

## 목차

1. [프로젝트 구조](#1-프로젝트-구조)
2. [사전 준비 도구](#2-사전-준비-도구)
3. [로컬 개발 환경](#3-로컬-개발-환경)
   - 3-1. [프론트엔드만 실행 (Mock 모드)](#3-1-프론트엔드만-실행-mock-모드)
   - 3-2. [백엔드 포함 전체 스택 실행](#3-2-백엔드-포함-전체-스택-실행)
   - 3-3. [로컬 테스트 시나리오](#3-3-로컬-테스트-시나리오)
4. [AWS 배포](#4-aws-배포)
   - 4-1. [배포 전 체크리스트](#4-1-배포-전-체크리스트)
   - 4-2. [프론트엔드 배포 (S3 + CloudFront)](#4-2-프론트엔드-배포-s3--cloudfront)
   - 4-3. [RDS MariaDB 생성](#4-3-rds-mariadb-생성)
   - 4-4. [EC2 백엔드 프로비저닝](#4-4-ec2-백엔드-프로비저닝)
   - 4-5. [CloudFront에 API 비헤이비어 연결](#4-5-cloudfront에-api-비헤이비어-연결)
   - 4-6. [초기 데이터 시드](#4-6-초기-데이터-시드)
   - 4-7. [Mock 모드 해제 및 배포 검증](#4-7-mock-모드-해제-및-배포-검증)
5. [일상 운영](#5-일상-운영)
6. [트러블슈팅](#6-트러블슈팅)

---

## 1. 프로젝트 구조

```
D:\repository\shinhan\
├── index.html               # 랜딩 페이지
├── products.html            # 제품 목록 SPA
├── product.html             # 제품 상세 (슬라이드·라이트박스)
├── admin.html               # 관리자 대시보드
├── assets/
│   ├── js/api.js            # 공통 API 클라이언트
│   └── products.json        # Mock 데이터 (Mock 모드 전용)
├── frames/, images/         # Hero 애니메이션·제품 이미지 (정적 자산)
│
├── api/                     # 백엔드 (Node.js + Express + Prisma)
│   ├── server.js            # Express 엔트리
│   ├── prisma/schema.prisma # DB 스키마
│   ├── routes/              # public / inquiries / admin
│   ├── middleware/          # JWT · rate limiting
│   ├── services/            # mailer (SES) · uploader (S3) · imageProcessor (sharp)
│   ├── scripts/             # seed-categories · seed-products · create-admin
│   ├── package.json
│   ├── .env.example
│   └── README.md
│
├── infra/                   # 인프라 설정
│   ├── nginx.conf           # API 리버스 프록시
│   ├── pm2.config.js        # 프로세스 관리자
│   └── README.md            # 프로비저닝 상세 가이드
│
├── 신한하우징 제품/         # 원본 제품 자료
│   ├── 신한하우징_이미지다운로드.py  # 1,634개 제품 마스터 데이터
│   └── 신한하우징_제품이미지/        # 1,481개 원본 이미지
│
└── DEPLOY.md                # S3/CloudFront 재배포 명령어 모음
```

### 아키텍처 개요

```
[브라우저]
   │
   ▼
[CloudFront CDN]──▶[S3 버킷: 정적 파일·이미지]
   │
   ▼ (/api/* 요청)
[nginx on EC2]──▶[Node.js + Express (PM2)]
                     ├──▶[RDS MariaDB]      (제품·문의·관리자)
                     ├──▶[S3 업로드]         (관리자 이미지 업로드)
                     └──▶[AWS SES]          (문의 알림 이메일)
```

---

## 2. 사전 준비 도구

| 용도 | 도구 | 버전 | 설치 |
|---|---|---|---|
| 프론트엔드 정적 서버 | Python 또는 Node.js | 3.8+ / 20+ | Windows 기본 또는 [nodejs.org](https://nodejs.org) |
| 백엔드 런타임 | Node.js | **20 LTS 이상** | [nodejs.org](https://nodejs.org) |
| 로컬 DB | Docker Desktop | 최신 | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Git | Git | 2.30+ | [git-scm.com](https://git-scm.com) |
| AWS 배포 | AWS CLI v2 | 2.15+ | [AWSCLIV2.msi](AWSCLIV2.msi) (프로젝트 루트에 포함) |
| DB GUI (선택) | DBeaver 또는 TablePlus | — | — |
| API 테스트 (선택) | Postman 또는 curl | — | — |

### AWS 계정 요구 사항
- 활성화된 AWS 계정 (현재: `057054813180`)
- IAM 사용자 또는 SSO 프로필 설정 완료 (`aws sts get-caller-identity` 성공)
- 리전: `ap-northeast-2` (서울)
- 기존 리소스: CloudFront 배포 `E3KUVSK86MJUSQ`, S3 버킷 `shinhan-housing-site-20260418`

---

## 3. 로컬 개발 환경

### 3-1. 프론트엔드만 실행 (Mock 모드)

백엔드 없이 UI·UX를 확인할 때 사용합니다. `assets/products.json`의 샘플 제품 11개로 페이지가 동작합니다.

```bash
cd D:\repository\shinhan

# Python이 있는 경우
python -m http.server 8000

# 또는 Node.js가 있는 경우
npx http-server -p 8000 -c-1
```

브라우저에서 접속:
- 랜딩: http://localhost:8000/
- 제품 목록: http://localhost:8000/products.html
- 제품 상세: http://localhost:8000/product.html?id=GA-1501
- 관리자: http://localhost:8000/admin.html (Mock 모드에선 로그인 불가 — 백엔드 필요)

**Mock 모드 확인 방법**: HTML 파일의 `<script>window.SH_API_MOCK__ = true;</script>`가 설정되어 있으면 Mock. 백엔드 연결 시 `false`로 전환합니다.

### 3-2. 백엔드 포함 전체 스택 실행

실제 DB에 데이터를 저장하고 관리자 페이지로 이미지 업로드까지 테스트할 때 사용합니다.

#### 단계 ① — MariaDB 컨테이너 시작

```bash
docker run -d --name shinhan-mariadb \
  -p 3306:3306 \
  -e MARIADB_ROOT_PASSWORD=rootpass \
  -e MARIADB_DATABASE=shinhan \
  -e MARIADB_USER=shinhan \
  -e MARIADB_PASSWORD=shinhan \
  -e MARIADB_CHARACTER_SET_SERVER=utf8mb4 \
  mariadb:10.11
```

중지·재시작:
```bash
docker stop shinhan-mariadb    # 종료
docker start shinhan-mariadb   # 재시작 (데이터는 컨테이너에 보존)
docker rm -f shinhan-mariadb   # 완전 삭제 (데이터 손실)
```

#### 단계 ② — 백엔드 의존성 설치 + 환경 변수

```bash
cd D:\repository\shinhan\api
npm install
cp .env.example .env
```

`.env` 파일을 편집해 로컬용으로 설정:

```ini
DATABASE_URL="mysql://shinhan:shinhan@localhost:3306/shinhan?connection_limit=10"
JWT_SECRET="local-dev-secret-change-me-to-64-random-chars"
JWT_REFRESH_SECRET="local-dev-refresh-secret-also-64-chars"
JWT_ACCESS_EXPIRES="1h"
JWT_REFRESH_EXPIRES="7d"
PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS="http://localhost:8000,http://127.0.0.1:8000"

# AWS (로컬에선 S3/SES 기능 미사용 시 공란 가능 — 단, 관리자 이미지 업로드·문의 이메일 불가)
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
S3_BUCKET=shinhan-housing-site-20260418
S3_PUBLIC_BASE=https://dtjrr0o5pruoy.cloudfront.net
S3_PRODUCTS_PREFIX=assets/products
SES_FROM=
ADMIN_NOTIFY_EMAIL=
RECAPTCHA_SECRET=
```

#### 단계 ③ — Prisma 마이그레이션

```bash
cd D:\repository\shinhan\api
npx prisma generate
npx prisma migrate dev --name init
```

성공 시 DB에 5개 테이블 생성: `categories`, `products`, `product_images`, `inquiries`, `admins`.

선택: 데이터 확인용 GUI
```bash
npx prisma studio   # http://localhost:5555
```

#### 단계 ④ — 초기 데이터 시드

```bash
# 카테고리 23개 (forged 10개 + aluminum 13개)
node scripts/seed-categories.js

# 관리자 계정 (대화형 — 이메일·비밀번호 입력)
node scripts/create-admin.js

# 제품 1,481개 + 이미지 업로드 (수 분 소요, AWS 자격증명 필요)
# ※ 이미지는 S3에 업로드되므로 AWS 자격증명이 있는 환경에서 실행.
#    AWS 없이 테스트만 하려면 이 단계는 건너뛰고 수동으로 몇 개 제품만 추가.
node scripts/seed-products.js
```

#### 단계 ⑤ — API 서버 실행

```bash
cd D:\repository\shinhan\api
npm run dev    # nodemon 자동 재시작
# 또는
npm start
```

확인: `curl http://localhost:3000/api/health` → `{"ok":true,...}`

#### 단계 ⑥ — 프론트엔드에서 Mock 모드 해제

개발 전용으로 4개 HTML 파일의 `window.SH_API_MOCK__ = true;`를 `false`로 바꾸고 API 엔드포인트를 지정합니다.

**방법 A — 각 HTML 파일에서 직접 수정**

`index.html`, `products.html`, `product.html`에서:
```html
<script>
  window.SH_API_MOCK__ = false;
  window.SH_API_BASE__ = 'http://localhost:3000/api';
</script>
```

`admin.html`은 이미 `window.SH_API_MOCK__ = false;`가 설정되어 있으므로 `SH_API_BASE__`만 추가:
```html
<script>
  window.SH_API_MOCK__ = false;
  window.SH_API_BASE__ = 'http://localhost:3000/api';
</script>
```

**방법 B — 브라우저 콘솔에서 임시 설정 (수정 없이 테스트)**

개발자도구 → Application → Local Storage에서 설정하거나, 페이지 로드 전에 override하는 bookmarklet 등을 사용. 단, 수정이 간단하므로 방법 A를 권장합니다.

#### 단계 ⑦ — 프론트엔드 정적 서버

새 터미널 창에서:
```bash
cd D:\repository\shinhan
python -m http.server 8000
```

### 3-3. 로컬 테스트 시나리오

① **제품 탐색**: http://localhost:8000/products.html
- 상단 "단조 / 알루미늄 주물" 토글 → 카테고리 칩 변경
- "SHG-1501" 등 코드 검색
- 카드 클릭 → `product.html?id=SHG-1501`

② **제품 상세**: 슬라이드 좌/우 버튼, 썸네일 네비, 방향키, 이미지 클릭 시 라이트박스

③ **문의 연동**: "이 제품 문의하기" → `index.html?product=SHG-1501#contact`로 이동, 폼에 자동 입력

④ **문의 제출**: 폼 작성 후 전송 → API 200 응답 → Prisma Studio에서 `inquiries` 테이블에 레코드 확인

⑤ **관리자 로그인**: http://localhost:8000/admin.html → 단계 ④에서 만든 이메일·비밀번호 입력

⑥ **관리자 기능**:
- **문의 탭**: 방금 제출한 문의 노출 → "응대중" 버튼 클릭 → 상태 변경
- **제품 탭**: "새 제품" 추가 → 이미지 드래그앤드롭 업로드 (AWS 자격증명 필요)
- 업로드된 이미지는 즉시 `product.html?id=<코드>`에서 슬라이드에 표시

---

## 4. AWS 배포

**배포 순서** (최초 1회): RDS → EC2 백엔드 → CloudFront 비헤이비어 → 프론트엔드 재배포 → 초기 시드 → Mock 해제 검증.

### 4-1. 배포 전 체크리스트

- [ ] AWS CLI v2 설치 및 `aws sts get-caller-identity`로 계정 `057054813180` 확인
- [ ] 배포 리전 `ap-northeast-2` 지정 (`aws configure set region ap-northeast-2`)
- [ ] IAM 권한: EC2, RDS, S3, CloudFront, SES, IAM Role 생성 권한
- [ ] 도메인 소유 (선택): `api.shinhanhousing.co.kr` 서브도메인 사용 시 DNS 관리 권한
- [ ] SES에서 발신용 이메일 (`noreply@shinhanhousing.co.kr`) Verified Identity 등록

### 4-2. 프론트엔드 배포 (S3 + CloudFront)

기존 인프라가 이미 구축되어 있으므로 업데이트만 수행합니다. 상세 명령은 [DEPLOY.md](DEPLOY.md) 참고.

```bash
cd D:\repository\shinhan

# 4개 HTML 업로드 (5분 캐시)
for page in index.html products.html product.html admin.html; do
  aws s3 cp "$page" "s3://shinhan-housing-site-20260418/$page" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "max-age=300, public"
done

# 공통 JS
aws s3 cp assets/js/api.js s3://shinhan-housing-site-20260418/assets/js/api.js \
  --content-type "application/javascript; charset=utf-8" \
  --cache-control "max-age=300, public"

# Mock 데이터 (백엔드 연결 전 임시 사용, 연결 후 삭제 가능)
aws s3 cp assets/products.json s3://shinhan-housing-site-20260418/assets/products.json \
  --content-type "application/json; charset=utf-8" \
  --cache-control "max-age=300, public"

# 캐시 무효화
aws cloudfront create-invalidation \
  --distribution-id E3KUVSK86MJUSQ \
  --paths "/*"
```

### 4-3. RDS MariaDB 생성

```bash
# DB용 Security Group 생성 (EC2 SG에서만 3306 허용)
aws ec2 create-security-group --group-name shinhan-rds-sg \
  --description "Shinhan RDS MariaDB" \
  --vpc-id vpc-XXXX

# RDS 인스턴스 생성 (비밀번호는 강력하게)
aws rds create-db-instance \
  --db-instance-identifier shinhan-db \
  --db-instance-class db.t3.micro \
  --engine mariadb \
  --engine-version 10.11 \
  --master-username shinhan_admin \
  --master-user-password 'CHANGE_ME_STRONG_PW_20+CHARS' \
  --allocated-storage 20 \
  --storage-type gp3 \
  --backup-retention-period 7 \
  --publicly-accessible false \
  --vpc-security-group-ids sg-XXXX-rds \
  --region ap-northeast-2
```

대기 (5~10분): `aws rds describe-db-instances --db-instance-identifier shinhan-db --query "DBInstances[0].DBInstanceStatus"` → `available` 상태가 되면 엔드포인트 확인:

```bash
aws rds describe-db-instances --db-instance-identifier shinhan-db \
  --query "DBInstances[0].Endpoint.Address" --output text
```

**앱용 DB 계정 생성**: EC2 프로비저닝 후 해당 EC2에서 RDS에 접속해 실행:
```sql
CREATE DATABASE shinhan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'shinhan_app'@'%' IDENTIFIED BY 'STRONG_APP_PASSWORD';
GRANT ALL PRIVILEGES ON shinhan.* TO 'shinhan_app'@'%';
FLUSH PRIVILEGES;
```

### 4-4. EC2 백엔드 프로비저닝

상세 절차는 [infra/README.md](infra/README.md)에 단계별로 정리되어 있습니다. 요약:

#### ① IAM Role 생성 (`ShinhanApiRole`)

EC2가 S3·SES를 호출할 수 있도록 권한 부여. 인라인 정책:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::shinhan-housing-site-20260418/*"
    },
    {
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*"
    }
  ]
}
```

#### ② EC2 인스턴스 시작

```bash
# Security Group (22·80·443 허용)
aws ec2 create-security-group --group-name shinhan-api-sg \
  --description "Shinhan API" --vpc-id vpc-XXXX

aws ec2 authorize-security-group-ingress --group-id sg-XXX-api \
  --ip-permissions '[
    {"IpProtocol":"tcp","FromPort":22,"ToPort":22,"IpRanges":[{"CidrIp":"관리자IP/32"}]},
    {"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]},
    {"IpProtocol":"tcp","FromPort":443,"ToPort":443,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}
  ]'

# RDS SG에 EC2 SG에서 3306 허용 규칙 추가
aws ec2 authorize-security-group-ingress --group-id sg-XXX-rds \
  --source-group sg-XXX-api --protocol tcp --port 3306

# 인스턴스 생성 (Ubuntu 22.04 LTS)
aws ec2 run-instances \
  --image-id ami-0c9c942bd7bf113a2 \
  --instance-type t3.small \
  --key-name shinhan-key \
  --security-group-ids sg-XXX-api \
  --iam-instance-profile Name=ShinhanApiRole \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=shinhan-api}]'

# Elastic IP 할당
aws ec2 allocate-address --domain vpc
aws ec2 associate-address --instance-id i-XXX --allocation-id eipalloc-XXX
```

#### ③ 서버 소프트웨어 설치

```bash
ssh -i shinhan-key.pem ubuntu@<Elastic IP>

# 안에서:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt update && sudo apt install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2
sudo mkdir -p /opt/shinhan-api && sudo chown ubuntu:ubuntu /opt/shinhan-api
```

#### ④ 소스 업로드

로컬에서 (PowerShell 또는 Git Bash):
```bash
scp -i shinhan-key.pem -r api infra ubuntu@<Elastic IP>:/opt/
# 서버에서 /opt/api/ → /opt/shinhan-api/ 로 이동
```

또는 Git 저장소 사용:
```bash
# EC2에서
cd /opt && git clone https://github.com/<your-org>/shinhan.git
ln -s shinhan/api shinhan-api
```

#### ⑤ 환경 변수 + 의존성

```bash
cd /opt/shinhan-api
npm ci --production
cp .env.example .env
nano .env   # 실제 값으로 편집
```

`.env` 프로덕션 값 예시:
```ini
DATABASE_URL="mysql://shinhan_app:STRONG_APP_PW@shinhan-db.XXXX.ap-northeast-2.rds.amazonaws.com:3306/shinhan?connection_limit=10"
JWT_SECRET="<openssl rand -base64 48 로 생성>"
JWT_REFRESH_SECRET="<다른 랜덤 값>"
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS="https://dtjrr0o5pruoy.cloudfront.net"
AWS_REGION=ap-northeast-2
S3_BUCKET=shinhan-housing-site-20260418
S3_PUBLIC_BASE=https://dtjrr0o5pruoy.cloudfront.net
SES_FROM=noreply@shinhanhousing.co.kr
ADMIN_NOTIFY_EMAIL=shinhan@shinhanhousing.co.kr
```

#### ⑥ DB 마이그레이션 + 초기 시드

```bash
cd /opt/shinhan-api
npx prisma generate
npx prisma migrate deploy
node scripts/seed-categories.js
node scripts/create-admin.js   # 대화형 — 관리자 이메일·비밀번호 입력
```

#### ⑦ nginx + HTTPS

```bash
sudo cp /opt/infra/nginx.conf /etc/nginx/sites-available/shinhan-api
sudo ln -s /etc/nginx/sites-available/shinhan-api /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 도메인 DNS를 EC2 Elastic IP로 지정한 뒤
sudo certbot --nginx -d api.shinhanhousing.co.kr \
  --non-interactive --agree-tos -m admin@shinhanhousing.co.kr
```

#### ⑧ PM2로 API 실행

```bash
cd /opt/shinhan-api
pm2 start /opt/infra/pm2.config.js --env production
pm2 save
pm2 startup systemd     # 출력된 sudo 명령 그대로 실행
```

확인: `curl https://api.shinhanhousing.co.kr/api/health` → `{"ok":true}`

### 4-5. CloudFront에 API 비헤이비어 연결

AWS Console → CloudFront → 배포 `E3KUVSK86MJUSQ` 편집.

**Origin 추가**:
- Origin domain: `api.shinhanhousing.co.kr`
- Protocol: HTTPS only
- Origin SSL: TLSv1.2
- Origin ID: `shinhan-api-origin`

**Behavior 추가**:
- Path pattern: `/api/*`
- Origin: `shinhan-api-origin`
- Viewer protocol: Redirect HTTP to HTTPS
- Allowed methods: `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE`
- Cache policy: `Managed-CachingDisabled`
- Origin request policy: `Managed-AllViewer`
- Compress: Yes

CLI로도 가능하지만 Console UI가 편리합니다. 편집 후 배포 Status가 `Deployed` 될 때까지 5~10분 대기.

### 4-6. 초기 데이터 시드

1,481개 이미지를 S3에 업로드하는 대규모 작업이므로 **로컬에서 실행을 권장**합니다 (EC2 t3.small보다 빠름).

```bash
cd D:\repository\shinhan\api

# .env를 프로덕션 DB로 임시 변경
# DATABASE_URL="mysql://shinhan_app:...@shinhan-db.XXX.rds.amazonaws.com:3306/shinhan"
# AWS_ACCESS_KEY_ID=... (S3 업로드용)
# AWS_SECRET_ACCESS_KEY=...

# RDS에 로컬에서 접속하려면 RDS SG에 일시적으로 관리자 IP 허용 규칙 추가 필요

npx prisma migrate deploy
node scripts/seed-categories.js
node scripts/seed-products.js    # 수 분~10분 소요
```

완료 후 `.env`를 원래대로 복원하고 RDS SG 규칙도 제거.

### 4-7. Mock 모드 해제 및 배포 검증

`index.html`, `products.html`, `product.html`의 Mock 모드를 해제합니다. CloudFront가 `/api/*`를 백엔드로 라우팅하므로 `SH_API_BASE__`는 생략하면 기본값 `/api`가 사용됩니다.

```bash
cd D:\repository\shinhan
```

각 HTML 파일에서:
```html
<!-- Before -->
<script>
  window.SH_API_MOCK__ = true;
</script>

<!-- After -->
<script>
  window.SH_API_MOCK__ = false;
</script>
```

재배포:
```bash
for page in index.html products.html product.html admin.html; do
  aws s3 cp "$page" "s3://shinhan-housing-site-20260418/$page" \
    --content-type "text/html; charset=utf-8" \
    --cache-control "max-age=300, public"
done

aws cloudfront create-invalidation --distribution-id E3KUVSK86MJUSQ --paths "/*"
```

#### 배포 검증 체크리스트

```bash
# ① API 헬스
curl https://dtjrr0o5pruoy.cloudfront.net/api/health
# → {"ok":true,"ts":"..."}

# ② 카테고리 (23개)
curl https://dtjrr0o5pruoy.cloudfront.net/api/categories | jq length
# → 23

# ③ 제품 샘플
curl "https://dtjrr0o5pruoy.cloudfront.net/api/products?limit=3" | jq '.total'
# → 1,400+

# ④ 특정 제품
curl https://dtjrr0o5pruoy.cloudfront.net/api/products/SHG-1501
```

브라우저에서:
- [ ] https://dtjrr0o5pruoy.cloudfront.net/ → Hero 애니메이션
- [ ] https://dtjrr0o5pruoy.cloudfront.net/products.html → 실제 DB 제품 그리드
- [ ] 카드 클릭 → 상세 페이지 슬라이드
- [ ] 문의 폼 제출 → 관리자 이메일 수신 + RDS에 레코드 저장
- [ ] https://dtjrr0o5pruoy.cloudfront.net/admin.html → 로그인 → 방금 문의·이미지 업로드 테스트

---

## 5. 일상 운영

### 5-1. 프론트엔드 변경 후 재배포

```bash
cd D:\repository\shinhan
# 변경된 HTML만 업로드
aws s3 cp products.html s3://shinhan-housing-site-20260418/products.html \
  --content-type "text/html; charset=utf-8" --cache-control "max-age=300, public"

aws cloudfront create-invalidation --distribution-id E3KUVSK86MJUSQ --paths "/products.html"
```

### 5-2. 백엔드 코드 변경 후 재배포

```bash
# 로컬에서 코드 push (Git) 또는 scp로 /opt/shinhan-api 에 업로드 후 EC2에서:
ssh ubuntu@<Elastic IP>
cd /opt/shinhan-api
git pull   # 또는 scp로 받은 파일 확인
npm ci --production   # 의존성 변경 시
npx prisma migrate deploy   # 스키마 변경 시
pm2 reload shinhan-api   # 무중단 재시작
pm2 logs shinhan-api --lines 50
```

### 5-3. 관리자 계정 추가·비밀번호 재설정

```bash
ssh ubuntu@<Elastic IP>
cd /opt/shinhan-api
node scripts/create-admin.js   # 기존 이메일이면 재설정 여부 확인
```

### 5-4. 로그 확인

```bash
# PM2 로그
pm2 logs shinhan-api --lines 200
# 또는
tail -f /var/log/pm2/shinhan-api-out.log

# nginx 로그
sudo tail -f /var/log/nginx/shinhan-api-access.log
sudo tail -f /var/log/nginx/shinhan-api-error.log

# RDS 슬로 쿼리
aws rds describe-db-log-files --db-instance-identifier shinhan-db
```

### 5-5. DB 백업

RDS 자동 백업이 7일 설정되어 있습니다. 중요 변경 전 수동 스냅샷:
```bash
aws rds create-db-snapshot \
  --db-instance-identifier shinhan-db \
  --db-snapshot-identifier shinhan-db-$(date +%Y%m%d)
```

---

## 6. 트러블슈팅

### 6-1. 로컬 `npm install` 실패
- Node.js 버전 확인: `node -v` → 20 이상이어야 함
- `sharp` 빌드 실패 시 Windows는 VC++ 런타임 필요: [vc_redist.x64.exe](https://aka.ms/vs/17/release/vc_redist.x64.exe)

### 6-2. `npx prisma migrate dev` 에러
- Docker MariaDB 실행 확인: `docker ps | grep shinhan-mariadb`
- DB 접속 테스트: `mysql -h 127.0.0.1 -u shinhan -pshinhan shinhan`
- `.env`의 DATABASE_URL 오타 확인

### 6-3. 관리자 페이지에서 "API 401" 오류
- 토큰 만료 — 다시 로그인
- `admin.html`의 `SH_API_BASE__`가 맞는지 확인
- 브라우저 DevTools → Network 탭에서 실제 요청 URL 확인

### 6-4. 문의 폼 제출 시 "rate_limited"
- 같은 IP에서 1분 1회 제한. 잠시 후 재시도
- 테스트 중이면 EC2에서 재시작: `pm2 restart shinhan-api`

### 6-5. 이미지 업로드 시 "S3 403"
- EC2 IAM Role (`ShinhanApiRole`)이 S3 PutObject 권한 있는지 확인
- 로컬 테스트 시 `.env`의 `AWS_ACCESS_KEY_ID` 확인
- 버킷 CORS 설정 확인 (브라우저 직접 PUT 시 필요):
  ```bash
  aws s3api put-bucket-cors --bucket shinhan-housing-site-20260418 --cors-configuration '{
    "CORSRules": [{
      "AllowedOrigins": ["https://dtjrr0o5pruoy.cloudfront.net", "http://localhost:8000"],
      "AllowedMethods": ["PUT", "POST", "GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }]
  }'
  ```

### 6-6. 문의 이메일이 오지 않음
- SES가 Sandbox 모드면 발신·수신 모두 Verified Identity만 허용
- 프로덕션 승격: AWS Console → SES → Account dashboard → Request production access
- EC2 IAM Role에 `ses:SendEmail` 권한 있는지 확인
- PM2 로그에서 `[mailer] 이메일 전송 실패` 찾기

### 6-7. CloudFront가 최신 HTML을 서빙하지 않음
- 캐시 무효화 실행: `aws cloudfront create-invalidation --distribution-id E3KUVSK86MJUSQ --paths "/*"`
- 완료까지 1~3분 대기
- 브라우저 하드 리프레시 (Ctrl+F5) 또는 시크릿 모드 확인

### 6-8. RDS 용량 경고
- `FreeStorageSpace` < 5GB 시 CloudWatch 알람 설정
- `aws rds modify-db-instance --db-instance-identifier shinhan-db --allocated-storage 50 --apply-immediately`로 확장

### 6-9. 백엔드 프로세스 다운
- `pm2 status`로 상태 확인
- 자동 재시작 설정됨 (`max_memory_restart: 500M`, `autorestart: true`)
- OOM이면 EC2를 t3.medium으로 업그레이드 검토

---

## 관련 문서

- [DEPLOY.md](DEPLOY.md) — S3/CloudFront 프론트엔드 재배포 명령 상세
- [api/README.md](api/README.md) — 백엔드 API 엔드포인트 레퍼런스
- [infra/README.md](infra/README.md) — AWS 인프라 프로비저닝 단계별 상세 가이드

## 비용 요약 (월 예상)

| 항목 | 비용 | 비고 |
|---|---|---|
| EC2 t3.small | $15 | 상시 실행 |
| RDS db.t3.micro MariaDB | $15 | 프리티어 12개월 무료 |
| S3 스토리지 | $3 | 이미지 300~500MB |
| CloudFront | $2 | 트래픽 낮을 때 |
| SES | $0 | 월 1만건 무료, 초과 $0.10/건 |
| 데이터 전송 | $2 | |
| **합계** | **$37** | 프리티어 적용 시 **$22** |
