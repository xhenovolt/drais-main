import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    
    const connection = await getConnection();
    
    // Enrollment trends by class
    const enrollmentByClass = await connection.execute(`
      SELECT 
        c.name as class_name,
        COUNT(CASE WHEN s.status = 'active' THEN 1 END) as active_students,
        COUNT(CASE WHEN s.status = 'inactive' THEN 1 END) as inactive_students,
        COUNT(CASE WHEN p.gender = 'M' AND s.status = 'active' THEN 1 END) as male_students,
        COUNT(CASE WHEN p.gender = 'F' AND s.status = 'active' THEN 1 END) as female_students,
        AVG(
          CASE 
            WHEN s.admission_date IS NOT NULL AND s.admission_date != '' 
            THEN DATEDIFF(CURDATE(), CAST(s.admission_date AS DATE))
            ELSE NULL
          END
        ) as avg_days_enrolled
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      GROUP BY c.id, c.name
      ORDER BY active_students DESC
    `, [schoolId]);

    // New admissions trend
    const newAdmissions = await connection.execute(`
      SELECT 
        DATE_FORMAT(CAST(s.admission_date AS DATE), '%Y-%m') as admission_month,
        COUNT(s.id) as new_admissions,
        COUNT(CASE WHEN p.gender = 'M' THEN 1 END) as male_admissions,
        COUNT(CASE WHEN p.gender = 'F' THEN 1 END) as female_admissions
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      WHERE s.school_id = ? 
      AND s.deleted_at IS NULL
      AND s.admission_date IS NOT NULL
      AND s.admission_date != ''
      AND CAST(s.admission_date AS DATE) >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(CAST(s.admission_date AS DATE), '%Y-%m')
      ORDER BY admission_month DESC
    `, [schoolId]);

    // Dropout analysis
    const dropoutAnalysis = await connection.execute(`
      SELECT 
        c.name as class_name,
        COUNT(CASE WHEN s.status = 'inactive' THEN 1 END) as dropouts,
        COUNT(s.id) as total_ever_enrolled,
        ROUND(COUNT(CASE WHEN s.status = 'inactive' THEN 1 END) / NULLIF(COUNT(s.id), 0) * 100, 2) as dropout_rate,
        AVG(
          CASE 
            WHEN s.status = 'inactive' 
              AND s.updated_at IS NOT NULL 
              AND s.updated_at != ''
              AND s.admission_date IS NOT NULL
              AND s.admission_date != ''
            THEN DATEDIFF(
              CAST(s.updated_at AS DATE), 
              CAST(s.admission_date AS DATE)
            )
            ELSE NULL
          END
        ) as avg_days_before_dropout
      FROM students s
      JOIN enrollments e ON s.id = e.student_id
      JOIN classes c ON e.class_id = c.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      GROUP BY c.id, c.name
      ORDER BY dropout_rate DESC
    `, [schoolId]);

    // Retention by academic year
    const retentionByYear = await connection.execute(`
      SELECT 
        ay.name as academic_year,
        COUNT(DISTINCT s.id) as total_students,
        COUNT(CASE WHEN s.status = 'active' THEN 1 END) as retained_students,
        ROUND(COUNT(CASE WHEN s.status = 'active' THEN 1 END) / NULLIF(COUNT(DISTINCT s.id), 0) * 100, 2) as retention_rate
      FROM students s
      JOIN enrollments e ON s.id = e.student_id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      GROUP BY ay.id, ay.name
      ORDER BY ay.name DESC
    `, [schoolId]);

    // Geographic distribution
    const geographicDistribution = await connection.execute(`
      SELECT 
        d.name as district_name,
        c.name as county_name,
        COUNT(s.id) as student_count,
        COUNT(CASE WHEN p.gender = 'M' THEN 1 END) as male_count,
        COUNT(CASE WHEN p.gender = 'F' THEN 1 END) as female_count
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN villages v ON s.village_id = v.id
      LEFT JOIN parishes pa ON v.parish_id = pa.id
      LEFT JOIN subcounties sc ON pa.subcounty_id = sc.id
      LEFT JOIN counties c ON sc.county_id = c.id
      LEFT JOIN districts d ON c.district_id = d.id
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY d.id, d.name, c.id, c.name
      HAVING student_count > 0
      ORDER BY student_count DESC
      LIMIT 20
    `, [schoolId]);

    // Age distribution
    const ageDistribution = await connection.execute(`
      SELECT 
        CASE 
          WHEN p.date_of_birth IS NULL OR p.date_of_birth = '' THEN 'Unknown'
          WHEN YEAR(CURDATE()) - YEAR(CAST(p.date_of_birth AS DATE)) < 6 THEN 'Under 6'
          WHEN YEAR(CURDATE()) - YEAR(CAST(p.date_of_birth AS DATE)) BETWEEN 6 AND 10 THEN '6-10'
          WHEN YEAR(CURDATE()) - YEAR(CAST(p.date_of_birth AS DATE)) BETWEEN 11 AND 15 THEN '11-15'
          WHEN YEAR(CURDATE()) - YEAR(CAST(p.date_of_birth AS DATE)) BETWEEN 16 AND 20 THEN '16-20'
          ELSE 'Over 20'
        END as age_group,
        COUNT(s.id) as student_count,
        COUNT(CASE WHEN p.gender = 'M' THEN 1 END) as male_count,
        COUNT(CASE WHEN p.gender = 'F' THEN 1 END) as female_count
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY age_group
      ORDER BY 
        CASE age_group
          WHEN 'Under 6' THEN 1
          WHEN '6-10' THEN 2
          WHEN '11-15' THEN 3
          WHEN '16-20' THEN 4
          WHEN 'Over 20' THEN 5
          ELSE 6
        END
    `, [schoolId]);

    await connection.end();

    return NextResponse.json({
      success: true,
      data: {
        enrollmentByClass: enrollmentByClass[0],
        newAdmissions: newAdmissions[0],
        dropoutAnalysis: dropoutAnalysis[0],
        retentionByYear: retentionByYear[0],
        geographicDistribution: geographicDistribution[0],
        ageDistribution: ageDistribution[0]
      }
    });
  } catch (error: any) {
    console.error('Error fetching enrollment analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
