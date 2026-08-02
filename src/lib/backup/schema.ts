/**
 * Database Backup Center — storage (runtime ensure, promise-gated).
 * See database/migrations/tidb/044_backup_center.sql for the production
 * migration; this is the defensive runtime fallback, same pattern as
 * ensureTimeIntelligenceSchema()/ensureFirstArrivalSchema().
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureBackupSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS backup_records (
         id                    BIGINT        PRIMARY KEY AUTO_INCREMENT,
         backup_uuid           CHAR(36)      NOT NULL,
         school_id             BIGINT        NOT NULL,
         school_name_snapshot  VARCHAR(255)  DEFAULT NULL,
         initiated_by_user_id  BIGINT        DEFAULT NULL,
         initiated_by_name     VARCHAR(255)  DEFAULT NULL,
         initiated_via         VARCHAR(16)   NOT NULL DEFAULT 'school',
         status                VARCHAR(16)   NOT NULL DEFAULT 'discovering',
         file_name             VARCHAR(255)  DEFAULT NULL,
         table_count           INT           NOT NULL DEFAULT 0,
         tables_done           INT           NOT NULL DEFAULT 0,
         row_count_total       BIGINT        NOT NULL DEFAULT 0,
         rows_done             BIGINT        NOT NULL DEFAULT 0,
         estimated_row_count   BIGINT        DEFAULT NULL,
         size_warning          TINYINT       NOT NULL DEFAULT 0,
         uncompressed_bytes    BIGINT        DEFAULT NULL,
         compressed_bytes      BIGINT        DEFAULT NULL,
         checksum_sha256       CHAR(64)      DEFAULT NULL,
         drais_version         VARCHAR(32)   DEFAULT NULL,
         db_engine             VARCHAR(32)   DEFAULT NULL,
         db_version            VARCHAR(64)   DEFAULT NULL,
         schema_version        VARCHAR(32)   DEFAULT NULL,
         error_message         VARCHAR(500)  DEFAULT NULL,
         started_at            TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
         completed_at          TIMESTAMP     NULL DEFAULT NULL,
         duration_ms           INT           DEFAULT NULL,
         UNIQUE KEY uk_backup_uuid (backup_uuid),
         KEY idx_school (school_id, started_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
    await query(
      `CREATE TABLE IF NOT EXISTS backup_chunks (
         id          BIGINT      PRIMARY KEY AUTO_INCREMENT,
         backup_id   BIGINT      NOT NULL,
         seq         INT         NOT NULL,
         table_name  VARCHAR(128) NOT NULL,
         sql_gzip    LONGBLOB    NOT NULL,
         row_count   INT         NOT NULL DEFAULT 0,
         created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP,
         KEY idx_backup_seq (backup_id, seq)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
    await query(
      `CREATE TABLE IF NOT EXISTS backup_parts (
         id                    BIGINT       PRIMARY KEY AUTO_INCREMENT,
         backup_id             BIGINT       NOT NULL,
         part_number           INT          NOT NULL,
         cloudinary_public_id  VARCHAR(255) NOT NULL,
         cloudinary_secure_url VARCHAR(500) NOT NULL,
         bytes                 BIGINT       NOT NULL DEFAULT 0,
         created_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
         KEY idx_backup_part (backup_id, part_number)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
  })();
  return ensured;
}
