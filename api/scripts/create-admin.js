import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const prisma = new PrismaClient();

async function main() {
  const rl = readline.createInterface({ input: stdin, output: stdout });

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  신한하우징 관리자 계정 생성');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const email = (await rl.question('이메일 주소: ')).trim().toLowerCase();
  if (!email || !email.includes('@')) { console.error('❌ 올바른 이메일을 입력하세요.'); process.exit(1); }

  const existing = await prisma.admin.findUnique({ where: { email } });
  if (existing) {
    const overwrite = (await rl.question(`⚠  '${email}' 계정이 이미 존재합니다. 비밀번호를 재설정하시겠습니까? (y/N): `)).trim().toLowerCase();
    if (overwrite !== 'y') { console.log('취소되었습니다.'); process.exit(0); }
  }

  const name = (await rl.question('이름 (선택): ')).trim() || null;
  const password = (await rl.question('비밀번호 (최소 10자): ')).trim();
  if (password.length < 10) { console.error('❌ 비밀번호는 최소 10자 이상이어야 합니다.'); process.exit(1); }
  const passwordConfirm = (await rl.question('비밀번호 확인: ')).trim();
  if (password !== passwordConfirm) { console.error('❌ 비밀번호가 일치하지 않습니다.'); process.exit(1); }

  rl.close();

  const passwordHash = await bcrypt.hash(password, 12);

  if (existing) {
    await prisma.admin.update({ where: { id: existing.id }, data: { passwordHash, name: name ?? existing.name } });
    console.log(`\n✓ 관리자 '${email}'의 비밀번호가 재설정되었습니다.`);
  } else {
    await prisma.admin.create({ data: { email, name, passwordHash, role: 'admin' } });
    console.log(`\n✓ 관리자 '${email}'이 생성되었습니다.`);
  }
  console.log('   admin.html 페이지에서 로그인할 수 있습니다.\n');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
