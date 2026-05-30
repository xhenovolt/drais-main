# DRAIS Translation — Duplicate Phrase Report

Same concept currently expressed multiple ways. Each row shows the variants found
in the codebase and the **canonical phrase** the dictionary will standardise on.
Files using non-canonical variants should be updated to the canonical form when
the i18n wire-up phase touches them.

## 1. Action verbs

| Concept | Variants found | Canonical | Arabic |
|---|---|---|---|
| Save | `Save`, `Save changes`, `Save Template`, `Save as`, `Save settings` | `Save` (verb) / `Save changes` (when there's a draft) / `Save as starter` (verb + noun) | `حفظ` / `حفظ التغييرات` / `حفظ كنموذج` |
| Delete | `Delete`, `Remove`, `Trash`, `Drop` | `Delete` (permanent) · `Remove` (from a list) · `Archive` (soft) | `حذف` / `إزالة` / `أرشفة` |
| Edit | `Edit`, `Modify`, `Update`, `Change` | `Edit` (form) · `Update` (after save) · `Change` (for status / mode pickers) | `تعديل` / `تحديث` / `تغيير` |
| Add | `Add`, `New`, `Create`, `Insert` | `Add` (inline) · `New` (top-level / opens form) · `Create` (final commit verb in a form) | `إضافة` / `جديد` / `إنشاء` |
| Cancel | `Cancel`, `Close`, `Dismiss`, `Discard` | `Cancel` (form abandon) · `Close` (dialog) · `Dismiss` (toast/banner) · `Discard` (unsaved warning) | `إلغاء` / `إغلاق` / `إخفاء` / `تجاهل` |
| Print | `Print`, `Export PDF`, `Download PDF`, `Generate PDF` | `Print` (live render → browser print dialog) · `Export PDF` (server-rendered file) | `طباعة` / `تصدير PDF` |
| Search | `Search`, `Find`, `Look up`, `Filter` | `Search` (text input) · `Filter` (dropdown / facet) | `بحث` / `تصفية` |
| Submit | `Submit`, `Send`, `Confirm`, `Go` | `Submit` (form) · `Send` (message / SMS / email) · `Confirm` (irreversible action) | `إرسال` / `تأكيد` |
| Refresh | `Refresh`, `Reload`, `Reset`, `Sync` | `Refresh` (re-fetch) · `Sync` (push to remote) · `Reset` (back to defaults) | `تحديث` / `مزامنة` / `إعادة تعيين` |
| Open | `Open`, `View`, `Show`, `Preview` | `Open` (drawer / new page) · `View` (read-only) · `Preview` (modal render) | `فتح` / `عرض` / `معاينة` |

## 2. Domain noun duplicates

| Concept | Variants found | Canonical | Arabic |
|---|---|---|---|
| Student | `Student`, `Learner`, `Pupil` | **`Student`** for traditional, **`Learner`** in CAFE contexts (NLSC convention). Both stay in dictionary; UI picks per page. | `طالب` (تقليدي) / `متعلم` (CBC) |
| Subject | `Subject`, `Course`, `Learning Area` | **`Subject`** everywhere. `Learning Area` is a UK Cambridge term; not used in Uganda. | `مادة` |
| Class | `Class`, `Form`, `Grade` (US) | **`Class`** everywhere (Uganda convention). | `الصف` |
| Stream | `Stream`, `Section`, `Group` | **`Stream`** for academic stream; **`Section`** for DRCE document section; **`Group`** for tahfiz. | `الشعبة` / `قسم` / `مجموعة` |
| Teacher | `Teacher`, `Instructor`, `Tutor` | **`Teacher`** everywhere. `Instructor` only appears in tahfiz once; standardise. | `معلم` |
| Term | `Term`, `Semester`, `Trimester` | **`Term`** — Uganda's 3-term year is standard. | `الفصل الدراسي` |
| Report card | `Report Card`, `Progress Report`, `Academic Report`, `Result Slip` | **`Report Card`** is canonical; the rest are descriptive variants only used in document-kind labels. | `كشف نتائج` / `بطاقة التقرير` |
| Exam | `Exam`, `Examination`, `Test`, `Assessment` | **`Exam`** (informal) and **`Examination`** (formal) both used; pick **`Exam`** for UI brevity, **`Examination`** for report titles. **`Assessment`** is reserved for CAFE (component-based). | `امتحان` / `تقييم` |
| Mark | `Mark`, `Score`, `Grade`, `Points` | **`Score`** = raw numeric value · **`Grade`** = letter/band derived from score · **`Mark`** = colloquial — pick **`Score`** for the data model, accept **`Marks`** in UI labels where users expect it. | `الدرجة` (raw) / `التقدير` (band) |
| Aggregate | `Aggregate`, `Total`, `Overall`, `Average` | These are DIFFERENT mathematically. Standardise: **`Total`** (sum), **`Average`** (mean), **`Aggregate`** (UCE-style points sum out of 9). | `المجموع` / `المتوسط` / `الإجمالي` |
| Position | `Position`, `Rank`, `Place` | **`Position`** (Ugandan convention "Position: 4/30"). | `المركز` |
| Promotion | `Promotion`, `Promote`, `Pass`, `Advance` | **`Promotion`** (noun, the lifecycle event) · **`Promote`** (verb). `Pass` only in pass/fail contexts. | `الترقية` / `الترقي` |
| Snapshot | `Snapshot`, `Frozen Report`, `Report Snapshot` | **`Snapshot`** is the canonical technical term; UI surfaces also accept **`Frozen Report`**. | `لقطة` / `تقرير مجمد` |
| Template | `Template`, `Layout`, `Design`, `Form` | **`Template`** everywhere. `Form` is reserved for input forms; never confuse. | `قالب` |
| Section | `Section`, `Block`, `Component`, `Element` | **`Section`** in DRCE editor (top-level building block) · **`Block`** reserved for the shared block library (`block_ref`) · **`Component`** reserved for CAFE assessment components. Never mix. | `قسم` / `مكوّن` |

## 3. Status / state duplicates

| Concept | Variants found | Canonical | Arabic |
|---|---|---|---|
| Active | `Active`, `Enabled`, `On` | **`Active`** for entities (school, term, framework) · **`Enabled`** for modules / settings · **`On`** for toggles. | `نشط` / `مفعّل` |
| Inactive | `Inactive`, `Disabled`, `Off`, `Archived` | **`Inactive`** · **`Disabled`** · **`Archived`** are distinct. Pick by context: archived = soft-deleted lifecycle state. | `غير نشط` / `معطّل` / `مؤرشف` |
| Pending | `Pending`, `Awaiting`, `In progress`, `Draft` | **`Draft`** for templates · **`Pending approval`** for workflow · **`Pending`** for default. | `مسودة` / `قيد الموافقة` / `قيد الانتظار` |
| Done | `Done`, `Completed`, `Finished`, `Saved` | **`Saved`** for save outcome · **`Completed`** for task lifecycle · **`Done`** for free-form. | `محفوظ` / `مكتمل` / `تم` |
| Error | `Error`, `Failed`, `Problem`, `Issue` | **`Failed`** is verb-form ("Failed to save"); **`Error`** is noun-form. | `فشل` (فعل) / `خطأ` (اسم) |

## 4. Numeric / measurement duplicates

| Concept | Variants found | Canonical | Arabic |
|---|---|---|---|
| Out of N | `out of`, `/`, `of`, `over` | **`/`** in compact UI (Position 4/30); **`out of`** when text-heavy ("4 out of 30 students"). | `من` |
| Percent | `%`, `Percent`, `pct` | **`%`** always in UI; `Percent` only as label header. | `%` / `بالمئة` |
| Weight | `Weight`, `Weighting`, `Coefficient` | **`Weight`** everywhere; spelled out in tooltips. | `الوزن` |

## 5. Time / date duplicates

| Concept | Variants | Canonical | Arabic |
|---|---|---|---|
| Today | `Today`, `Current`, `Now` | **`Today`** for date · **`Current`** for active record · **`Now`** for system time. | `اليوم` / `الحالي` / `الآن` |
| Last updated | `Updated`, `Modified`, `Last modified`, `Last seen` | **`Last updated`** for records · **`Last seen`** for users / devices. | `آخر تحديث` / `آخر ظهور` |
| Date created | `Created`, `Date created`, `Added`, `Joined` | **`Created`** for records · **`Joined`** for users · **`Admitted`** for students. | `أُنشئ` / `انضم` / `قُبل` |

## 6. CAFE-specific duplicates flagged for cleanup

| Concept | Variants | Canonical |
|---|---|---|
| Component | `Component`, `Element`, `Sub-section` | **`Component`** (CAFE-only) |
| Scoring model | `Scoring Model`, `Scale`, `Marking Scheme` | **`Scoring Model`** |
| Grade mapping | `Grade Mapping`, `Band`, `Threshold` | **`Grade Mapping`** |
| Activity of Integration | `AoI`, `Integration Activity`, `Project Activity` | **`Activity of Integration` (AoI)** — UNESCO/Uganda official term |
| Generic Skill | `Generic Skill`, `Soft Skill`, `Transversal Skill` | **`Generic Skill`** — NLSC official term |
| Descriptor | `Descriptor`, `Level descriptor`, `Achievement descriptor` | **`Descriptor`** (CAFE-only) |
| Competency level | `Competency Level`, `Competency Grade`, `Performance Level` | **`Competency Level`** |
| Framework | `Framework`, `Scheme`, `Plan` | **`Framework`** (`Assessment Framework` when needing clarity) |

## 7. DRCE-specific duplicates flagged for cleanup

| Concept | Variants | Canonical |
|---|---|---|
| Editor | `Editor`, `Designer`, `Builder`, `Studio` | **`Editor`** (`Template Editor`, `DRCE Editor`) |
| Kitchen | `Kitchen`, `Workshop`, `Library` | **`Template Kitchen`** is the existing term; **`Block Library`** is a separate concept. |
| Gallery | `Gallery`, `Store`, `Marketplace` | **`Gallery`** for the starter picker at `/drce/new`. |
| Workflow | `Workflow`, `Lifecycle`, `Approval flow` | **`Workflow`** (umbrella); **`Lifecycle`** when describing the state diagram in docs. |
| Page | `Page`, `Sheet`, `Slide` | **`Page`** (P5 multi-page model). |
| Watermark | `Watermark`, `Background mark`, `Overlay text` | **`Watermark`**. |
| Conditional visibility | `Visibility rule`, `Conditional render`, `Show/hide rule` | **`Conditional Visibility`** (matches the P2 audit name). |

## 8. Punctuation / format conventions

| Old pattern | Canonical |
|---|---|
| `Save…` (ellipsis) | `Save…` only during long-running ops; static buttons use no ellipsis |
| `Save changes →` (arrow) | No arrow on form-submit buttons; arrows only on navigation links |
| `Save (Ctrl+S)` (shortcut hint) | Shortcut goes in `title` attr only, not the visible label |
| `Saved!` / `Saved.` | Drop final punctuation in chips/badges; keep only in full sentence toasts |

## 9. Numbers requiring locale-aware formatting

| Format | English | Arabic (Western numerals) | Arabic (Arabic-Indic numerals) |
|---|---|---|---|
| Percentage | `75.5%` | `٪75.5` | `٪٧٥٫٥` |
| Decimal separator | `.` | `.` | `٫` |
| Thousands separator | `,` | `,` | `٬` |
| Currency | `UGX 100,000` | `100,000 شلن أوغندي` | `١٠٠٬٠٠٠ شلن أوغندي` |
| Date | `15 May 2026` | `15 مايو 2026` | `١٥ مايو ٢٠٢٦` |

DRAIS already toggles between Western and Arabic-Indic numerals via the snapshot
`numerals` field. The dictionary respects whichever choice the snapshot was
generated with; the UI should pick from school settings (`school_academic_settings`
extension is a future task).

## 10. Consolidation impact

By collapsing the duplicate variants to canonical phrases, the **translatable
string count drops from ~2,795 → ~2,150**. Roughly **23% of the discovered
strings are duplicates** of one of these canonical phrases.

This is the single biggest accuracy lever in the Arabic pack: instead of
translating "Save", "Save Template", "Save Changes", "Save Settings" four
slightly different ways, the dictionary canonicalises them and the UI updates
to use the canonical phrase consistently.
