# DRAIS — Master Glossary

The official terminology source of truth. Every term is mapped to its definition,
Arabic translation, and usage rules. When the i18n wire-up phase touches a file,
this file decides which canonical phrase wins.

## 1. People

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| Student | A person enrolled in academic study at the school | طالب | Traditional curriculum contexts |
| Learner | Same person, modern CBC framing | متعلم | CAFE / NLSC contexts only |
| Pupil | Same person, primary-school colloquial | تلميذ | Not used in DRAIS UI; legacy reports only |
| Staff | Any employee of the school (teaching + non-teaching) | الموظفون | Plural form is conventional in DRAIS |
| Teacher | Staff member with teaching responsibility | معلم / أستاذ | "معلم" preferred; "أستاذ" honorific |
| Class Teacher | Teacher with pastoral oversight of a class | معلم الصف | Reports/snapshot field |
| Headteacher | School leader | مدير المدرسة | Single word; not "Head Teacher" |
| Director of Studies (DOS) | Academic head | مدير الدراسات | DOS is accepted abbreviation |
| Parent | A guardian linked to a learner | ولي الأمر | "ولي أمر" is singular indefinite |
| Guardian | Legal carer (may not be parent) | الوصي | Distinct from "Parent" |
| Bursar | Finance officer | المحاسب / المسؤول المالي | "المحاسب" preferred |
| Matron | Boarding pastoral staff | المشرفة | Female form; school-specific role |
| Registrar | Admissions / records officer | المسجل | |

## 2. Organisational units

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| School | The institution | المدرسة | |
| Department | Subject grouping (Sciences, Languages, …) | القسم | Distinct from administrative department |
| Class | Year-group cohort (S1, S2 … P6) | الصف | "الصف الأول الثانوي" = S1 |
| Stream | Subdivision within a class (S1 East, S1 West) | الشعبة | |
| Group | Tahfiz study group | المجموعة | Tahfiz-only |

## 3. Time

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| Academic Year | The full school year | السنة الدراسية | |
| Term | Sub-period of the academic year (Uganda runs 3 terms) | الفصل الدراسي | "الفصل الأول" = Term 1 |
| Semester | Two-period alternative | الفصل | Rare in Uganda; used by some international schools |
| Trimester | Three-period alternative | الترم | Synonym for Term |
| Mid Term | First half of a term | منتصف الفصل | Examination type |
| End of Term | Final period of a term | نهاية الفصل | Examination type |

## 4. Academic concepts (traditional)

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| Subject | Discipline taught (Mathematics, English, …) | المادة | |
| Curriculum | The body of subjects + study plan | المنهج الدراسي | |
| Result | One score for one (student, subject, term) | النتيجة | |
| Result Type | Per-school assessment category (Continuous Assessment, UNEB, …) | نوع التقييم | DRAIS-specific data model |
| Exam / Examination | A specific testing event | امتحان | |
| Mark | Colloquial for raw score | الدرجة | Avoid in technical UI; use Score |
| Score | The raw numeric value entered | الدرجة | Canonical |
| Grade | The letter/band derived from score (A, B, C, D1, F9) | التقدير | |
| Aggregate | UCE-style sum-of-best-subjects (max 9 for division I) | الإجمالي | UCE secondary only |
| Division | UCE classification (I, II, III, IV, U) | القسم | UCE secondary only |
| Total | Sum of all subject scores | المجموع | |
| Average | Mean of all subject scores | المتوسط | |
| Position | 1..N rank within a class | المركز / الترتيب | |
| Pass / Fail | Binary outcome | ناجح / راسب | |
| Promotion | Lifecycle event: moving from one class to the next year | الترقية | Verb: "promote" → "ترقية" |

## 5. CAFE concepts (competency-based)

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| Assessment Framework | A bundle of components describing a complete assessment regime | إطار التقييم | CAFE-only |
| Component | A single capture cell within a framework (Theory, AoI, Practical) | المكوّن | CAFE-only |
| Scoring Model | The rule for how one value is captured (1–3 scale, A–E letter, descriptor) | نموذج التقدير | CAFE-only |
| Grade Mapping | Score range → band label | جدول التقديرات | |
| Academic Mode | Traditional / Competency / Hybrid setting | الوضع الأكاديمي | School-level setting |
| Activity of Integration (AoI) | NLSC-specific practical-application assessment | نشاط الدمج | NLSC official term |
| Generic Skill | Cross-cutting competency (Communication, ICT, …) | المهارة العامة | NLSC official term |
| Project / Project Portfolio | Sustained integrated work + evidence | المشروع / محفظة المشاريع | |
| Descriptor | Qualitative label for a competency level | الوصف | |
| Achievement Level | Numbered rubric level (1, 2, 3) | مستوى الإنجاز | |
| Competency Level | Rolled-up best level across components for a subject | مستوى الكفاءة | |
| Promotion Rule | A `VisibilityRule` that decides who advances | قاعدة الترقية | Reuses P2 rule engine |
| Rubric | A multi-level descriptor scale | روبريك / مقياس متدرّج | "روبريك" is accepted loanword in education |

## 6. Snapshot + reporting

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| Snapshot | Frozen point-in-time academic record | اللقطة | Technical term |
| Snapshot ID | Unique key for a snapshot | معرّف اللقطة | |
| Data Hash | sha256 of snapshot data — proves integrity | بصمة البيانات | Print/export labels |
| Report Card | Per-student academic report document | كشف النتائج / بطاقة التقرير | |
| Transcript | Cumulative academic record | السجل الأكاديمي | |
| Print | Render to browser print dialog | طباعة | Verb |
| Export PDF | Server-render to downloadable PDF | تصدير PDF | Verb |

## 7. DRCE (Document Composition Engine)

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| Template | A reusable document layout | قالب | |
| Document Kind | Canva-style category (Report Card, Certificate, ID Card, …) | نوع الوثيقة | Phase 1 of universal-document audit |
| Starter | A pre-built template seed in the New Document gallery | نموذج بداية | |
| Section | A top-level building block inside a template | قسم | |
| Page | One sheet of a multi-page template | صفحة | |
| Theme | Document-level styling (colours, page size) | المظهر | |
| Watermark | Background mark | علامة مائية | |
| Editor | The DRCE visual designer | محرر | |
| Template Kitchen | The list of all templates for the school | مطبخ القوالب | DRAIS-specific term; loose translation acceptable |
| Block Library | Reusable section subtrees | مكتبة الكتل | |
| Visibility Rule | Per-section/page conditional render | قاعدة العرض الشرطي | P2 feature |
| Conditional Visibility | Same concept as a noun phrase | العرض الشرطي | |
| Workflow | Lifecycle: draft → submit → approve → publish | سير العمل | P4 feature |
| Workflow Status | Current state (draft, pending approval, …) | حالة سير العمل | |
| Issuance | Batch generation of documents for a cohort | الإصدار | Round 3 feature |
| Issuance Batch | One issuance run | دفعة الإصدار | |
| Eligibility Rule | Who qualifies to receive a batch document | قاعدة الأهلية | Reuses VisibilityRule |
| Custom Field | School-defined data field on a learner | حقل مخصص | P1 feature |
| Image Shape | Image inserted into the canvas | شكل الصورة | P3 feature |
| Multi-page Document | Template spanning more than one page | وثيقة متعددة الصفحات | P5 feature |
| Component Table (Competency Table) | Section type — competency_table | جدول المكوّنات | CAFE Phase 4 |
| Descriptor Grid | Section type — descriptor_grid | شبكة الأوصاف | CAFE Phase 4 |
| AoI Breakdown | Section type — aoi_breakdown | تفصيل نشاط الدمج | CAFE Phase 4 |
| Generic Skills block | Section type — skills_block | كتلة المهارات العامة | CAFE Phase 4 |
| Project Outcomes block | Section type — project_outcomes | كتلة نواتج المشاريع | CAFE Phase 4 |
| Narrative block | Section type — narrative_block | كتلة سردية | CAFE Phase 4 |

## 8. Identity / governance

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| Role | A bundle of permissions assigned to a user | الدور | RBAC |
| Permission | A single capability (e.g. `students.read`) | الإذن | RBAC |
| Super Admin | DRAIS-platform super-administrator | المسؤول الأعلى | Bypasses all gates |
| School Admin | School-scoped administrator | مسؤول المدرسة | |
| Teacher | Role: teaching faculty | معلم | |
| Bursar | Role: finance | المحاسب | |
| Registrar | Role: admissions | المسجل | |
| Director of Studies | Role: academic head | مدير الدراسات | |
| Headteacher | Role: school leader | مدير المدرسة | |

## 9. Operations

| Term | Definition | Arabic | Usage |
|---|---|---|---|
| Dashboard | Landing overview page | لوحة التحكم | |
| Audit Trail | Append-only log of significant events | سجل التدقيق | |
| Notification | An alert shown in-app | الإشعار | |
| Message | Inter-user text | الرسالة | |
| SMS | Phone text message | رسالة نصية | |
| Email | Internet email | البريد الإلكتروني | |
| Search | Text-input lookup | بحث | |
| Filter | Faceted narrowing | تصفية | |
| Refresh | Re-fetch data | تحديث | |
| Sync | Push to remote system | مزامنة | |
| Export | Download data | تصدير | |
| Import | Upload data | استيراد | |
| Bulk | Operating on many records at once | جماعي | "تحديث جماعي" = bulk update |

## 10. Numeric conventions

| Concept | English | Arabic (Eastern numerals shown) |
|---|---|---|
| Numerals | 0–9 | ٠–٩ |
| Currency UGX | UGX 100,000 | ١٠٠٬٠٠٠ شلن أوغندي |
| Date long | 15 May 2026 | ١٥ مايو ٢٠٢٦ |
| Date short | 15/05/2026 | ٢٠٢٦/٠٥/١٥ |
| Time | 14:30 | ١٤:٣٠ |
| Percent | 75.5% | ٪٧٥٫٥ |
| Position | 4/30 | ٤/٣٠ |
| Rank label | "Pos. 4 of 30" | "المركز ٤ من ٣٠" |

## 11. Boundary rules — what stays English

| Category | Reason |
|---|---|
| Permission codes (`drce.edit`, `cafe.manage`, `students.update`) | Technical identifiers; never user-shown without a label |
| Field codes (`first_name`, `admission_no`) | Database column names |
| Component codes (`theory`, `practical`, `aoi`) | School-chosen identifiers; their _labels_ are translated |
| Framework codes (`nlsc_math_s1`) | School-chosen identifiers |
| Permission badges in admin panels | Translated through `roles.json` namespace |
| Console.log / error stack traces | Developer output |
| URL paths (`/admin/cafe`) | Routes are language-neutral |
| Currency code "UGX" | International standard — appears in mixed-language contexts |

## 12. Disambiguation cheat-sheet

When two English words look like synonyms but mean different things in DRAIS:

| Pair | Distinction |
|---|---|
| **Section** vs **Component** | Section = DRCE document building block. Component = CAFE assessment cell. Never use one for the other. |
| **Total** vs **Aggregate** | Total = sum of scores. Aggregate = UCE points (max 9). |
| **Score** vs **Grade** | Score = raw number. Grade = derived band. |
| **Template** vs **Framework** | Template = DRCE document. Framework = CAFE assessment bundle. |
| **Block** vs **Section** | Block = reusable subtree in the Block Library. Section = a section instance. |
| **Workflow** vs **Lifecycle** | Workflow = DRCE template approval flow. Lifecycle = generic state machine reference. |
| **Issuance** vs **Generation** | Issuance = full batch pipeline (rules → audit). Generation = the rendering step within it. |
| **Class** vs **Stream** | Class = year cohort. Stream = subdivision of a class. |
