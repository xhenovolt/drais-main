# DRAIS — Academic Terminology Glossary

Scoped to the academic substrate: examinations, results, reporting marks,
promotion, CBC/CAFE concepts. Every phrase here either appears in a printed
report card or in an academic-staff-facing screen. Where the master
[GLOSSARY.md](./GLOSSARY.md) covers a term once, this file deepens it for
the academic context (alternate wordings, contexts in which each variant
appears, plural/singular nuances, gender forms).

This is the file the snapshot and report-card translators consult first.

---

## 1. Examination cycle (Traditional curriculum)

| English | Arabic | Notes |
|---|---|---|
| Examination | الامتحان | Formal noun; preferred in report headers |
| Exam | امتحان | Short form; in-app buttons / chips |
| Test | اختبار | Short formative assessment; not a full exam |
| Quiz | اختبار قصير | "Aختبار قصير" if space allows, else "اختبار" |
| Assignment | الواجب | Singular |
| Continuous Assessment (CA) | التقييم المستمر | Common UNEB phrase |
| Beginning of Term (BOT) | بداية الفصل | Exam type label |
| Mid Term (MT) | منتصف الفصل | Exam type label |
| End of Term (EOT) | نهاية الفصل | Exam type label |
| Mock Exam | الامتحان التجريبي | Pre-UNEB rehearsal |
| Final Exam | الامتحان النهائي | |
| UNEB | UNEB | Acronym left in Latin script (international body) |
| PLE / UCE / UACE | PLE / UCE / UACE | Acronyms preserved; subtitle in Arabic when first seen |

### Score capture vocabulary

| English | Arabic | Notes |
|---|---|---|
| Score | الدرجة | Canonical word for the raw number |
| Mark | الدرجة | Synonym; avoid in UI, allow in legacy reports |
| Marks | الدرجات | Plural |
| Out of | من | "85 من 100" = "85 out of 100" |
| Maximum mark | الدرجة العظمى | Column header |
| Pass mark | درجة النجاح | Cut-off |
| Raw score | الدرجة الخام | Pre-weighting value |
| Weighted score | الدرجة الموزونة | Post-weighting value |
| Weighting | الوزن | Percentage applied to a component |
| Subject score | درجة المادة | Per-subject roll-up |
| Total | المجموع | Per-student row total |
| Average | المتوسط | Arithmetic mean |
| Percentage | النسبة المئوية | |
| Aggregate | الإجمالي | UCE-only — sum of best 8 |
| Division | القسم / الشعبة | UCE class I–IV; "القسم" preferred academically |
| Position | المركز | "المركز ٤ من ٣٠" |
| Rank | الترتيب | Synonym; "Position" preferred on cards |
| Class average | متوسط الصف | |
| Stream average | متوسط الشعبة | |
| Class size | عدد الطلاب في الصف | |

### Grade output vocabulary

| English | Arabic | Notes |
|---|---|---|
| Grade | التقدير | Letter / band derived from score |
| Letter Grade | الحرف | "A", "B" displayed; column header in Arabic |
| Band | الفئة | Used when bands have names ("Excellent", "Good") |
| Distinction (D1, D2) | امتياز | UCE band |
| Credit (C3–C6) | جيد جداً | UCE band |
| Pass (P7, P8) | مقبول | UCE band |
| Fail (F9) | راسب | UCE band |
| Promoted | مُرقَّى | "Lifecycle: promoted to next class" |
| Repeating | مُعيد | Retained in same class |
| Withdrawn | منسحب | Left mid-term |
| Pass | ناجح | Generic |
| Fail | راسب | Generic |
| Remarks | الملاحظات | Free-text feedback column |
| Comment | تعليق | Singular comment cell |
| Conduct | السلوك | Discipline column |
| Effort | الاجتهاد | Effort column |
| Attendance | الحضور | Days present |
| Days absent | أيام الغياب | |

---

## 2. CAFE / CBC concepts (NLSC + competency-based schemes)

This vocabulary is **always** prefixed by the framework. Never translate
these terms differently across screens — they appear on report cards,
admin pages, and the formula language together.

### Framework structure

| English | Arabic | Notes |
|---|---|---|
| Assessment Framework | إطار التقييم | The container |
| Framework | الإطار | Short form |
| Component | المكوّن | Smallest capture cell |
| Component code | رمز المكوّن | Latin string (theory, practical…) — never translated |
| Component name | اسم المكوّن | School-facing label — translated |
| Theory | النظري | NLSC component |
| Practical | العملي | NLSC component |
| Activity of Integration | نشاط الدمج | "AoI" abbreviation acceptable |
| AoI | نشاط الدمج | Long-form preferred in printed cards |
| Project | المشروع | |
| Portfolio | الحافظة / المحفظة | "محفظة" preferred when paired with "project" |
| Generic Skill | المهارة العامة | NLSC official translation |
| Generic Skills | المهارات العامة | Plural — column header |
| Cross-cutting issue | قضية شاملة | NLSC term |
| Values | القيم | NLSC term |
| Scoring Model | نموذج التقدير | The rule for capture (1–3, A–E…) |
| Achievement Level | مستوى الإنجاز | The numbered rubric value (1, 2, 3) |
| Competency Level | مستوى الكفاءة | Rolled-up best across components |
| Descriptor | الوصف | Qualitative text for a level |
| Descriptors | الأوصاف | Plural |
| Rubric | روبريك / مقياس متدرّج | Loanword "روبريك" is accepted |
| Grade Mapping | جدول التقديرات | Range → band |

### Competency outcomes

| English | Arabic | Notes |
|---|---|---|
| Outstanding | متميّز | Top band; some schemes use "متفوّق" |
| Excellent | ممتاز | |
| Very Good | جيد جدًا | |
| Good | جيد | |
| Satisfactory | مقبول | |
| Needs Improvement | بحاجة إلى تحسين | |
| Beginning | مبتدئ | Lowest competency band in some rubrics |
| Developing | نامٍ | Mid band |
| Proficient | متمكِّن | Standard expected |
| Advanced | متقدِّم | Above-standard |
| Below Expectations | دون التوقعات | |
| Meets Expectations | يلبّي التوقعات | |
| Exceeds Expectations | يتجاوز التوقعات | |

### Lifecycle on a CAFE record

| English | Arabic | Notes |
|---|---|---|
| Promotion Rule | قاعدة الترقية | Reuses P2 VisibilityRule |
| Eligibility | الأهلية | |
| Promotion outcome | نتيجة الترقية | |
| Promoted | تمت الترقية | Past-tense state |
| Retained | الإعادة | Stay in same class |
| Conditional Promotion | ترقية مشروطة | Promoted with conditions |
| Held back pending review | مؤجّل بانتظار المراجعة | |

---

## 3. Subject naming (Ugandan curriculum)

Subject names are translated to their **standard educational Arabic
equivalents**, not transliterated. These match what Arabic-medium
schools in Uganda actually print on their report cards.

| English | Arabic |
|---|---|
| Mathematics | الرياضيات |
| English | اللغة الإنجليزية |
| Kiswahili | اللغة السواحلية |
| Arabic | اللغة العربية |
| Islamic Religious Education (IRE) | التربية الإسلامية |
| Christian Religious Education (CRE) | التربية المسيحية |
| Social Studies | الدراسات الاجتماعية |
| Science | العلوم |
| Integrated Science | العلوم المتكاملة |
| Biology | الأحياء |
| Chemistry | الكيمياء |
| Physics | الفيزياء |
| History | التاريخ |
| Geography | الجغرافيا |
| Literature in English | الأدب الإنجليزي |
| Agriculture | الزراعة |
| Computer Studies / ICT | الحاسوب / تكنولوجيا المعلومات |
| Entrepreneurship | ريادة الأعمال |
| Physical Education (PE) | التربية البدنية |
| Art | الفن |
| Music | الموسيقى |
| Fine Art | الفنون الجميلة |
| Technical Drawing | الرسم الفني |
| Home Economics | الاقتصاد المنزلي |
| Nutrition | التغذية |
| Quran / Tahfiz | القرآن الكريم / التحفيظ |
| Hadith | الحديث |
| Fiqh | الفقه |
| Tafsir | التفسير |
| Aqeedah | العقيدة |
| Seerah | السيرة |
| Tajweed | التجويد |

---

## 4. Class / level naming (Uganda)

| English | Arabic |
|---|---|
| Nursery (Baby / Middle / Top) | الحضانة (الصغرى / الوسطى / العليا) |
| Primary 1–7 (P1–P7) | الابتدائي الأول … الابتدائي السابع |
| Senior 1–6 (S1–S6) | الثانوي الأول … الثانوي السادس |
| Lower Secondary (S1–S4) | الثانوية الدنيا |
| Upper Secondary (S5–S6) | الثانوية العليا |
| Stream A / B / C | الشعبة (أ) / (ب) / (ج) |
| East / West / Blue / Green stream | شعبة الشرق / الغرب / الزرقاء / الخضراء |
| O-level | المرحلة العادية | UCE |
| A-level | المرحلة المتقدمة | UACE |

The short codes (P1, S2, etc.) are **kept in Latin script** in tables to
preserve column width; the long Arabic name appears in headers and in the
narrative parts of the report card.

---

## 5. Term and date phrases on report cards

| English | Arabic |
|---|---|
| First Term | الفصل الأول |
| Second Term | الفصل الثاني |
| Third Term | الفصل الثالث |
| Term 1 / 2 / 3 | الفصل ١ / ٢ / ٣ |
| Academic Year 2026 | السنة الدراسية ٢٠٢٦ |
| Term begins | بداية الفصل |
| Term ends | نهاية الفصل |
| Next term begins | يبدأ الفصل القادم |
| Date of issue | تاريخ الإصدار |
| Date of report | تاريخ التقرير |
| Generated on | تم الإنشاء في |
| Printed on | طُبع في |

---

## 6. Phrases reserved for the report card narrative

Boilerplate sentences that appear at the bottom of a report card. These
are NOT auto-generated by the snapshot — they come from the template /
school settings — but they must read naturally in Arabic. Listed here
because the Arabic phrasing is a one-time editorial decision.

| English | Arabic |
|---|---|
| Class Teacher's comment | تعليق معلم الصف |
| Headteacher's comment | تعليق مدير المدرسة |
| Director of Studies' comment | تعليق مدير الدراسات |
| Promoted to the next class | تمت الترقية إلى الصف التالي |
| Repeating the class | إعادة الصف |
| Recommended for promotion | يُوصى بالترقية |
| Has shown great improvement | أظهر تحسنًا كبيرًا |
| Needs more effort in … | بحاجة إلى مزيد من الجهد في … |
| Keep up the good work | استمر في العمل الجيد |
| Excellent performance overall | أداء ممتاز بشكل عام |
| Satisfactory effort | جهد مقبول |
| Pay more attention in class | الانتباه أكثر في الصف |
| Final result | النتيجة النهائية |
| Promoted | تمت الترقية |
| Repeated | أُعيد الصف |
| Issued by | صادر عن |
| Authorised signature | التوقيع المعتمد |
| School stamp | ختم المدرسة |

---

## 7. Pluralisation + gender notes

Arabic pluralisation in academic UI:

- **Students** plural = الطلاب (masc. plural standard; covers mixed groups).
  Single female learner = طالبة; multiple females = الطالبات.
- **Teachers** plural = المعلمون / المعلمين (depending on grammatical
  case). DRAIS uses the nominative form المعلمون in lists.
- **Subjects** plural = المواد (الدراسية).
- **Marks** is always plural = الدرجات.

Where the UI shows a single learner's record, prefer the singular form
matching the learner's recorded gender. The snapshot already carries
`students[].gender`; the renderer must select the form. Until the
renderer is gender-aware, the **masculine singular** form (طالب) is the
default fallback because Arabic accepts it for mixed/unknown referents.

---

## 8. Formula / calculation vocabulary

Used in CAFE Phase 6 formulas and in result computation copy. Includes
function names that are kept in Latin (they are language constructs),
plus the human labels around them.

| English | Arabic | Notes |
|---|---|---|
| Formula | الصيغة | |
| Expression | التعبير | |
| Function | الدالة | |
| Operator | المُعامِل | |
| Variable | المتغيّر | |
| Constant | الثابت | |
| Result | الناتج | Calculation output (distinct from "النتيجة" = academic result) |
| Round | تقريب | Verb |
| Round to nearest | التقريب لأقرب | |
| Sum | المجموع | |
| Average / Mean | المتوسط | |
| Maximum | الحد الأقصى | |
| Minimum | الحد الأدنى | |
| Best of | أفضل | "best of 3 components" → "أفضل ٣ مكوّنات" |
| If … then … else | إذا … فإن … وإلا | |
| COMPONENT(code) | COMPONENT(code) | Function name kept in Latin |
| COMPETENCY(subject) | COMPETENCY(subject) | |
| DESCRIPTOR(level) | DESCRIPTOR(level) | |

---

## 9. Strings explicitly **not** to translate in the academic surface

| Kind | Example | Reason |
|---|---|---|
| Subject codes | `mth`, `eng`, `ire` | Database identifiers |
| Component codes | `theory`, `practical`, `aoi` | Framework identifier |
| Framework codes | `nlsc_math_s1` | School-chosen identifier |
| UNEB grade letters | `D1`, `C5`, `F9` | International standard letters |
| Class short codes | `S1`, `S2`, `P6` | Compact label, kept Latin in tables |
| Division roman numerals | `I`, `II`, `III`, `IV`, `U` | UNEB standard |
| Acronyms (PLE, UCE, UACE, NLSC, AoI) | as-is, Arabic appears as gloss | International recognition |
| Numeric scores in their cells | `78`, `85.5` | Render as Eastern numerals only when the surrounding text is Arabic-only |

---

## 10. Crosswalk: in-code identifier → Arabic label

The columns most often seen by template authors. This is the bridge
between the snapshot JSON keys (English) and the Arabic phrase a school
expects on the printed card.

| Snapshot key | Arabic label on card |
|---|---|
| `learnerName` | اسم الطالب |
| `admissionNo` | رقم القيد |
| `className` | الصف |
| `streamName` | الشعبة |
| `term` | الفصل الدراسي |
| `academicYear` | السنة الدراسية |
| `subject` | المادة |
| `score` | الدرجة |
| `grade` | التقدير |
| `total` | المجموع |
| `average` | المتوسط |
| `position` | المركز |
| `aggregate` | الإجمالي |
| `division` | القسم |
| `classTeacher` | معلم الصف |
| `headteacher` | مدير المدرسة |
| `remarks` | الملاحظات |
| `daysPresent` | أيام الحضور |
| `daysAbsent` | أيام الغياب |
| `conduct` | السلوك |
| `effort` | الاجتهاد |
| `dataHash` | بصمة البيانات |
| `snapshotId` | معرّف اللقطة |
