import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import path from 'path';
import fs from 'fs/promises';
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
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    const classId = searchParams.get('class_id');
    const streamId = searchParams.get('stream_id');
    const gender = searchParams.get('gender');
    const status = searchParams.get('status');

    connection = await getConnection();

    // Enhanced query to include person_id and photo_url from people table
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
      LEFT JOIN subcounties sc ON pa.subcounty_id = sc.id
      LEFT JOIN counties co ON sc.county_id = co.id
      LEFT JOIN districts d ON co.district_id = d.id
      WHERE s.deleted_at IS NULL
    `;

    const params: any[] = [];

    // Add search filter
    if (query) {
      sql += ` AND (
        p.first_name LIKE ? OR 
        p.last_name LIKE ? OR 
        p.other_name LIKE ? OR
        s.admission_no LIKE ? OR
        CONCAT(p.first_name, ' ', p.last_name) LIKE ?
      )`;
      const searchTerm = `%${query}%`;
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

    sql += ` ORDER BY p.first_name, p.last_name`;

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
        // Save photo file
        const buffer = Buffer.from(await value.arrayBuffer());
        const fileName = Date.now() + '-' + value.name;
        const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'students');
        await fs.mkdir(uploadDir, { recursive: true });
        await fs.writeFile(path.join(uploadDir, fileName), buffer);
        body.photo_url = '/uploads/students/' + fileName;
      } else if (key === 'contacts') {
        try { body.contacts = JSON.parse(value as string); } catch { body.contacts = []; }
      } else {
        body[key] = value;
      }
    }
    
    // Apply safe() to all fields EXCEPT school_id
    Object.keys(body).forEach(k => { 
      if (k !== 'school_id') {
        body[k] = safe(body[k]); 
      }
    });
    
    // Always set school_id to 1 (number, not null)
    body.school_id = 1;
    
    // Validate required fields
    if (!body.first_name || !body.last_name) {
      return NextResponse.json({ error: 'First name and last name are required.' }, { status: 400 });
    }
    // Map secular_class_id to class_id for enrollments
    body.class_id = body.secular_class_id;
    const connection = await getConnection();
    try {
      await connection.beginTransaction();
      const [personRes] = await connection.execute(
        'INSERT INTO people (school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [1, safe(body.first_name), safe(body.last_name), safe(body.other_name), safe(body.gender), safe(body.date_of_birth), safe(body.phone), safe(body.email), safe(body.address), safe(body.photo_url)]
      );
      const person_id = (personRes as any).insertId;
      const [studentRes] = await connection.execute(
        'INSERT INTO students (school_id, person_id, admission_no, village_id, admission_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [1, person_id, safe(body.admission_no), safe(body.village_id), safe(body.admission_date), safe(body.status), safe(body.notes)]
      );
      const student_id = (studentRes as any).insertId;
      await connection.execute(
        'INSERT INTO enrollments (student_id, class_id, theology_class_id, stream_id, academic_year_id, term_id, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [student_id, safe(body.class_id), safe(body.theology_class_id), safe(body.stream_id), safe(body.academic_year_id), safe(body.term_id), 'active']
      );
      // Seed fee items for learner from fee_structures if class & term provided
      if(body.class_id && body.term_id){
        const [structs]: any = await connection.execute('SELECT item, amount FROM fee_structures WHERE class_id=? AND term_id=?',[body.class_id, body.term_id]);
        if(structs.length){
          const values: any[] = [];
            // columns: student_id, term_id, item, amount, discount, paid
          for(const s of structs){
            values.push(student_id, body.term_id, s.item, s.amount, 0, 0);
          }
          const placeholders = structs.map(()=>'(?,?,?,?,?,?)').join(',');
          await connection.execute(`INSERT INTO student_fee_items (student_id, term_id, item, amount, discount, paid) VALUES ${placeholders}`, values);
        }
      }
      if (Array.isArray(body.contacts)) {
        for (const c of body.contacts) {
          Object.keys(c).forEach(k => { c[k] = safe(c[k]); });
          const [contactRes] = await connection.execute(
            'INSERT INTO contacts (school_id, person_id, contact_type, occupation, alive_status, date_of_death) VALUES (?, ?, ?, ?, ?, ?)',
            [1, person_id, safe(c.contact_type), safe(c.occupation), safe(c.alive_status), safe(c.date_of_death)]
          );
          const contact_id = (contactRes as any).insertId;
          await connection.execute(
            'INSERT INTO student_contacts (student_id, contact_id, relationship, is_primary) VALUES (?, ?, ?, ?)',
            [student_id, contact_id, safe(c.relationship), safe(c.is_primary)]
          );
        }
      }
      await connection.commit();
      await connection.end();
      
      // Generate admission number if not provided
      const admission_no = body.admission_no || `XHN/${student_id.toString().padStart(4, '0')}/2025`;
      
      // Update student with admission number
      if (!body.admission_no) {
        const updateConnection = await getConnection();
        await updateConnection.execute(
          'UPDATE students SET admission_no = ? WHERE id = ?',
          [admission_no, student_id]
        );
        await updateConnection.end();
      }
      
      // Get school name from database
      let schoolName = 'Ibun Baz Girls Secondary School';
      let schoolAddress = 'Kampala, Uganda';
      try {
        const [schoolRows] = await connection.execute(
          'SELECT name, address FROM schools WHERE id = ? LIMIT 1',
          [1]
        );
        if (schoolRows && (schoolRows as any[]).length > 0) {
          schoolName = (schoolRows as any[])[0].name || schoolName;
          schoolAddress = (schoolRows as any[])[0].address || schoolAddress;
        }
      } catch (schoolError) {
        console.error('Error fetching school name:', schoolError);
      }
      
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
            <p>Tel: +256 700 123 456 | Email: info@draisschool.ac.ug</p>
            <hr style="margin: 20px 0;">
          </div>
          
          <div class="section">
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Ref:</strong> HILLSIDEWAYS/ADM/${admission_no}/2025</p>
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
      
      try {
        const browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(pdfHtml, { waitUntil: 'networkidle0' });
        await page.pdf({ path: pdfPath, format: 'A4', printBackground: true });
        await browser.close();
        
        const pdfUrl = `/admissions/admission_${student_id}.pdf`;
        
        return NextResponse.json({ 
          success: true, 
          student_id, 
          person_id, 
          admission_no,
          pdf_url: pdfUrl 
        }, { status: 201 });
      } catch (pdfError) {
        console.error('PDF generation failed:', pdfError);
        // Return success even if PDF fails
        return NextResponse.json({ 
          success: true, 
          student_id, 
          person_id, 
          admission_no,
          pdf_url: null,
          pdf_error: 'PDF generation failed but student was created successfully'
        }, { status: 201 });
      }
      
    } catch (e: any) {
      await connection.rollback();
      await connection.end();
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
