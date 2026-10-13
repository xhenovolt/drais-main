# DRAIS Localization — Translation Key Conventions

_Applies to all new and changed interface text from Phase 1 onward. It describes how to extend the existing
system (`useI18n()` and `src/locales/*.json`); it does not introduce a new one._

## The one rule

**Every piece of interface text a user can see goes through `t()` from `useI18n()`, and has an entry in both
`src/locales/en.json` and `src/locales/ar.json`.**

```tsx
'use client';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function AdmitPage() {
  const { t } = useI18n();
  return <h1>{t('students.admit.title')}</h1>;
}
```

Do not import `t` from `@/lib/i18n`, and do not use `next-i18next` or `react-i18next`. Those do not work in
DRAIS (architecture audit, finding F2) and are being removed.

## Key structure

```
<module>.<page>.<group>.<name>
```

| Part | Meaning | Examples |
|---|---|---|
| module | The sidebar section or shared area | `students`, `finance`, `attendance`, `common` |
| page | The route's last meaningful segment | `list`, `admit`, `enroll`, `contacts` |
| group | What kind of text it is | `title`, `subtitle`, `actions`, `fields`, `columns`, `filters`, `empty`, `toast`, `confirm`, `validation`, `tooltip`, `aria` |
| name | The specific item, camelCase | `fullName`, `importCsv`, `deleteLearner` |

Examples:

```
students.admit.title
students.admit.fields.dateOfBirth
students.admit.validation.phoneRequired
students.list.columns.admissionNo
students.list.actions.softDelete
students.list.toast.deleted
students.list.confirm.deleteBody
students.list.empty.noMatches
```

### Rules

1. **camelCase for every new key segment.** The existing dictionaries mix camelCase and snake_case; new keys
   are camelCase. Existing snake_case keys keep working and are renamed only when their page is being
   translated anyway.
2. **No dots or spaces inside a single segment.** A key like `"general.title"` written as one JSON property
   cannot be found, because the lookup splits on dots.
3. **Name the meaning, not the English wording.** `students.list.actions.softDelete`, not
   `students.list.softDeleteThisLearnerButton`. Never use the English sentence as the key.
4. **One key, one meaning.** Do not reuse `common.save` for something that means "submit for approval".
   Arabic often needs different words where English uses the same one.
5. **Shared text lives in `common`** only when it is truly the same everywhere: `common.actions.save`,
   `common.actions.cancel`, `common.loading`, `common.pagination.pageOf`. If in doubt, make it page-specific;
   merging two keys later is easy, splitting one is not.
6. **No English fallback argument in new code.** Write `t('students.admit.title')`, not
   `t('students.admit.title', 'Admit Student')`. The fallback is what lets a missing Arabic entry pass
   unnoticed (finding F4). The completeness check added in Phase 1 makes the fallback unnecessary.

## Sentences with values

Use named placeholders and translate the **whole sentence**, never fragments joined in code.

```json
// en.json
"showingCount": "Showing {{shown}} of {{total}} learners"
// ar.json
"showingCount": "عرض {{shown}} من أصل {{total}} متعلم"
```

```tsx
t('students.list.showingCount', { shown: 25, total: 120 })
```

Wrong — word order is fixed in code and will read incorrectly in Arabic:

```tsx
{t('common.showing')} {shown} {t('common.of')} {total} {t('people.learners')}
```

Both languages must use exactly the same placeholder names. The Phase 1 check fails the build when they differ.

## Counts and plurals

Arabic has six plural forms; English has two. Do not write `"{{n}} device pull(s)"`. Phase 1 adds plural
support to the existing `t()`; until a key uses it, phrase the sentence so the number stands apart from the
noun ("Learners selected: {{count}}"), which is grammatical in both languages for any count.

When plural support is in place the entry is an object keyed by plural category, and the same call selects
the right form:

```json
"selected": { "one": "{{count}} learner selected", "other": "{{count}} learners selected" }
"selected": { "zero": "لم يُحدَّد أي متعلم", "one": "متعلم واحد محدد", "two": "متعلمان محددان",
              "few": "{{count}} متعلمين محددين", "many": "{{count}} متعلمًا محددًا", "other": "{{count}} متعلم محدد" }
```

## Dates, numbers and money

Never call `toLocaleDateString('en-GB')` or build a date string by hand in a component. Use the shared
formatting helpers added in Phase 1 (`formatDate`, `formatNumber`, `formatMoney`), which take the active
language and apply the application's agreed rule for digits. Stored values are never changed, only how they
are shown.

## What is not a translation key

| Kind of text | What to do |
|---|---|
| Learner, staff and guardian names | Show the stored name. Use the separate Arabic-name field when one has been approved. Never translate. |
| School-configured names (classes, subjects, fee items, terms) | Show the school's Arabic value when it exists (`display_name` from the API), otherwise the stored value. Not a dictionary entry. |
| Stored codes: statuses, roles, enum values | Keep the stored value. Map it to a label key: `t('status.' + value)`. Add every possible value to both dictionaries. |
| Quranic text, surah names, religious terms | Use approved wording supplied by a reviewer. Do not generate. |
| Identifiers, URLs, device serials, log lines | Leave as they are. |
| Text typed by users (comments, notes) | Leave as written. |

## Messages from the server

API routes should return a stable **code** alongside any human-readable text, and the page translates the code:

```ts
// API
return NextResponse.json({ error: 'Phone number is required', code: 'PHONE_REQUIRED' }, { status: 400 });
```

```tsx
// Page
toast.error(t(`errors.api.${res.code}`, res.error));   // the one place a fallback is allowed:
                                                        // an unknown code still shows the server's text
```

The existing `error` text stays in the response so nothing that reads it today breaks. Internal exception
messages are never shown to users in either language.

## Right-to-left

- Prefer direction-aware utilities: `ms-2` / `me-2` / `ps-4` / `pe-4` / `text-start` / `text-end` instead of
  `ml-2` / `mr-2` / `pl-4` / `pr-4` / `text-left` / `text-right`.
- `space-x-*` needs `rtl:space-x-reverse`; `gap-*` on a flex or grid container needs nothing and is preferred.
- Icons that point in a direction (back arrows, chevrons, "next") get the `rtl-flip` class. Icons that do not
  imply direction (search, phone, a clock, a tick, logos) must not flip; mark them `data-no-mirror` if a parent
  flips.
- Wrap text that is always left-to-right inside Arabic (phone numbers, admission numbers, email addresses,
  amounts with a currency code) in `<bdi>` or `dir="ltr"`, so punctuation and digits do not jump.

## Checklist for adding or changing interface text

1. Add the key to `en.json` and `ar.json` in the same commit.
2. Use `t('…')` from `useI18n()`; no literal text in JSX, attributes, toasts, dialogs or column definitions.
3. Whole sentences with `{{placeholders}}`; same placeholder names in both languages.
4. Dates, numbers and money through the shared formatters.
5. Direction-aware spacing; directional icons flipped.
6. Run `node scripts/l10n-audit.mjs` and the completeness check; both must pass.
7. Look at the page in Arabic and in English, at desktop and phone width, and record it in the route
   inventory's verification log.

## The two rules every translated page must pass (owner, 2026-10-13)

1. **English shows English only, and exactly the English it showed before.** Translating a page must
   not reword, re-capitalise or restructure its English. The English dictionary value is the original
   string, character for character. A sentence with a bold name or a link inside it stays one
   sentence: use `rich('key', { name: <strong>…</strong> })`.
2. **Arabic shows Arabic only — digits included.** Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) wherever Arabic
   is shown. `t()` converts digits in dictionary text and in numeric placeholder values;
   `formatNumber`, `formatMoney`, `formatPercent` and `formatDate` produce them; a bare number in
   JSX (`{count}`, `#{id}`, `{score}%`) does not, so pass it through `formatNumber`, `formatPercent`
   or `digits()`. Identifiers that contain Latin letters ("ADM-001", "K40") are data and stay.

`node scripts/l10n-render.mjs <page>` reports both: "Western digits shown in Arabic" and "Arabic text
shown in English" must be 0 before a page is called translated.
