import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getServerSession } from 'next-auth';
import fs from 'fs/promises';
import path from 'path';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  try {
    const session = await getServerSession();
    if (!session?.user?.role?.includes('admin')) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const migrationSQL = await fs.readFile(
      path.join(process.cwd(), 'database/migrations/tahfiz_tables.sql'),
      'utf8'
    );

    await query(migrationSQL);

    return NextResponse.json({
      initialized: true,
      message: "Tahfiz tracking module initialized successfully. New features available under Academic > Tahfiz Progress.",
    });
  } catch (error) {
    console.error('Tahfiz init error:', error);
    return NextResponse.json({ error: 'Failed to initialize tahfiz tables' }, { status: 500 });
  }
}
