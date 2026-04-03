import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSchoolFromDB } from '@/lib/schoolDB';
import { getNextAdmissionNumber, formatAdmissionNumber } from '@/lib/admissionNumber';
import { getSessionSchoolId } from '@/lib/auth';
import { uploadStudentPhoto } from '@/lib/cloudinary';
import puppeteer from 'puppeteer';

export const config = {
  api: {
    bodyParser: false,
  },
};

function safe(v:any) { return (v === undefined || v === '') ? null : v; }

export async function GET(req: NextRequest) {
  let connection;
  try {
    // Derive school_id from authenticated session — never from query params
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const classId = searchParams.get('class_id');
    const streamId = searchParams.get('stream_id');
    const gender = searchParams.get('gender');
    const status = searchParams.get('status');

    connection = await getConnection();

    // Enhanced query to include person_id and photo_url from people table, device_user_id, and primary contact info
    let sql = `
      SELECT DISTINCT
        s.id,
        s.person_id,
        s.admission_no,
        s.status,
        s.admission_date,
        s.notes,
        p.first_name,
        p.last_name,
        p.other_name,
        p.gender,
        p.date_of_birth,
        p.phone,
        p.email,
        p.address,
        p.photo_url,
        c.name as class_name,
        c.id as class_id,
        st.name as stream_name,
        st.id as stream_id,
        d.name as district_name,
        v.name as village_name,
        dum.device_user_id,
        dum.id as device_mapping_id,
        bd.device_name,
        bd.id as device_id,
        -- Primary contact information
        cp.phone as contact_phone,
        CONCAT(cp.first_name, ' ', cp.last_name) as contact_name,
        sc.relationship as contact_relationship,
        ct.contact_type,
        -- Calculate attendance percentage
        COALESCE(
          (SELECT ROUND(
            (COUNT(CASE WHEN sa.status = 'present' THEN 1 END) * 100.0) /
            NULLIF(COUNT(*), 0), 2
          )
          FROM student_attendance sa
          WHERE sa.student_id = s.id
          AND sa.date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          ), 0
        ) as attendance_percentage
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN villages v ON s.village_id = v.id
      LEFT JOIN parishes pa ON v.parish_id = pa.id
      LEFT JOIN subcounties scc ON pa.subcounty_id = scc.id
      LEFT JOIN counties co ON scc.county_id = co.id
      LEFT JOIN districts d ON co.district_id = d.id
      LEFT JOIN device_user_mappings dum ON s.id = dum.student_id AND dum.school_id = ?
      LEFT JOIN biometric_devices bd ON dum.device_id = bd.id
      LEFT JOIN student_contacts sc ON s.id = sc.student_id AND sc.is_primary = 1
      LEFT JOIN contacts ct ON sc.contact_id = ct.id
      LEFT JOIN people cp ON ct.person_id = cp.id
      WHERE s.deleted_at IS NULL AND s.school_id = ?
    `;

    const params: any[] = [schoolId, schoolId];

    // Add search filter with normalization
    if (query && query.trim()) {
      // Trim and normalize search query
      const normalizedQuery = query.trim().toLowerCase();
      const searchTerm = `%${normalizedQuery}%`;
      
      sql += ` AND (
        LOWER(p.first_name) LIKE LOWER(?) OR 
        LOWER(p.last_name) LIKE LOWER(?) OR 
        LOWER(p.other_name) LIKE LOWER(?) OR
        LOWER(s.admission_no) LIKE LOWER(?) OR
        LOWER(CONCAT(p.first_name, ' ', p.last_name)) LIKE LOWER(?)
      )`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Add class filter
    if (classId) {
      sql += ` AND c.id = ?`;
      params.push(classId);
    }

    // Add stream filter
    if (streamId) {
      sql += ` AND st.id = ?`;
      params.push(streamId);
    }

    // Add gender filter
    if (gender) {
      sql += ` AND p.gender = ?`;
      params.push(gender);
    }

    // Add status filter
    if (status) {
      sql += ` AND s.status = ?`;
      params.push(status);
    }

    sql += ` ORDER BY COALESCE(p.last_name, '') ASC, COALESCE(p.first_name, '') ASC`;

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows,
      total: Array.isArray(rows) ? rows.length : 0
    });

  } catch (error: any) {
    console.error('Error fetching students:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch students',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const body: any = {};
    for (const [key, value] of form.entries()) {
      if (key === 'photo' && value instanceof File) {
        // Upload photo to Cloudinary instead of saving locally
        const buffer = Buffer.from(await value.arrayBuffer());
        try {
          const result = await uploadStudentPhoto(buffer, value.size, 'drais/students');
          body.photo_url = result.secure_url;
        } catch (uploadErr) {
          console.error('[students/full] Cloudinary upload failed:', uploadErr);
          body.photo_url = null;
        }
      } else if (key === 'contacts') {
        try { body.contacts = JSON.parse(value as string); } catch { body.contacts = []; }
      } else {
        body[key] = value;
      }
    }
    
    // Apply safe() to all fields EXCEPT school_id
    Object.keys(body).forEach(k => { 
      if (k !== 'school_id' && k !== 'schoolId') {
        body[k] = safe(body[k]); 
      }
    });
    
    // Derive school_id from authenticated session — never hardcode
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    // session.schoolId is the correct camelCase field returned by getSessionSchoolId()
    const schoolId = session.schoolId;
    body.schoolId = schoolId;
    body.school_id = schoolId;
    
    // Validate required fields
    if (!body.first_name || !body.last_name) {
      return NextResponse.json({ error: 'First name and last name are required.' }, { status: 400 });
    }
    // Map secular_class_id to class_id for enrollments
    body.class_id = body.secular_class_id;
    const connection = await getConnection();
    try {
      await connection.beginTransaction();
      
      // Insert person — let the DB assign id via AUTO_INCREMENT
      const [personResult]: any = await connection.execute(
        'INSERT INTO people (school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [schoolId, safe(body.first_name), safe(body.last_name), safe(body.other_name), safe(body.gender), safe(body.date_of_birth), safe(body.phone), safe(body.email), safe(body.address), safe(body.photo_url)]
      );
      const newPersonId = personResult.insertId;
      
      // Generate sequential admission number if not provided
      let admission_no = body.admission_no;
      if (!admission_no) {
        // Get the next sequence number using the same connection (in transaction)
        const [seqResult]: any = await connection.execute(
          `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(admission_no, '/', -2), '/', 1) AS UNSIGNED)), 0) + 1 as next_seq
           FROM students
           WHERE school_id = ? AND admission_no IS NOT NULL AND admission_no LIKE 'XHN/%'`,
          [schoolId]
        );
        const nextSeq = seqResult[0]?.next_seq || 1;
        admission_no = formatAdmissionNumber(nextSeq, schoolId);
      }
      
      // Insert student — let the DB assign id via AUTO_INCREMENT
      const [studentResult]: any = await connection.execute(
        'INSERT INTO students (school_id, person_id, admission_no, village_id, admission_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [schoolId, newPersonId, admission_no, safe(body.village_id), safe(body.admission_date), safe(body.status) || 'active', safe(body.notes)]
      );
      const newStudentId = studentResult.insertId;
      
      // Insert enrollment
      await connection.execute(
        'INSERT INTO enrollments (student_id, class_id, theology_class_id, stream_id, academic_year_id, term_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [newStudentId, safe(body.class_id), safe(body.theology_class_id), safe(body.stream_id), safe(body.academic_year_id), safe(body.term_id), 'active']
      );
      // Seed fee items for learner from fee_structures if class & term provided
      if(body.class_id && body.term_id){
        const [structs]: any = await connection.execute('SELECT item, amount FROM fee_structures WHERE class_id=? AND term_id=?',[body.class_id, body.term_id]);
        if(structs.length){
          const values: any[] = [];
            // columns: student_id, term_id, item, amount, discount, paid
          for(const s of structs){
            values.push(newStudentId, body.term_id, s.item, s.amount, 0, 0);
          }
          const placeholders = structs.map(()=>'(?,?,?,?,?,?)').join(',');
          await connection.execute(`INSERT INTO student_fee_items (student_id, term_id, item, amount, discount, paid) VALUES ${placeholders}`, values);
        }
      }
      if (Array.isArray(body.contacts)) {
        for (const c of body.contacts) {
          Object.keys(c).forEach(k => { c[k] = safe(c[k]); });
          
          // Insert contact with AUTO_INCREMENT
          const [contactResult]: any = await connection.execute(
            'INSERT INTO contacts (school_id, person_id, contact_type, occupation, alive_status, date_of_death) VALUES (?, ?, ?, ?, ?, ?)',
            [schoolId, newPersonId, safe(c.contact_type), safe(c.occupation), safe(c.alive_status), safe(c.date_of_death)]
          );
          const newContactId = contactResult.insertId;
          
          // Insert student_contact with AUTO_INCREMENT
          await connection.execute(
            'INSERT INTO student_contacts (student_id, contact_id, relationship, is_primary) VALUES (?, ?, ?, ?)',
            [newStudentId, newContactId, safe(c.relationship), safe(c.is_primary)]
          );
        }
      }
      await connection.commit();
      
      // Use the generated admission number
      const finalAdmissionNo = admission_no;
      
      // Use newStudentId and newPersonId consistently
      const student_id = newStudentId;
      const person_id = newPersonId;
      
      // Get school info from database (single source of truth)
      const schoolInfo = await getSchoolFromDB(schoolId);
      const schoolName = schoolInfo.name;
      const schoolAddress = schoolInfo.address || '';
      const schoolPhone = schoolInfo.phone || '';
      const schoolEmail = schoolInfo.email || '';
      const schoolShortCode = schoolInfo.short_code || 'DRAIS';
      
      // Generate PDF admission form
      const pdfHtml = `
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; margin: 40px; }
            h1 { color: #1a237e; text-align: center; }
            .header { text-align: center; margin-bottom: 30px; }
            .section { margin-bottom: 24px; }
            .label { font-weight: bold; color: #333; }
            .value { margin-left: 8px; }
            .info-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
            .info-table td { padding: 6px 12px; border-bottom: 1px solid #eee; }
            .info-table .label { width: 180px; font-weight: bold; }
            .signature-section { margin-top: 40px; display: flex; justify-content: space-between; }
            .signature-block { width: 200px; text-align: center; }
            .signature-line { border-top: 1px solid #333; margin-top: 40px; padding-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>OFFICIAL ADMISSION LETTER</h1>
            <p><strong>${schoolName}</strong></p>
            <p>${schoolAddress}</p>
            <p>Tel: ${schoolPhone} | Email: ${schoolEmail}</p>
            <hr style="margin: 20px 0;">
          </div>
          
          <div class="section">
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Ref:</strong> ${schoolShortCode}/ADM/${admission_no}/${new Date().getFullYear()}</p>
          </div>
          
          <div class="section">
            <h3>STUDENT ADMISSION DETAILS</h3>
            <table class="info-table">
              <tr><td class="label">Admission Number</td><td>${admission_no}</td></tr>
              <tr><td class="label">Student Name</td><td>${body.first_name} ${body.last_name} ${body.other_name || ''}</td></tr>
              <tr><td class="label">Gender</td><td>${body.gender || '-'}</td></tr>
              <tr><td class="label">Date of Birth</td><td>${body.date_of_birth || '-'}</td></tr>
              <tr><td class="label">Phone</td><td>${body.phone || '-'}</td></tr>
              <tr><td class="label">Address</td><td>${body.address || '-'}</td></tr>
              <tr><td class="label">Admission Date</td><td>${new Date().toLocaleDateString()}</td></tr>
            </table>
          </div>
          
          <div class="section">
            <h3>ACADEMIC INFORMATION</h3>
            <table class="info-table">
              <tr><td class="label">Secular Class</td><td>${body.class_id || 'To be assigned'}</td></tr>
              <tr><td class="label">Theology Class</td><td>${body.theology_class_id || 'To be assigned'}</td></tr>
              <tr><td class="label">Academic Year</td><td>${body.academic_year_id || 'Current Year'}</td></tr>
              <tr><td class="label">Term</td><td>${body.term_id || 'Current Term'}</td></tr>
            </table>
          </div>
          
          ${(body.contacts && body.contacts.length > 0) ? `
          <div class="section">
            <h3>PARENT/GUARDIAN INFORMATION</h3>
            <ul>
              ${body.contacts.map((c:any) => `
                <li><strong>${c.contact_type}:</strong> ${c.name || '-'} 
                ${c.contact ? `(${c.contact})` : ''} 
                ${c.occupation ? `- ${c.occupation}` : ''} 
                ${c.alive_status && c.alive_status !== 'unknown' ? `- ${c.alive_status}` : ''}
                </li>
              `).join('')}
            </ul>
          </div>
          ` : ''}
          
          <div class="section">
            <h3>ADMISSION STATEMENT</h3>
            <p>We are pleased to inform you that <strong>${body.first_name} ${body.last_name}</strong> has been officially admitted to ${schoolName} for the academic year ${new Date().getFullYear()}. This admission is subject to the terms and conditions outlined in our school handbook.</p>
          </div>
          
          <div class="section">
            <h3>REQUIREMENTS</h3>
            <ul>
              <li>Complete and submit all required documentation</li>
              <li>Payment of admission fees as per school fee structure</li>
              <li>Medical examination and vaccination records</li>
              <li>Previous school records and transcripts (if applicable)</li>
              <li>Passport-size photographs (4 copies)</li>
              <li>Copy of birth certificate or identification documents</li>
            </ul>
          </div>
          
          <div class="signature-section">
            <div class="signature-block">
              <div class="signature-line">Headteacher</div>
              <p>Date: _____________</p>
            </div>
            <div class="signature-block">
              <div class="signature-line">Parent/Guardian</div>
              <p>Date: _____________</p>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 40px; font-style: italic; font-size: 12px;">
            <p>This is an official document from ${schoolName}. Please keep this letter for your records.</p>
          </div>
        </body>
        </html>
      `;
      
      const pdfDir = path.join(process.cwd(), 'public', 'admissions');
      await fs.mkdir(pdfDir, { recursive: true });
      const pdfPath = path.join(pdfDir, `admission_${student_id}.pdf`);
      
      let pdfUrl = null;
      try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(pdfHtml, { waitUntil: 'networkidle0' });
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        await browser.close();
        
        pdfUrl = `/admissions/admission_${student_id}.pdf`;
      } catch (pdfError) {
        console.error('PDF generation failed:', pdfError);
      }
      
      // Close connection before sending response
      await connection.end();
      
      return NextResponse.json({ 
        success: true, 
        student_id, 
        person_id, 
        admission_no,
        pdf_url: pdfUrl,
        message: pdfUrl ? 'Student admitted successfully' : 'Student admitted but PDF generation failed'
      }, { status: 201 });
      
    } catch (e: any) {
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error('Rollback error:', rollbackError);
        }
        try {
          await connection.end();
        } catch (closeError) {
          console.error('Close error:', closeError);
        }
      }
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
