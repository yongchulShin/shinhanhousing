# 신한하우징 인프라 프로비저닝 가이드

AWS에서 EC2 + RDS MariaDB + S3 + SES를 사용해 백엔드를 배포하는 절차입니다.

## 아키텍처

```
[Browser]
   ↓
[CloudFront] ──▶ [S3: shinhan-housing-site-20260418]
   │               (index.html, products.html, product.html, admin.html, 이미지)
   │
   ▼ (/api/*)
[ALB or nginx (EC2)] ──▶ [Node.js + Express (PM2)]
                              ├──▶ [RDS MariaDB]
                              ├──▶ [S3 이미지 업로드]
                              └──▶ [AWS SES 이메일]
```

## 1. RDS MariaDB 생성

```bash
aws rds create-db-instance \
  --db-instance-identifier shinhan-db \
  --db-instance-class db.t3.micro \
  --engine mariadb \
  --engine-version 10.11 \
  --master-username shinhan_admin \
  --master-user-password 'CHANGE_ME_STRONG_PASSWORD' \
  --allocated-storage 20 \
  --storage-type gp3 \
  --backup-retention-period 7 \
  --publicly-accessible false \
  --db-subnet-group-name default \
  --vpc-security-group-ids sg-xxx-rds \
  --region ap-northeast-2
```

- **파라미터 그룹**: `character_set_server=utf8mb4`, `collation_server=utf8mb4_unicode_ci`
- **Security Group(sg-xxx-rds)**: EC2 SG에서만 3306 허용
- **초기 DB 생성**: MySQL Workbench 또는 EC2에서 접속 후
  ```sql
  CREATE DATABASE shinhan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'shinhan_app'@'%' IDENTIFIED BY 'STRONG_APP_PASSWORD';
  GRANT ALL PRIVILEGES ON shinhan.* TO 'shinhan_app'@'%';
  FLUSH PRIVILEGES;
  ```

## 2. EC2 t3.small 프로비저닝 (Ubuntu 22.04)

```bash
# 인스턴스 생성
aws ec2 run-instances \
  --image-id ami-xxxxxx \
  --instance-type t3.small \
  --key-name shinhan-key \
  --security-group-ids sg-xxx-api \
  --subnet-id subnet-xxx \
  --iam-instance-profile Name=ShinhanApiRole \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=shinhan-api}]' \
  --region ap-northeast-2

# Elastic IP 할당
aws ec2 allocate-address --domain vpc
aws ec2 associate-address --instance-id i-xxx --allocation-id eipalloc-xxx
```

### IAM 역할 `ShinhanApiRole`
다음 권한 포함:
- `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` on `arn:aws:s3:::shinhan-housing-site-20260418/*`
- `ses:SendEmail`, `ses:SendRawEmail`

### Security Group `sg-xxx-api`
- Inbound: 22(SSH, 관리자 IP), 80(HTTP), 443(HTTPS)
- Outbound: 전체 허용

## 3. 서버 소프트웨어 설치

SSH 접속 후:

```bash
# Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# nginx + certbot
sudo apt install -y nginx certbot python3-certbot-nginx

# PM2 글로벌
sudo npm install -g pm2

# 앱 디렉토리
sudo mkdir -p /opt/shinhan-api
sudo chown ubuntu:ubuntu /opt/shinhan-api
```

## 4. 소스 배포

```bash
# Git 또는 scp로 api/ 와 infra/ 업로드
cd /opt/shinhan-api
# (예: 로컬에서 scp -r api/* ubuntu@EC2:/opt/shinhan-api/)

npm ci --production
cp .env.example .env
nano .env      # 실제 값으로 치환

# Prisma 마이그레이션
npx prisma generate
npx prisma migrate deploy

# 초기 시드
node scripts/seed-categories.js
node scripts/create-admin.js    # 대화형: 이메일·비밀번호 입력
# 제품 시드는 로컬에서 실행하는 것이 빠름 (1,481개 이미지 처리 수 분 소요)
# node scripts/seed-products.js
```

## 5. nginx 설정

```bash
sudo cp /opt/shinhan-api/../infra/nginx.conf /etc/nginx/sites-available/shinhan-api
sudo ln -s /etc/nginx/sites-available/shinhan-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# HTTPS 인증서 발급
sudo certbot --nginx -d api.shinhanhousing.co.kr \
  --non-interactive --agree-tos -m admin@shinhanhousing.co.kr
```

## 6. PM2로 API 실행

```bash
cd /opt/shinhan-api
pm2 start ../infra/pm2.config.js --env production
pm2 save
pm2 startup systemd     # 출력된 명령을 sudo로 실행
```

## 7. CloudFront 비헤이비어 추가

기존 CloudFront(E3KUVSK86MJUSQ)에 `/api/*` 경로를 EC2로 라우팅:

```json
{
  "PathPattern": "/api/*",
  "TargetOriginId": "shinhan-api-origin",
  "ViewerProtocolPolicy": "redirect-to-https",
  "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",  // AWS Managed-CachingDisabled
  "OriginRequestPolicyId": "216adef6-5c7f-47e4-b989-5492eafa07d3",  // AWS Managed-AllViewer
  "AllowedMethods": ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  "Compress": true
}
```

새 Origin 추가:
```json
{
  "Id": "shinhan-api-origin",
  "DomainName": "api.shinhanhousing.co.kr",
  "CustomOriginConfig": {
    "HTTPSPort": 443,
    "OriginProtocolPolicy": "https-only",
    "OriginSSLProtocols": { "Items": ["TLSv1.2"], "Quantity": 1 }
  }
}
```

프론트엔드의 `window.SH_API_MOCK__`은 `false`로 전환 (또는 완전히 제거).

## 8. SES 설정

```bash
# 발신·수신 이메일을 SES에서 Verified Identity로 등록
aws sesv2 create-email-identity --email-identity noreply@shinhanhousing.co.kr
aws sesv2 create-email-identity --email-identity shinhan@shinhanhousing.co.kr

# 초기에는 Sandbox 모드이므로 Verified만 수발신 가능.
# 프로덕션 승격: AWS Console → SES → Production access 요청
```

## 9. 모니터링·백업

- **RDS 자동 백업**: 7일 설정 (위의 create-db-instance 명령에 포함)
- **CloudWatch Logs**:
  ```bash
  sudo apt install -y awslogs  # 또는 CloudWatch Agent
  # PM2 로그를 /var/log/pm2/* → CloudWatch 로 전송
  ```
- **알람**: EC2 CPU > 80%, RDS FreeStorageSpace < 5GB 등

## 10. 점검 체크리스트

- [ ] `curl https://api.shinhanhousing.co.kr/api/health` → `{"ok":true}`
- [ ] `curl https://api.shinhanhousing.co.kr/api/categories` → 23개 카테고리 JSON
- [ ] 브라우저에서 `https://dtjrr0o5pruoy.cloudfront.net/products.html` → 제품 그리드 표시
- [ ] `admin.html` 로그인 → 문의·제품 탭 동작
- [ ] 실제 문의 제출 → RDS에 레코드 저장 + 관리자 이메일 수신
- [ ] 관리자에서 이미지 업로드 → S3에 WebP 생성 + `product.html`에서 즉시 노출

## 비용 가이드 (월)

| 항목 | 예상 비용 |
|---|---|
| EC2 t3.small | $15 |
| RDS db.t3.micro (MariaDB) | $15 (프리티어 12개월 무료) |
| S3 스토리지 | ~$3 |
| CloudFront | ~$2 |
| SES | 1만건 무료 이후 $0.10/건 |
| **합계** | **$37/월** (프리티어 적용 시 $22/월) |
