# `src/lib/i18n/` — Server-side localisation and transliteration

Two files handling the Arabic half of DRAIS on the **server**: localised display names from the database, and
Latin→Arabic name transliteration.

UI translation (the `t()` function, `en.json` / `ar.json`) lives in `src/components/i18n/`. This folder is
about **data**, not interface strings.

## The additive rule

> **Arabic is always additive. A `NULL` or empty `*_ar` value falls back to the English value.**

Every localisable table carries an optional `*_ar` column alongside the English one. `localize.ts` resolves
the pair, preferring Arabic when present.

This is what makes Arabic support safe to roll out gradually:

- Existing English API consumers are **never** affected — they keep receiving a value.
- A school can translate its class names this term and its subject names next term.
- A missing translation degrades to English, never to an empty label.

**Never make an Arabic value required, and never return an empty string when the Arabic column is unset.** A
blank class name on a report card is worse than an English one.

## Transliteration is a draft, and says so

`translit.ts` converts Latin learner and staff names to Arabic script by rule. **It produces a draft only**,
and every result carries a **confidence** score.

The reason is linguistic, not technical: Arabic omits short vowels, and many Latin spellings of the same name
are ambiguous. There is no rule set that resolves that reliably — the correct Arabic spelling of a person's
name is a fact about that person, not a function of its Latin spelling.

> **A transliterated name must be reviewed before it is treated as the learner's Arabic name.** Do not
> auto-accept high-confidence output. It is a keystroke-saver for data entry, not a source of truth.

This is the same stance as the biometric name-matching policy: the system proposes, a human confirms, and the
system never silently commits a guess about a person's identity.

## Working in this folder

- **New localisable field?** Add the `*_ar` column as nullable, and resolve it through `localize.ts`.
- **Never hardcode Arabic** in a component or a query. It belongs in the data or the dictionaries.
- **Every localisation change keeps both languages.** Adding an Arabic path without the English fallback
  breaks every English consumer.
- **Test RTL.** Arabic implies right-to-left layout; a value that renders correctly may still sit in the wrong
  place.

## Known constraints

- **Transliteration covers names**, not general text.
- **Confidence is a heuristic**, not a probability — treat it as an ordering hint for a review queue.
- **Arabic numerals** (٠١٢٣) are handled in the report pipeline, not here; see `src/lib/snapshots/normalizers.ts`.

## Related

[`src/components/i18n/`](../../components/i18n/) — the `t()` provider and dictionaries · [`../snapshots/README.md`](../snapshots/README.md) — Arabic↔Western numeral normalisation · [`../drce/README.md`](../drce/README.md) — bilingual report vocabulary · [`docs/localization/PHASE0_AUDIT.md`](../../../docs/localization/PHASE0_AUDIT.md)
