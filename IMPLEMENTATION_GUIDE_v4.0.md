# DRAIS School Management System - Implementation Guide
## School Identity & Student Promotions System (v4.0)

### Overview
This guide documents the complete implementation of:
1. **School Identity Centralization** - Centralized school information management
2. **Navbar Enhancement** - Dynamic school name display
3. **Admission Letter Revamp** - Dynamic school information in admission letters
4. **Student Promotions Module** - Complete promotion and class movement system

---

## 1. DATABASE SCHEMA UPDATES

### Files Created/Modified
- **Migration File**: `database/migrations/007_school_info_and_promotions_system.sql`
- **Final Schema**: `database/FINAL_SCHEMA_v4.0_WITH_PROMOTIONS.sql`

### New Tables

#### `school_info`
Centralized school information table with fields:
- `id` (PK)
- `school_id` (FK)
- `school_name` - Official school name
- `school_motto` - School motto/tagline
- `school_address` - Physical address
- `school_contact` - Primary phone
- `school_email` - Email address
- `school_logo` - Logo URL/path
- `registration_number` - Official registration number
- `website` - School website
- `founded_year` - Year established
- `principal_name`, `principal_email`, `principal_phone`
- Timestamps: `created_at`, `updated_at`, `deleted_at`

#### `promotions`
Student promotion tracking table:
- `id` (PK)
- `school_id`, `student_id`, `from_class_id`, `to_class_id`
- `from_academic_year_id`, `to_academic_year_id`
- `promotion_status` (ENUM: promoted, not_promoted, pending, deferred)
- `criteria_used` (JSON - stores criteria applied)
- `remarks`, `promoted_by`, `approval_status`, `approved_by`
- Timestamps and soft delete support

#### `promotion_criteria`
Configuration for promotion rules:
- `minimum_total_marks`
- `minimum_average_marks`
- `minimum_subjects_passed`
- `attendance_percentage`
- Per academic year and class level

### Modified Tables

#### `students` Table
Added promotion-related columns:
```sql
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS promotion_status ENUM('promoted', 'not_promoted', 'pending') DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS last_promoted_at DATETIME DEFAULT NULL,
ADD COLUMN IF NOT EXISTS previous_class_id BIGINT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS previous_year_id BIGINT DEFAULT NULL;
```

---

## 2. BACKEND API ENDPOINTS

### School Info APIs

#### GET `/api/school-info`
Fetch current school information.

**Parameters:**
- `school_id` (optional, default: 1)

**Response:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "school_id": 1,
    "school_name": "ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL",
    "school_address": "Busembatia, Bugweri",
    "school_contact": "0706 074 179",
    "school_email": "info@albayan.ug",
    "principal_name": "Headteacher"
  }
}
```

**File**: `sourcer/app/api/school-info/route.ts`

#### PUT `/api/school-info`
Update school information.

**Request Body:**
```json
{
  "school_id": 1,
  "school_name": "School Name",
  "school_motto": "Motto",
  "school_address": "Address",
  "school_contact": "Phone",
  "school_email": "Email",
  "principal_name": "Principal Name"
}
```

---

### Promotions APIs

#### GET `/api/promotions`
Fetch students for promotion in a class/academic year.

**Parameters:**
- `school_id` (default: 1)
- `academic_year_id` (required)
- `class_id` (optional)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "admission_no": "A001/2026",
      "first_name": "John",
      "last_name": "Doe",
      "class_id": 1,
      "class_name": "Primary 1",
      "total_subjects": 8,
      "total_marks": 450,
      "average_marks": 56.25,
      "promotion_status": "pending"
    }
  ]
}
```

**File**: `sourcer/app/api/promotions/route.ts`

#### POST `/api/promotions`
Create or update promotion record for individual student.

**Request Body:**
```json
{
  "school_id": 1,
  "student_id": 1,
  "from_class_id": 1,
  "to_class_id": 2,
  "from_academic_year_id": 1,
  "to_academic_year_id": 1,
  "promotion_status": "promoted",
  "criteria_used": {
    "minimum_total_marks": 250,
    "minimum_average": 50
  },
  "promoted_by": 1
}
```

**Features:**
- Automatic class update on promotion
- Previous class stored in history
- Transaction-based for data integrity
- Enrollment update to new class

#### POST `/api/promotions/bulk`
Apply bulk promotions based on criteria.

**Request Body:**
```json
{
  "school_id": 1,
  "academic_year_id": 1,
  "from_class_id": 1,
  "criteria": {
    "minimum_total_marks": 250,
    "minimum_average": 50
  },
  "promoted_by": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Bulk promotions completed",
  "promoted_count": 28,
  "not_promoted_count": 5,
  "total_processed": 33
}
```

**File**: `sourcer/app/api/promotions/bulk/route.ts`

---

## 3. FRONTEND COMPONENTS

### School Info Settings Page

**File**: `sourcer/components/general/SchoolInfoSettings.tsx`

**Features:**
- View and edit school name, motto, address, contact details
- Update principal information
- Logo path management
- Registration number storage
- Website URL
- Real-time form validation
- Save with change tracking
- Professional form layout with sections

**Integration:**
- Added to Settings Manager component
- Tab-based navigation (School Info + General Settings)
- Responsive design for mobile/desktop

### Updated Navbar

**File**: `sourcer/components/layout/Navbar.tsx`

**Changes:**
- Fetch school name dynamically from `/api/school-info`
- Display school name below DRAIS logo on desktop
- Professional branding area with:
  - School logo (D icon)
  - School label ("SCHOOL")
  - Actual school name (from database)
- Responsive design for mobile (shows DRAIS only)
- Automatic updates when school info changes
- Fallback to default name if API unavailable

**Code Sample:**
```tsx
const { data: schoolData } = useSWR(
  `${API_BASE}/school-info`,
  fetcher,
  { revalidateOnFocus: false, dedupingInterval: 60000 }
);
const schoolName = schoolData?.data?.school_name || 'DRAIS';
```

### Updated Admission Letter

**File**: `sourcer/components/students/StudentWizard.tsx`

**Changes in `generateAdmissionPDF` function:**
- Fetch school info before generating PDF
- Use `school_name`, `school_address`, `school_contact`, `school_email` dynamically
- Professional letterhead style with:
  - School name as title
  - Full contact information
  - Updated reference format
  - School name in admission statement
  - Dynamic footer with school name
- Fallback to defaults if API unavailable
- Improved formatting and styling

**Features:**
- Dynamically pulls school name from `school_info` table
- Official name: "ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL"
- Professional structure with:
  - Letterhead (name, address, contact)
  - Document title (OFFICIAL ADMISSION LETTER)
  - Student details table
  - Parent/guardian information
  - Admission statement
  - Requirements section
  - School policies
  - Signature blocks
  - Professional footer

### Promotions Module Page

**File**: `sourcer/app/promotions/page.tsx`

**Features:**
- Academic year selection (required)
- Class filtering (optional)
- Student search by name or admission number
- Status filtering (All, Pending, Promoted, Not Promoted)
- Promotion criteria configuration:
  - Minimum total marks
  - Minimum average marks
- Individual promotion buttons (Promote/Not Promote)
- Bulk promotion based on criteria
- Summary statistics showing:
  - Promoted count
  - Not promoted count
  - Pending count
- Professional data table with:
  - Student name and details
  - Admission number
  - Current class
  - Total marks
  - Average marks
  - Promotion status badge
  - Action buttons
- Real-time updates after promotion
- Loading and error states
- Toast notifications for user feedback

**UI Components:**
- Status badges (green for promoted, red for not promoted, yellow for pending)
- Action buttons with icons
- Summary footer with statistics
- Search and filter bar
- Academic year selector
- Class level indicator

---

## 4. IMPLEMENTATION STEPS

### Step 1: Database Setup
```bash
# Run migration
mysql -u root -p drais_school < database/migrations/007_school_info_and_promotions_system.sql

# Or use final schema directly
mysql -u root -p drais_school < database/FINAL_SCHEMA_v4.0_WITH_PROMOTIONS.sql
```

### Step 2: Deploy Backend APIs
1. Copy API files to `sourcer/app/api/`:
   - `school-info/route.ts`
   - `promotions/route.ts`
   - `promotions/bulk/route.ts`
2. Verify endpoints with Postman or curl

### Step 3: Deploy Frontend Components
1. Update `SettingsManager.tsx` to include `SchoolInfoSettings`
2. Update `Navbar.tsx` with school info fetching
3. Update `StudentWizard.tsx` with dynamic admission letter
4. Create new `/promotions` page

### Step 4: Configuration
1. Update `NEXT_PUBLIC_API_BASE` environment variable
2. Ensure database connection in `lib/db.ts`
3. Configure CORS if API and frontend on different origins

### Step 5: Initial Data
1. Insert default school info:
```sql
INSERT INTO school_info (school_id, school_name, school_address, school_contact, school_email)
VALUES (1, 'ALBAYAN QURAN MEMORIZATION CENTER & PRIMARY SCHOOL', 'Busembatia, Bugweri', '0706 074 179', 'info@albayan.ug');
```

2. Configure promotion criteria for current academic year:
```sql
INSERT INTO promotion_criteria (school_id, academic_year_id, from_class_id, to_class_id, minimum_total_marks, minimum_average_marks)
VALUES (1, 1, 1, 2, 250, 50);
```

---

## 5. USAGE GUIDE

### For Administrators

#### Updating School Information
1. Navigate to **Settings → School Information**
2. Fill in school details:
   - School Name (required)
   - Address, Phone, Email
   - Principal information
   - Logo path
3. Click **Save Changes**
4. Changes reflected immediately in navbar

#### Managing Student Promotions

**Individual Promotion:**
1. Go to **Promotions** page
2. Select Academic Year and optionally filter by Class
3. Search for student using name or admission number
4. Click **Promote** or **Not Promote** button
5. Student moved to next class automatically
6. Promotion record created with timestamp

**Bulk Promotions:**
1. Select Academic Year and From Class
2. Set promotion criteria:
   - Minimum total marks
   - Minimum average marks
3. Click **Apply Bulk Promotion**
4. System automatically promotes eligible students
5. Summary shows promoted/not promoted counts

#### Generating Admission Letters
1. Create new student in **Students** module
2. When reviewing admission, click **Generate Admission Letter**
3. PDF includes:
   - School name from system settings
   - Contact information
   - Student details
   - Parent information
   - Official admission statement
   - Requirements and policies
4. Download and print

---

## 6. DATABASE VIEWS

Two helpful views created for reporting:

### `v_promotion_summary`
Shows promotion readiness for each student.

### `v_class_promotion_status`
Shows class-wise promotion statistics.

---

## 7. FILE MANIFEST

### Created Files
```
database/migrations/007_school_info_and_promotions_system.sql
database/FINAL_SCHEMA_v4.0_WITH_PROMOTIONS.sql
sourcer/app/api/school-info/route.ts
sourcer/app/api/promotions/route.ts
sourcer/app/api/promotions/bulk/route.ts
sourcer/components/general/SchoolInfoSettings.tsx
sourcer/app/promotions/page.tsx
```

### Modified Files
```
sourcer/components/general/SettingsManager.tsx
sourcer/components/layout/Navbar.tsx
sourcer/components/students/StudentWizard.tsx
```

---

## 8. TROUBLESHOOTING

### School Info Not Showing in Navbar
- Check if `/api/school-info` endpoint is accessible
- Verify database has `school_info` table
- Check `NEXT_PUBLIC_API_BASE` environment variable

### Promotions Not Working
- Verify `from_academic_year_id` and `to_academic_year_id` match existing records
- Ensure `from_class_id` and `to_class_id` exist in classes table
- Check if student exists and status is 'active'
- Verify database foreign key constraints

### PDF Generation Fails
- Ensure jsPDF and autotable libraries installed
- Check browser console for errors
- Verify school info API is accessible
- Try with default values if API unavailable

---

## 9. PERFORMANCE NOTES

### Optimization Tips
- School info fetched with 1-hour deduplication interval
- Promotions table indexed on `school_id`, `student_id`, `from_academic_year_id`
- Use `class_id` index for filtering students
- Bulk promotions use transaction for consistency

### Indexing Strategy
```sql
-- Key indexes for performance
INDEX idx_school_id (school_id)
INDEX idx_student_id (student_id)
INDEX idx_promotion_status (promotion_status)
INDEX idx_created_at (created_at)
UNIQUE KEY unique_promotion_cycle (school_id, student_id, from_academic_year_id)
```

---

## 10. SECURITY CONSIDERATIONS

1. **Data Validation**
   - All API inputs validated
   - Required fields enforced
   - JSON schema validation recommended

2. **Access Control**
   - Only authorized admins can:
     - Update school info
     - Promote/demote students
     - View promotion records
   - Implement role-based access control

3. **Audit Trail**
   - All promotions logged
   - User who performed promotion recorded
   - Timestamps for all changes
   - `deleted_at` for soft deletes

4. **Transactions**
   - Bulk operations use database transactions
   - Rollback on error ensures data consistency
   - No partial updates

---

## 11. FUTURE ENHANCEMENTS

- [ ] Bulk import of promotion criteria from CSV
- [ ] Automated promotions on specific dates
- [ ] Email notifications for promotion changes
- [ ] Approval workflow for promotions
- [ ] Promotion analytics dashboard
- [ ] Export promotion reports (PDF/Excel)
- [ ] Support for conditional promotions
- [ ] Parent portal for admission letters
- [ ] SMS notifications
- [ ] Integration with finance module (fees based on class)

---

## 12. SUPPORT & DOCUMENTATION

For issues or questions:
1. Check API response status codes
2. Verify database schema matches migration
3. Check browser console for JavaScript errors
4. Review server logs for backend errors
5. Ensure all required fields are filled

---

**Implementation Date**: February 2026  
**System Version**: DRAIS v4.0  
**Compatibility**: MySQL 8.0+, Next.js 15.5+  
**Last Updated**: February 1, 2026
