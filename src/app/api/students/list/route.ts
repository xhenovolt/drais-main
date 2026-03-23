export const runtime = "nodejs";

import { NextRequest, NextResponse } from 'next/server';
import { getStudentsList } from '@/lib/db/students';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const students = await getStudentsList(session.schoolId);
    
    return NextResponse.json({
      success: true,
      data: students
    });

  } catch (error: any) {
    console.error('Error fetching students list:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch students list'
    }, { status: 500 });
  }
}
