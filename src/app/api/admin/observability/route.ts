/**
 * GET /api/admin/observability
 *
 * Returns a unified health / audit snapshot for the admin dashboard.
 * superAdmin only.
 *
 * Query params:
 *   ?page=1&limit=25
 *   ?section=errors|audit|migrations|all   (default: all)
 *   ?schoolId=<id>                          (filter by school, superAdmin can see all)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSessionSchoolId } from "@/lib/auth";
import { query } from "@/lib/db";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT     = 100;

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const page    = Math.max(1, parseInt(searchParams.get("page", 10)  ?? "1", 10));
  const rawLimit = parseInt(searchParams.get("limit", 10) ?? String(DEFAULT_LIMIT), 10);
  const limit   = Math.min(isNaN(rawLimit) ? DEFAULT_LIMIT : rawLimit, MAX_LIMIT);
  const offset  = (page - 1) * limit;
  const section = searchParams.get("section") ?? "all";
  const filterSchool = searchParams.get("schoolId") ?? null;

  try {
    const result: Record<string, unknown> = {};

    // ── System Errors ────────────────────────────────────────
    if (section === "all" || section === "errors") {
      const errParams: unknown[] = [limit, offset];
      let errWhere = "";
      if (filterSchool) {
        errWhere = "WHERE school_id = ?";
        errParams.unshift(filterSchool);
      }

      const [errors, errCount] = await Promise.all([
        query(
          `SELECT id, school_id, user_id, endpoint, method, error_message,
                  stack_trace, metadata, created_at
           FROM system_errors
           ${errWhere}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
          errParams
        ),
        query(
          `SELECT COUNT(*) AS total FROM system_errors ${errWhere}`,
          filterSchool ? [filterSchool] : []
        ),
      ]);

      result.errors = {
        data:  errors,
        total: (errCount as any[])[0]?.total ?? 0,
        page,
        limit,
      };
    }

    // ── Audit Logs ───────────────────────────────────────────
    if (section === "all" || section === "audit") {
      const auditParams: unknown[] = [limit, offset];
      let auditWhere = "";
      if (filterSchool) {
        auditWhere = "WHERE school_id = ?";
        auditParams.unshift(filterSchool);
      }

      const [audits, auditCount] = await Promise.all([
        query(
          `SELECT id, school_id, user_id, action, entity_type, entity_id,
                  description, ip_address, created_at
           FROM audit_logs
           ${auditWhere}
           ORDER BY created_at DESC
           LIMIT ? OFFSET ?`,
          auditParams
        ),
        query(
          `SELECT COUNT(*) AS total FROM audit_logs ${auditWhere}`,
          filterSchool ? [filterSchool] : []
        ),
      ]);

      result.audit = {
        data:  audits,
        total: (auditCount as any[])[0]?.total ?? 0,
        page,
        limit,
      };
    }

    // ── Migration Runs ───────────────────────────────────────
    if (section === "all" || section === "migrations") {
      const migParams: unknown[] = [limit, offset];
      let migWhere = "";
      if (filterSchool) {
        migWhere = "WHERE school_id = ?";
        migParams.unshift(filterSchool);
      }

      const [migrations, migCount] = await Promise.all([
        query(
          `SELECT id, school_id, run_by, total, success, updated, skipped,
                  errors, dry_run, started_at, completed_at
           FROM migration_runs
           ${migWhere}
           ORDER BY started_at DESC
           LIMIT ? OFFSET ?`,
          migParams
        ),
        query(
          `SELECT COUNT(*) AS total FROM migration_runs ${migWhere}`,
          filterSchool ? [filterSchool] : []
        ),
      ]);

      result.migrations = {
        data:  migrations,
        total: (migCount as any[])[0]?.total ?? 0,
        page,
        limit,
      };
    }

    // ── Summary stats (always included) ─────────────────────
    const schoolParam = filterSchool ? [filterSchool] : [];
    const schoolWhere = filterSchool ? "WHERE school_id = ?" : "";

    const [errSum, auditSum, migSum] = await Promise.all([
      query(`SELECT COUNT(*) AS cnt FROM system_errors ${schoolWhere} AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`.replace("WHERE  AND", "WHERE"), schoolParam),
      query(`SELECT COUNT(*) AS cnt FROM audit_logs ${schoolWhere} AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`.replace("WHERE  AND", "WHERE"), schoolParam),
      query(`SELECT COUNT(*) AS cnt, SUM(success) AS total_imported FROM migration_runs ${schoolWhere}`.replace("WHERE  AND", "WHERE"), schoolParam),
    ]);

    result.summary = {
      errors_last_24h:  (errSum   as any[])[0]?.cnt            ?? 0,
      audit_last_24h:   (auditSum as any[])[0]?.cnt            ?? 0,
      total_migrations: (migSum   as any[])[0]?.cnt            ?? 0,
      total_imported:   (migSum   as any[])[0]?.total_imported ?? 0,
    };

    return NextResponse.json(result);
  } catch (err) {
    console.error("[observability] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
