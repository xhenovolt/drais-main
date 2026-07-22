# DRAIS Bilingual Report Engine - Architecture Diagram

## Component Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    page.tsx (/academics/reports)                   │
│                                                                      │
│  State: selectedLanguage = 'en' | 'ar'                             │
│  Button: Language Selector Dropdown                                 │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          │ Language Selection
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              DRCEDocumentRenderer.tsx (Main Orchestrator)           │
│                                                                      │
│  Input: drceRenderCtx = {                                           │
│    language: 'en' | 'ar'                                            │
│    isRTL: boolean                                                   │
│  }                                                                   │
│                                                                      │
│  Function: renderSection(section, dataCtx, renderCtx)               │
│  Logic: Inject language into dataCtx before rendering               │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          │ Injects: ctx.language
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │HeaderSection │ │StudentInfo   │ │ResultsTable  │
  │              │ │Section       │ │Section       │
  │• School Name │ │              │ │              │
  │• Arabic Name │ │• Student ID  │ │• Subject     │
  │• Logo        │ │• Photo       │ │  Headers     │
  │• Address     │ │• Fields      │ │• Scores      │
  │              │ │• RTL Layout  │ │• Grade       │
  │RTL: ✓        │ │              │ │              │
  │Translated: ✓ │ │RTL: ✓        │ │RTL: ✓        │
  └──────────────┘ │Translated: ✓ │ │Translated: ✓ │
                   └──────────────┘ └──────────────┘
        │                 │                 │
        ├─────────────────┼─────────────────┤
        │                 │                 │
        ▼                 ▼                 ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │CommentsSection│ │GradeTableSec │ │FooterSection │
  │              │ │              │ │              │
  │• Teacher     │ │• Grade Scale │ │• Date/Time   │
  │  Comment     │ │• A, B, C...  │ │• Signature   │
  │• Headmaster  │ │• Arabic      │ │• School Name │
  │  Comment     │ │  Grade Names │ │• Logo        │
  │• Ribbons     │ │              │ │              │
  │  (Arrows)    │ │RTL: ✓        │ │RTL: ✓        │
  │              │ │Translated: ✓ │ │Translated: ✓ │
  │RTL: ✓        │ └──────────────┘ └──────────────┘
  │Translated: ✓ │
  │Arrows Flip: ✓│
  └──────────────┘
```

## Translation System

```
┌────────────────────────────────────────────────────────────────────┐
│            reportTranslations.ts (Master Dictionary)               │
│                                                                     │
│  Structure:                                                         │
│  {                                                                  │
│    en: {                                                            │
│      schoolLogo: "School Logo",                                    │
│      classTeacherComment: "Class Teacher Comment",                 │
│      quran: "Quran",                                               │
│      mathematics: "Mathematics",                                   │
│      ...                                                            │
│    },                                                               │
│    ar: {                                                            │
│      schoolLogo: "شعار المدرسة",                                    │
│      classTeacherComment: "تعليق معلم الفصل",                      │
│      quran: "القرآن الكريم",                                        │
│      mathematics: "الرياضيات",                                      │
│      ...                                                            │
│    }                                                                │
│  }                                                                  │
│                                                                     │
│  Usage in Components:                                               │
│                                                                     │
│  import { t } from '@/lib/drce/reportTranslations'                │
│                                                                     │
│  const language = ctx.language ?? 'en'                             │
│  const label = t('classTeacherComment', language)                  │
│                                                                     │
│  Result:                                                            │
│  - English: "Class Teacher Comment"                                │
│  - Arabic:  "تعليق معلم الفصل"                                     │
└────────────────────────────────────────────────────────────────────┘
```

## Theology Classification System

```
┌────────────────────────────────────────────────────────────────────┐
│           theology-subject-classifier.ts                           │
│                                                                     │
│  Input: Subject Name (e.g., "Quran", "Islamic Studies")           │
│         ↓                                                            │
│  Pattern Matching Against Keywords:                                │
│    • quran, fiqh, tawhid, hadith, akhlaq                          │
│    • islamic, tajweed, sirah, deen, shariah                        │
│         ↓                                                            │
│  Classification:                                                    │
│    ✓ "Quran" → 'theology'                                          │
│    ✓ "Islamic Fiqh" → 'theology'                                   │
│    ✓ "Islamic Studies" → 'theology'                                │
│    ✗ "Mathematics" → 'secular'                                     │
│    ✗ "English" → 'secular'                                         │
│         ↓                                                            │
│  Database Update:                                                   │
│    UPDATE subjects                                                  │
│    SET subject_type = 'theology'                                   │
│    WHERE school_id = X AND name LIKE '%quran%'                     │
│         ↓                                                            │
│  Result:                                                            │
│    • Theology subjects tagged correctly                             │
│    • Appear in "Theology Only" filter                              │
│    • Render with Arabic names: "القرآن الكريم"                     │
└────────────────────────────────────────────────────────────────────┘
```

## Language Context Propagation

```
User selects "Arabic" from dropdown
    ↓
page.tsx: setSelectedLanguage('ar')
    ↓
drceRenderCtx: { language: 'ar', isRTL: true }
    ↓
DRCEDocumentRenderer receives renderCtx
    ↓
For each section:
  Enhanced dataCtx with: { ...dataCtx, language: 'ar' }
    ↓
Section components receive enhanced context
    ↓
Each section:
  1. Extract language: const language = ctx.language ?? 'en'
  2. Check RTL: const isRTL = language === 'ar'
  3. Apply RTL styling: <div style={{ direction: isRTL ? 'rtl' : 'ltr' }}>
  4. Translate labels: const label = t('keyName', language)
  5. Render with Arabic typography: fontFamily: 'Noto Naskh Arabic'
    ↓
Final Output: 100% Arabic Report with RTL Layout
```

## RTL Transformation Pipeline

```
English LTR Layout              →    Arabic RTL Layout
─────────────────────────────         ──────────────────────

Header (Left-aligned)                 Header (Right-aligned)
┌─────────────────────────┐           ┌─────────────────────────┐
│ 🏫 School Name          │           │          اسم المدرسة 🏫 │
│ 123 Main Street         │           │             123 شارع رئيسي│
└─────────────────────────┘           └─────────────────────────┘

Table (LTR Column Order)              Table (RTL Column Order)
┌──────┬──────┬──────┐                ┌──────┬──────┬──────┐
│ Name │ Math │ Eng  │                │ العربية │الرياضيات│ الاسم │
├──────┼──────┼──────┤                ├──────┼──────┼──────┤
│ Ali  │ A    │ B    │                │ ب    │ أ    │ علي  │
└──────┴──────┴──────┘                └──────┴──────┴──────┘

Comment Ribbon (→ arrow)              Comment Ribbon (← arrow)
┌─────────────────────→               ←─────────────────────┐
│ Teacher's Comment                    │ تعليق المعلم        │
└─────────────────────→               ←─────────────────────┘

CSS Applied:                          CSS Applied:
direction: ltr                        direction: rtl
text-align: left                      text-align: right
Column order: [A, B, C]               Column order: [C, B, A]
```

## Database Schema Updates

```
Before (Incomplete):
┌──────────────┐
│   subjects   │
├──────────────┤
│ id           │
│ name         │
│ name_ar      │
│ school_id    │
│ subject_type │ ← Was NULL for theology subjects
└──────────────┘

After (Complete):
┌──────────────┐
│   subjects   │
├──────────────┤
│ id           │
│ name: "Quran"│
│ name_ar: "القرآن الكريم"
│ school_id    │
│ subject_type: 'theology' ← Fixed by SQL script
└──────────────┘

SQL Migration:
UPDATE subjects 
SET subject_type = 'theology' 
WHERE school_id = X 
  AND name LIKE '%quran%'
```

## File Organization

```
src/
├── lib/
│   └── drce/
│       ├── reportTranslations.ts (NEW) ← Master translations
│       ├── theology-subject-classifier.ts (NEW) ← Auto-classifier
│       └── schema.ts (MODIFIED) ← Added language field
│
├── components/
│   └── drce/
│       ├── types.ts (MODIFIED) ← Added language, isRTL fields
│       ├── DRCEDocumentRenderer.tsx (MODIFIED) ← Context injection
│       └── sections/
│           ├── HeaderSection.tsx (MODIFIED) ← RTL + translations
│           ├── StudentInfoSection.tsx (MODIFIED) ← RTL + translations
│           ├── ResultsTableSection.tsx (MODIFIED) ← RTL + translations
│           ├── CommentsSection.tsx (MODIFIED) ← RTL + arrow flip
│           └── GradeTableSection.tsx (MODIFIED) ← RTL + translations
│
└── app/
    └── academics/
        └── reports/
            └── page.tsx (MODIFIED) ← Language binding

database/
└── fix_theology_subject_types.sql (NEW) ← Migration script

scripts/
└── validate-arabic-reports.mjs (NEW) ← Validation suite
```

## Data Flow Example: Arabic Report Generation

```
User Action: Select term, choose "Arabic", click "Generate"
    ↓
page.tsx
  • selectedLanguage = 'ar'
  • Fetch report data
  • Create drceRenderCtx = { language: 'ar', isRTL: true }
    ↓
DRCEDocumentRenderer
  • Receives renderCtx with language: 'ar'
  • For each section: injects language into context
    ↓
HeaderSection receives { language: 'ar', isRTL: true }
  • Reads: school.arabic_name (from database)
  • Reads: t('schoolLogo', 'ar') → "شعار المدرسة"
  • Applies: style={{ direction: 'rtl' }}
  • Renders: Arabic header with RTL
    ↓
StudentInfoSection receives { language: 'ar', isRTL: true }
  • Translates field labels: name → الاسم
  • Applies: textAlign: 'right'
  • Renders: RTL student info box
    ↓
ResultsTableSection receives { language: 'ar', isRTL: true }
  • Translates headers: Math → الرياضيات, English → الإنجليزية
  • Reverses columns: [Subject, Score, Grade] → [Grade, Score, Subject]
  • Applies: direction: 'rtl'
  • Translates subject names using theology classifier
    ↓
Final Output
  100% Arabic Report
  Full RTL Layout
  All Islamic subjects with proper Arabic names
  Ready for printing/PDF export
```

---

This architecture ensures:
✅ Language selection flows through entire component tree
✅ Each section independently handles RTL/LTR switching
✅ Translation system is centralized and extensible
✅ Theology subjects are auto-classified and properly displayed
✅ No hardcoded English strings in Arabic output
✅ Fully backward compatible with English reports
