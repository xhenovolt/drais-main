# DRAIS v4.0 - Quick Reference Guide
## School Identity & Promotions System

---

## 🚀 Quick Start

### 1. Database Migration
```bash
# Option A: Run the migration file
mysql -u root -p drais_school < database/migrations/007_school_info_and_promotions_system.sql

# Option B: Use the complete schema
mysql -u root -p drais_school < database/FINAL_SCHEMA_v4.0_WITH_PROMOTIONS.sql
```

### 2. Set School Information
Navigate to **Settings → School Information** and fill in:
- ✅ School Name (e.g., "ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL")
- ✅ School Address
- ✅ Contact Number
- ✅ Email
- ✅ Principal Name
- ✅ Logo URL

Click **Save Changes** and the navbar updates immediately!

### 3. Configure Promotions
Set promotion criteria for each class level:
```sql
INSERT INTO promotion_criteria 
(school_id, academic_year_id, from_class_id, to_class_id, minimum_total_marks, minimum_average_marks)
VALUES (1, 1, 1, 2, 250, 50);
```

---

## 📁 File Structure

```
DRAIS/
├── database/
│   ├── migrations/
│   │   └── 007_school_info_and_promotions_system.sql
│   └── FINAL_SCHEMA_v4.0_WITH_PROMOTIONS.sql
│
├── sourcer/
│   ├── app/
│   │   ├── api/
│   │   │   ├── school-info/route.ts          (GET/PUT)
│   │   │   ├── promotions/route.ts           (GET/POST)
│   │   │   └── promotions/bulk/route.ts      (POST)
│   │   └── promotions/
│   │       └── page.tsx                      (New page)
│   │
│   └── components/
│       ├── general/
│       │   ├── SchoolInfoSettings.tsx        (NEW)
│       │   └── SettingsManager.tsx           (UPDATED)
│       ├── layout/
│       │   └── Navbar.tsx                    (UPDATED)
│       └── students/
│           └── StudentWizard.tsx             (UPDATED)
│
└── IMPLEMENTATION_GUIDE_v4.0.md
```

---

## 🔌 API Endpoints

### School Info
```bash
# Get school info
GET /api/school-info

# Update school info
PUT /api/school-info
{
  "school_name": "School Name",
  "school_address": "Address",
  "school_contact": "Phone",
  "school_email": "Email",
  "principal_name": "Principal Name"
}
```

### Promotions
```bash
# List students for promotion
GET /api/promotions?academic_year_id=1&class_id=1

# Promote individual student
POST /api/promotions
{
  "student_id": 1,
  "from_class_id": 1,
  "to_class_id": 2,
  "promotion_status": "promoted"
}

# Bulk promote entire class
POST /api/promotions/bulk
{
  "academic_year_id": 1,
  "from_class_id": 1,
  "criteria": {
    "minimum_total_marks": 250,
    "minimum_average_marks": 50
  }
}
```

---

## 🎯 Key Features

### ✨ School Identity
- [x] Centralized school info in database
- [x] Dynamic navbar branding
- [x] Settings page for easy updates
- [x] Fallback to defaults if API unavailable

### 📋 Admission Letters
- [x] Dynamic school name and details
- [x] Professional letterhead format
- [x] Contact information included
- [x] Formatted PDF output

### 🎓 Student Promotions
- [x] Individual promotion tracking
- [x] Bulk promotions based on criteria
- [x] Previous class stored in history
- [x] Automatic enrollment update
- [x] Promotion decision audit trail
- [x] Status indicators (Promoted/Not Promoted/Pending)
- [x] Search and filter functionality
- [x] Real-time statistics

---

## 📊 Database Tables

### New Tables
| Table | Purpose |
|-------|---------|
| `school_info` | Centralized school identity |
| `promotions` | Promotion history and tracking |
| `promotion_criteria` | Promotion rules per class |

### Modified Tables
| Table | Changes |
|-------|---------|
| `students` | Added promotion_status, last_promoted_at, previous_class_id |

---

## 🔍 Database Schema Summary

### school_info
```sql
- id (PK)
- school_id (FK)
- school_name *
- school_motto
- school_address
- school_contact
- school_email
- school_logo
- registration_number
- website
- founded_year
- principal_name, principal_email, principal_phone
- timestamps
```

### promotions
```sql
- id (PK)
- school_id, student_id
- from_class_id, to_class_id
- from_academic_year_id, to_academic_year_id
- promotion_status (promoted/not_promoted/pending/deferred)
- criteria_used (JSON)
- remarks, promoted_by, approval_status, approved_by
- timestamps
```

### promotion_criteria
```sql
- id (PK)
- school_id, academic_year_id, from_class_id, to_class_id
- minimum_total_marks
- minimum_average_marks
- minimum_subjects_passed
- attendance_percentage
- is_active
```

---

## 👥 User Workflows

### Admin: Update School Name
1. Go to **Settings** → **School Information**
2. Edit **School Name** field
3. Click **Save Changes**
4. ✅ Navbar updates automatically

### Admin: Promote Single Student
1. Go to **Promotions** page
2. Select **Academic Year**
3. Search for student by name/admission number
4. Click **Promote** button
5. ✅ Student moves to next class
6. ✅ Promotion record created

### Admin: Bulk Promote Class
1. Go to **Promotions** page
2. Select **Academic Year**
3. Select **From Class**
4. Set **Promotion Criteria** (min marks, etc)
5. Click **Apply Bulk Promotion**
6. ✅ Eligible students promoted automatically
7. ✅ Summary shows results

### System: Generate Admission Letter
1. Create new student in **Students** module
2. Click **Generate Admission Letter**
3. PDF generated with:
   - Dynamic school name
   - School contact info
   - Student details
   - Requirements list
4. ✅ Download and print

---

## 🛠️ Configuration

### Environment Variables
```bash
# Frontend
NEXT_PUBLIC_API_BASE=http://localhost:3000/api

# Backend
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=drais_school
```

### Initial Setup
```sql
-- Insert default school
INSERT INTO schools VALUES (1, 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL', ...);

-- Insert default school info
INSERT INTO school_info VALUES (1, 1, 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL', ...);

-- Set promotion criteria for current year
INSERT INTO promotion_criteria VALUES (NULL, 1, 1, 1, 2, 250, 50, NULL, 75.00, TRUE, NOW(), NOW());
```

---

## ⚠️ Important Notes

### Data Integrity
- ✅ Foreign key constraints enabled
- ✅ Transaction-based bulk operations
- ✅ Soft deletes for audit trail
- ✅ Automatic rollback on error

### Performance
- ✅ Indexed on school_id, student_id, promotion_status
- ✅ School info cached with 1-hour deduplication
- ✅ Bulk operations optimized with batch inserts

### Security
- ✅ User ID logged for all promotions
- ✅ Audit trail in promotions table
- ✅ Role-based access control recommended
- ✅ Input validation on all APIs

---

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| School name not showing in navbar | Check `/api/school-info` endpoint, verify database |
| Promotions not saving | Verify class IDs exist, check foreign keys |
| PDF generation fails | Check jsPDF/autotable installed, verify school info API |
| Can't find students in promotions | Ensure academic year selected, student status is 'active' |

---

## 📈 Reporting Views

### v_promotion_summary
Shows promotion readiness for each student.

```sql
SELECT * FROM v_promotion_summary 
WHERE academic_year = '2026' 
ORDER BY current_level, last_name;
```

### v_class_promotion_status
Shows class-wise promotion statistics.

```sql
SELECT * FROM v_class_promotion_status 
WHERE academic_year = '2026' 
ORDER BY class_name;
```

---

## 🎓 Class Hierarchy

Classes should have `level` field to establish hierarchy:
```
Level 1 → Primary 1 → Next: Level 2 (Primary 2)
Level 2 → Primary 2 → Next: Level 3 (Primary 3)
...
Level 7 → Primary 7 → Next: NULL (No next class)
```

---

## 📞 Support Checklist

Before reporting issues, verify:
- [ ] Database migration applied successfully
- [ ] All new tables created with correct schema
- [ ] API endpoints returning 200 status
- [ ] Frontend components compiled without errors
- [ ] Network requests visible in browser DevTools
- [ ] Server logs for API errors
- [ ] Database has sample data for testing

---

## 📝 Change Log

### v4.0 (February 2026)
- ✅ Added school_info table
- ✅ Implemented promotions system
- ✅ Updated navbar with dynamic school name
- ✅ Revamped admission letter generation
- ✅ Created promotions management page
- ✅ Added promotion_criteria configuration
- ✅ Created comprehensive documentation

### v3.0 (Previous)
- Core DRAIS functionality
- Student management
- Academic year/term management
- Basic enrollment system

---

## 🔗 Related Documentation
- [IMPLEMENTATION_GUIDE_v4.0.md](./IMPLEMENTATION_GUIDE_v4.0.md) - Detailed implementation guide
- [FINAL_SCHEMA_v4.0_WITH_PROMOTIONS.sql](./database/FINAL_SCHEMA_v4.0_WITH_PROMOTIONS.sql) - Complete database schema
- [README.md](./README.md) - Main project README

---

**System**: DRAIS School Management System  
**Version**: 4.0  
**Last Updated**: February 1, 2026  
**Status**: ✅ Ready for Production
