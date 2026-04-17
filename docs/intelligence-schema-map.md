# DRAIS Intelligence Schema Map
_Generated: 2026-04-17_

## Core Academic Chain

```
students (3,504 active)
  └─ person_id → people (first_name, last_name, gender)
  └─ school_id (tenant fence)

enrollments (5,614 active)
  ├─ student_id → students
  ├─ class_id → classes
  ├─ academic_year_id → academic_years
  ├─ term_id → terms
  ├─ study_mode_id → study_modes
  └─ program_id → programs

class_results (7,508 rows — PRIMARY INTELLIGENCE SOURCE)
  ├─ student_id → students
  ├─ subject_id → subjects
  ├─ term_id → terms
  ├─ result_type_id → result_types (Midterm / Endterm / CAT)
  ├─ academic_year_id → academic_years
  ├─ score decimal(5,2)
  ├─ grade varchar(10)
  └─ academic_type ENUM('secular','theology')

results (16,579 rows — exam-linked)
  ├─ exam_id → exams
  ├─ student_id → students
  └─ score decimal(5,2)

exams
  ├─ class_id → classes
  ├─ subject_id → subjects
  └─ term_id → terms

student_attendance (0 rows currently)
  ├─ student_id → students
  ├─ date, status (present/absent/late)
  ├─ term_id, academic_year_id
  └─ school_id
```

## Key Relationships for Intelligence Queries

### Performance Trend Chain
`students → class_results (join on student_id) → terms (join on term_id) → subjects`

### Enrollment Consistency Chain
`students → enrollments → academic_years + terms + classes + programs`

### Class-Level Performance
`classes → class_results (join on class_id via enrollments) → subjects → result_types`

## Term Structure (live data)
| id    | name      | academic_year | status    |
|-------|-----------|---------------|-----------|
| 30004 | Term III  | 8001 (2025)   | completed |
| 30005 | Term I    | 8002 (2026)   | active    |

## Data Distribution
- `class_results`: Term III (2025) = 586 students / 5,440 scores, avg 68.1
- `class_results`: Term I (2026)  = 400 students / 2,065 scores, avg 60.1
- `results` (exam-linked): Terms 60004/60005 = 662 students, 15,790 scores

## Key Fields for Intelligence Engine
| Use Case              | Table          | Key Columns                      |
|-----------------------|----------------|----------------------------------|
| Trend detection       | class_results  | student_id, term_id, score       |
| Subject risk          | class_results  | subject_id, score                |
| Class comparison      | class_results  | class_id via students            |
| Enrollment history    | enrollments    | student_id, academic_year_id     |
| Attendance (future)   | student_attendance | student_id, date, status    |

## Missing Links / Inconsistencies
- `class_results.term_id` is NULL for 3 rows (harmless, skip in trend queries)
- `class_results.academic_year_id` is NULL for all rows (use `term_id` as proxy for timeline)
- `student_attendance` has 0 rows — attendance-based signals unavailable; engine falls back to performance-only
- `results` table links via `exam_id → exams.term_id` (indirect) vs `class_results` (direct `term_id`)
- No `class_id` on `class_results` directly — must JOIN via `enrollments` or use `students.class_id`
- `students.class_id` is denormalized current class; historical class from `enrollments`
