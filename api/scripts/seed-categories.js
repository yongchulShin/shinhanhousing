import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  // 단조 제품 (forged) — 10개
  { type: 'forged',   slug: 'gates',            name: '대문',           icon: 'solar:key-square-2-bold',    sortOrder: 1 },
  { type: 'forged',   slug: 'fences',           name: '휀스·울타리',    icon: 'solar:course-up-bold',       sortOrder: 2 },
  { type: 'forged',   slug: 'auto-gates',       name: '자동문',         icon: 'solar:cycling-bold',         sortOrder: 3 },
  { type: 'forged',   slug: 'arches',           name: '아치',           icon: 'solar:bookmark-circle-bold', sortOrder: 4 },
  { type: 'forged',   slug: 'stair-railings',   name: '계단난간',       icon: 'solar:stairs-bold',          sortOrder: 5 },
  { type: 'forged',   slug: 'balcony-windows',  name: '발코니·방범창',  icon: 'solar:window-frame-bold',    sortOrder: 6 },
  { type: 'forged',   slug: 'partitions',       name: '파티션',         icon: 'solar:widget-2-bold',        sortOrder: 7 },
  { type: 'forged',   slug: 'mailboxes',        name: '우체통',         icon: 'solar:letter-bold',          sortOrder: 8 },
  { type: 'forged',   slug: 'accessories',      name: '소품',           icon: 'solar:flower-bold',          sortOrder: 9 },
  { type: 'forged',   slug: 'parts',            name: '부속품',         icon: 'solar:settings-bold',        sortOrder: 10 },

  // 알루미늄 주물 (aluminum) — 11개
  { type: 'aluminum', slug: 'gates',            name: '대문',           icon: 'solar:key-square-2-bold',    sortOrder: 11 },
  { type: 'aluminum', slug: 'fences',           name: '휀스',           icon: 'solar:course-up-bold',       sortOrder: 12 },
  { type: 'aluminum', slug: 'guard-fences',     name: '가드 휀스',      icon: 'solar:shield-bold',          sortOrder: 13 },
  { type: 'aluminum', slug: 'wood-fences',      name: '목재 휀스',      icon: 'solar:leaf-bold',            sortOrder: 14 },
  { type: 'aluminum', slug: 'system-fences',    name: '시스템 휀스',    icon: 'solar:widget-bold',          sortOrder: 15 },
  { type: 'aluminum', slug: 'entrance-doors',   name: '현관문',         icon: 'solar:login-3-bold',         sortOrder: 16 },
  { type: 'aluminum', slug: 'deshi',            name: '데스리',         icon: 'solar:ruler-angular-bold',   sortOrder: 17 },
  { type: 'aluminum', slug: 'moladon',          name: '모라돈',         icon: 'solar:wallpaper-rounded-bold', sortOrder: 18 },
  { type: 'aluminum', slug: 'benches',          name: '벤치',           icon: 'solar:armchair-bold',        sortOrder: 19 },
  { type: 'aluminum', slug: 'lamp-covers',      name: '가로등 커버',    icon: 'solar:lightbulb-bold',       sortOrder: 20 },
  { type: 'aluminum', slug: 'tree-protectors',  name: '수목 보호덮개',  icon: 'solar:tree-bold',            sortOrder: 21 },
  { type: 'aluminum', slug: 'bike-racks',       name: '자전거 보관대',  icon: 'solar:cycling-bold',         sortOrder: 22 },
  { type: 'aluminum', slug: 'trash-bins',       name: '휴지통',         icon: 'solar:trash-bin-minimalistic-bold', sortOrder: 23 },
];

// 원본 카테고리명 → slug 매핑 (seed-products.js에서 사용)
export const CATEGORY_NAME_MAP = {
  forged: {
    '대문': 'gates', '휀스': 'fences', '자동문': 'auto-gates', '아치': 'arches',
    '계단난간': 'stair-railings', '발코니/방범창': 'balcony-windows',
    '파티션': 'partitions', '우체통': 'mailboxes', '소품': 'accessories', '부속품': 'parts',
  },
  aluminum: {
    '대문': 'gates', '휀스': 'fences', '가드 휀스': 'guard-fences', '목재 휀스': 'wood-fences',
    '시스템 휀스': 'system-fences', '현관문': 'entrance-doors',
    '데스리': 'deshi', '모라돈': 'moladon',
    '벤치': 'benches', '가로등 커버': 'lamp-covers', '수목 보호덮개': 'tree-protectors',
    '자전거 보관대': 'bike-racks', '휴지통': 'trash-bins',
  },
};

async function main() {
  console.log('▶ 카테고리 시드 시작…');
  for (const c of CATEGORIES) {
    const existing = await prisma.category.findFirst({ where: { type: c.type, slug: c.slug } });
    if (existing) {
      await prisma.category.update({ where: { id: existing.id }, data: c });
      console.log(`  · 업데이트: ${c.type}/${c.slug} — ${c.name}`);
    } else {
      await prisma.category.create({ data: c });
      console.log(`  + 신규: ${c.type}/${c.slug} — ${c.name}`);
    }
  }
  const total = await prisma.category.count();
  console.log(`✓ 카테고리 시드 완료. 총 ${total}개.`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1].endsWith('seed-categories.js')) {
  main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
}
