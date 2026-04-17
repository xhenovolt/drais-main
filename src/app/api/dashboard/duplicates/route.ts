import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

interface DuplicateGroup {
  type: 'name' | 'email' | 'phone' | 'admission_no';
  count: number;
  students: Array<{
    id: number;
    admission_no: string;
    name: string;
    email?: string;
    phone?: string;
    class?: string;
    status: string;
  }>;
  matchingField: string;
}

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();

    // Detect duplicate names (first + last name combination)
    const [nameMatches] = await connection.execute(`
      SELECT 
        CONCAT(p.first_name, ' ', p.last_name) as full_name,
        COUNT(s.id) as count,
        GROUP_CONCAT(s.id) as student_ids,
        GROUP_CONCAT(s.admission_no) as admission_nos,
        GROUP_CONCAT(CONCAT(p.first_name, ' ', p.last_name)) as names,
        GROUP_CONCAT(p.email SEPARATOR ',') as emails,
        GROUP_CONCAT(p.phone SEPARATOR ',') as phones,
        GROUP_CONCAT(c.name SEPARATOR ',') as classes,
        GROUP_CONCAT(s.status SEPARATOR ',') as statuses
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.deleted_at IS NULL
      LEFT JOIN classes c ON e.class_id = c.id AND c.deleted_at IS NULL
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      GROUP BY p.first_name, p.last_name
      HAVING COUNT(s.id) > 1
      ORDER BY COUNT(s.id) DESC
    `, [schoolId]);

    // Detect duplicate emails
    const [emailMatches] = await connection.execute(`
      SELECT 
        p.email,
        COUNT(s.id) as count,
        GROUP_CONCAT(s.id) as student_ids,
        GROUP_CONCAT(s.admission_no) as admission_nos,
        GROUP_CONCAT(CONCAT(p.first_name, ' ', p.last_name)) as names,
        GROUP_CONCAT(p.phone SEPARATOR ',') as phones,
        GROUP_CONCAT(c.name SEPARATOR ',') as classes,
        GROUP_CONCAT(s.status SEPARATOR ',') as statuses
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.deleted_at IS NULL
      LEFT JOIN classes c ON e.class_id = c.id AND c.deleted_at IS NULL
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND p.email IS NOT NULL AND p.email != ''
      GROUP BY p.email
      HAVING COUNT(s.id) > 1
      ORDER BY COUNT(s.id) DESC
    `, [schoolId]);

    // Detect duplicate phone numbers
    const [phoneMatches] = await connection.execute(`
      SELECT 
        p.phone,
        COUNT(s.id) as count,
        GROUP_CONCAT(s.id) as student_ids,
        GROUP_CONCAT(s.admission_no) as admission_nos,
        GROUP_CONCAT(CONCAT(p.first_name, ' ', p.last_name)) as names,
        GROUP_CONCAT(p.email SEPARATOR ',') as emails,
        GROUP_CONCAT(c.name SEPARATOR ',') as classes,
        GROUP_CONCAT(s.status SEPARATOR ',') as statuses
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.deleted_at IS NULL
      LEFT JOIN classes c ON e.class_id = c.id AND c.deleted_at IS NULL
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND p.phone IS NOT NULL AND p.phone != ''
      GROUP BY p.phone
      HAVING COUNT(s.id) > 1
      ORDER BY COUNT(s.id) DESC
    `, [schoolId]);

    // Detect duplicate admission numbers
    const [admissionMatches] = await connection.execute(`
      SELECT 
        s.admission_no,
        COUNT(s.id) as count,
        GROUP_CONCAT(s.id) as student_ids,
        GROUP_CONCAT(CONCAT(p.first_name, ' ', p.last_name)) as names,
        GROUP_CONCAT(p.email SEPARATOR ',') as emails,
        GROUP_CONCAT(p.phone SEPARATOR ',') as phones,
        GROUP_CONCAT(c.name SEPARATOR ',') as classes,
        GROUP_CONCAT(s.status SEPARATOR ',') as statuses
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.deleted_at IS NULL
      LEFT JOIN classes c ON e.class_id = c.id AND c.deleted_at IS NULL
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.admission_no IS NOT NULL AND s.admission_no != ''
      GROUP BY s.admission_no
      HAVING COUNT(s.id) > 1
      ORDER BY COUNT(s.id) DESC
    `, [schoolId]);

    // Parse results into structured format
    const processMatches = (matches: any[], type: 'name' | 'email' | 'phone' | 'admission_no', fieldKey: string) => {
      return (matches as any[]).map(match => {
        const ids = (match.student_ids || '').split(',').filter(Boolean).map(Number);
        const admissionNos = (match.admission_nos || '').split(',').filter(Boolean);
        const names = (match.names || '').split(',').filter(Boolean);
        const emails = (match.emails || '').split(',').filter(Boolean);
        const phones = (match.phones || '').split(',').filter(Boolean);
        const classes = (match.classes || '').split(',').filter(Boolean);
        const statuses = (match.statuses || '').split(',').filter(Boolean);

        const students = ids.map((id, idx) => ({
          id,
          admission_no: admissionNos[idx] || '',
          name: names[idx] || '',
          email: emails[idx] || undefined,
          phone: phones[idx] || undefined,
          class: classes[idx] || undefined,
          status: statuses[idx] || 'active'
        }));

        return {
          type,
          count: match.count || ids.length,
          students,
          matchingField: match[fieldKey] || ''
        };
      });
    };

    const duplicates: DuplicateGroup[] = [
      ...processMatches(nameMatches as any[], 'name', 'full_name'),
      ...processMatches(emailMatches as any[], 'email', 'email'),
      ...processMatches(phoneMatches as any[], 'phone', 'phone'),
      ...processMatches(admissionMatches as any[], 'admission_no', 'admission_no')
    ];

    return NextResponse.json({
      success: true,
      data: {
        totalDuplicateGroups: duplicates.length,
        totalAffectedStudents: duplicates.reduce((sum, group) => sum + group.count, 0),
        duplicates,
        summary: {
          byName: (nameMatches as any[]).length,
          byEmail: (emailMatches as any[]).length,
          byPhone: (phoneMatches as any[]).length,
          byAdmissionNo: (admissionMatches as any[]).length
        }
      }
    });
  } catch (error: any) {
    console.error('Duplicate detection error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
