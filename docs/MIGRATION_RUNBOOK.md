# DRAIS Migration Apply + Verify Runbook

The system's predictability depends on the database being in the exact state
the code assumes. Several recent features ship migrations that may not be
applied to every environment yet. **Until these are applied, the matching code
paths reference tables/columns that don't exist** — they degrade (defensive
`safe()` wrappers, empty results) but the feature is effectively dark.

This runbook lists every migration the current code depends on, the order to
apply them, how to verify each, and how to roll back. Apply to **each
environment** (local, staging, production) separately.

---

## 0. Before you start

```bash
# Credentials live in .env.local (never commit). Export for the CLI:
set -a; source .env.local; set +a

# Connection shorthand used below:
#   mysql -h "$TIDB_HOST" -P "$TIDB_PORT" -u "$TIDB_USER" -p"$TIDB_PASSWORD" \
#         --ssl-mode=VERIFY_IDENTITY "$TIDB_DB"
```

**Always run the verifier first** to see current state — it modifies nothing:

```bash
mysql -h "$TIDB_HOST" -P "$TIDB_PORT" -u "$TIDB_USER" -p"$TIDB_PASSWORD" \
      --ssl-mode=VERIFY_IDENTITY "$TIDB_DB" < scripts/verify_migrations.sql
```

Every row prints `PRESENT` or `MISSING`. Apply only what's `MISSING`.

---

## 1. Apply order (dependencies first)

| # | Migration | Idempotent? | Feature it unlocks | Depends on |
|---|---|---|---|---|
| 1 | `migrations/platform_api_foundation.sql` | ✅ yes (`IF NOT EXISTS`) | Platform API: keys, audit, events, webhooks, idempotency, rate limit | `schools.external_id` (see note) |
| 2 | `migrations/platform_api_hardening.sql` | ⚠️ **NO** — see §3 | Webhook dedup, ops indexes, external_id backfill + trigger | #1 |
| 3 | `migrations/search_index.sql` | ✅ yes | Global command search (⌘K) | — |
| 4 | `migrations/parent_portal_foundation.sql` | ✅ yes | Parent portal identity + isolation | `school_settings`, `students`, `schools` |

> **`schools.external_id` note:** the platform layer needs this column. It is
> created/backfilled by `database/jeton_internal_control.sql` (legacy) AND
> re-backfilled + protected by a trigger in migration #2. If the verifier shows
> `schools.external_id = MISSING`, apply #2 (which adds the backfill + trigger)
> — but #2 assumes the column already exists. If it does not, run this first:
>
> ```sql
> ALTER TABLE schools ADD COLUMN IF NOT EXISTS external_id VARCHAR(255) NULL DEFAULT NULL;
> ALTER TABLE schools ADD UNIQUE INDEX IF NOT EXISTS uq_schools_external_id (external_id);
> ```

---

## 2. Applying each (idempotent ones — safe to re-run)

```bash
M=mysql\ -h\ "$TIDB_HOST"\ -P\ "$TIDB_PORT"\ -u\ "$TIDB_USER"\ -p"$TIDB_PASSWORD"\ --ssl-mode=VERIFY_IDENTITY\ "$TIDB_DB"

# 1
mysql ... < migrations/platform_api_foundation.sql
# 3
mysql ... < migrations/search_index.sql
# 4
mysql ... < migrations/parent_portal_foundation.sql
```

Re-running these is harmless (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`, guarded `INSERT ... WHERE NOT EXISTS`).

---

## 3. Applying the non-idempotent one (#2 hardening)

`platform_api_hardening.sql` contains `ALTER TABLE ... ADD UNIQUE/INDEX`
statements **without** `IF NOT EXISTS` (MySQL/TiDB don't support that form for
indexes). Re-running a fully-applied file errors with `Duplicate key name`.

**If the verifier shows its objects MISSING → apply once:**
```bash
mysql ... < migrations/platform_api_hardening.sql
```

**If it shows them PRESENT → already applied, skip.**

**If it shows them PARTIALLY applied** (e.g. unique key present, index missing),
apply only the missing statements by hand, e.g.:
```sql
ALTER TABLE platform_api_audit ADD INDEX ix_platform_audit_error_time (error_code, created_at);
```

The trigger block self-guards (`DROP TRIGGER IF EXISTS` then `CREATE`), so the
trigger + `UPDATE ... external_id` backfill portion is always safe to re-run on
its own.

---

## 4. Verify after applying

Re-run the verifier — every row must read `PRESENT`:

```bash
mysql ... < scripts/verify_migrations.sql
```

Then exercise each feature once:

| Feature | Smoke check |
|---|---|
| Search | `POST /api/admin/search/reindex` (admin) → ⌘K, type a learner name |
| Platform API | issue a key (`scripts/issue-platform-key.ts`) → `GET /api/platform/v1/health` = 200 |
| Parent portal | register at `/portal` → `GET /api/portal/me` returns `schools: []`, `needs_link: true` |
| External-id integrity | `SELECT COUNT(*) FROM schools WHERE external_id IS NULL AND deleted_at IS NULL;` → must be `0` |

---

## 5. Post-apply one-time tasks

- **Populate the search index** (it starts empty): `POST /api/admin/search/reindex`
  for each active school, or once per school after bulk imports.
- **Schedule the webhook worker** — `/api/cron/platform-webhooks` (needs
  `CRON_SECRET`). Hobby plan can't add a second Vercel cron, so use an external
  scheduler (cron-job.org / GitHub Actions) hitting it every 1–5 min, or upgrade
  to Pro.

---

## 6. Rollback

Each migration is additive; rollback = drop what it created.

```sql
-- #4 parent portal
DROP TABLE IF EXISTS parent_sessions, parent_otp_codes, parent_student_links, parent_accounts;
DELETE FROM school_settings WHERE key_name = 'parent_link_auto_approve';

-- #3 search
DROP TABLE IF EXISTS search_index;

-- #2 hardening (indexes/trigger only — leave foundation tables)
DROP TRIGGER IF EXISTS trg_schools_ensure_external_id;
ALTER TABLE webhook_deliveries  DROP INDEX uq_webhook_del_sub_event;
ALTER TABLE webhook_deliveries  DROP INDEX ix_webhook_del_status_created;
ALTER TABLE platform_api_audit  DROP INDEX ix_platform_audit_error_time;

-- #1 platform foundation
DROP TABLE IF EXISTS platform_rate_limits, platform_idempotency_keys,
  webhook_deliveries, webhook_subscriptions, platform_events,
  platform_api_audit, platform_api_keys;
```

Dropping platform/search/portal tables only disables those features; no
tenant/academic data is touched. `schools.external_id` should NOT be dropped
once JETON (or any external consumer) relies on it.

---

## 7. What "done" looks like

`scripts/verify_migrations.sql` returns **all PRESENT**, the four smoke checks
pass, `schools.external_id` has zero NULLs, and the search index is populated.
At that point the running code and the database agree — which is the whole
point of this step.
