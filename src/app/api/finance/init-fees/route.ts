import { NextRequest, NextResponse } from 'next/server';
import { initializeFeesSystem } from '@/lib/fees';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;
    const result = await initializeFeesSystem(schoolId);

    return NextResponse.json({
      success: true,
      message: `Fees system initialized: ${result.newItemsCount} new items created for ${result.studentsCount} students`,
      ...result
    });
  } catch (error: any) {
    console.error('Fees initialization error:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to initialize fees system'
    }, { status: 500 });
  }
}
