import { readFileSync, writeFileSync } from 'node:fs';

const files = [
  'api/attendance/route.ts', 'api/attendance/students/route.ts', 'api/attendance/list/route.ts',
  'api/attendance/summary/route.ts', 'api/attendance/stats/route.ts', 'api/attendance/signin/route.ts',
  'api/attendance/signout/route.ts', 'api/attendance/biometric/route.ts', 'api/attendance/zk/dashboard/route.ts',
  'api/attendance/zk/reports/route.ts', 'api/attendance/export/route.ts', 'api/attendance/student/[id]/route.ts',
  'api/attendance/allowance-report/route.ts', 'api/attendance/settings/simulate/route.ts',
  'api/students/attendence/route.ts', 'api/dashboard/overview/route.ts', 'api/dashboard/admissions-analytics/route.ts',
  'api/dashboard/recommendations/route.ts', 'api/intelligence/attendance-overview/route.ts',
];

const ANCHOR = "import { NextRequest, NextResponse } from 'next/server';";
const IMPORT = "import { schoolLocalToday } from '@/lib/datetime/local-date';";
const TARGETS = [
  "new Date().toISOString().split('T')[0]",
  "new Date().toISOString().slice(0, 10)",
];

for (const rel of files) {
  const path = `src/app/${rel}`;
  let src = readFileSync(path, 'utf8');
  let count = 0;
  for (const t of TARGETS) {
    const parts = src.split(t);
    if (parts.length > 1) { count += parts.length - 1; src = parts.join('schoolLocalToday()'); }
  }
  if (count === 0) { console.log(`SKIP  ${rel} (no today-default substring)`); continue; }
  if (!src.includes(IMPORT)) src = src.replace(ANCHOR, `${ANCHOR}\n${IMPORT}`);
  writeFileSync(path, src);
  console.log(`OK    ${rel}  (${count} replaced)`);
}
