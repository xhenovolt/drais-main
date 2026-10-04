/**
 * @drais/repo-sqlite — the FULL schema shell (Phase 7 sub-effort 23).
 *
 * Generated from live TiDB's information_schema (not hand-written, not
 * guessed) — covers every table NOT already hand-modeled in schema.ts's
 * curated ~22 (students/staff/classes/etc., which the real offline Repos
 * layer reads and writes). These 301 tables exist here so a .drs
 * export genuinely contains the complete DRAIS schema (per the 2026-10
 * lean-offline-export brief's explicit requirement: "even if a table is
 * intentionally empty, the table itself must exist") — NOT because any
 * offline repo code reads or writes them. They are schema-only shells
 * until/unless a future sub-effort builds real offline support for them.
 *
 * Regenerate via scripts/db/generate-shell-schema.mjs if the live schema
 * changes meaningfully — this file is a reviewed SNAPSHOT, not computed at
 * export time, so an export never depends on extra live round-trips beyond
 * copying data.
 *
 * Translation rules (same as schema.ts's own documented conventions):
 *   BIGINT/INT/... AUTO_INCREMENT single-column PK → INTEGER PRIMARY KEY AUTOINCREMENT
 *   ENUM('a','b')                                   → TEXT CHECK (col IS NULL OR col IN (...))
 *   VARCHAR/CHAR/TEXT/JSON/TIMESTAMP/DATETIME/DATE/TIME → TEXT
 *   DECIMAL/FLOAT/DOUBLE                            → NUMERIC
 *   LONGBLOB/MEDIUMBLOB                             → BLOB
 *   Composite PKs                                   → table-level PRIMARY KEY (...)
 *   ON UPDATE CURRENT_TIMESTAMP, column DEFAULTs     → NOT replicated (every
 *     row's real values are copied explicitly at export time; nothing
 *     offline autonomously inserts into a shell table, so a DB-level
 *     default has nothing to do)
 *   Foreign keys                                     → NOT declared as SQLite
 *     FK constraints here. PRAGMA foreign_keys stays OFF for this
 *     connection (same as every other sqlite connection in this codebase),
 *     so they would be inert metadata, not an enforced guarantee — omitted
 *     rather than implying a guarantee that isn't real.
 */

export const SHELL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS academic_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  name_ar TEXT
);

CREATE TABLE IF NOT EXISTS admission_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor_user_id INTEGER,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admission_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admission_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL,
  verified INTEGER NOT NULL,
  verified_by INTEGER,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS admissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  application_no TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  other_name TEXT,
  gender TEXT CHECK (gender IS NULL OR gender IN ('male','female','other')),
  date_of_birth TEXT,
  nationality_id INTEGER,
  district_id INTEGER,
  applicant_phone TEXT,
  applicant_email TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian_email TEXT,
  guardian_relation TEXT,
  desired_class_id INTEGER,
  desired_stream_id INTEGER,
  desired_term_id INTEGER,
  desired_academic_year_id INTEGER,
  previous_school TEXT,
  notes TEXT,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('applicant','review','approved','rejected','enrolled','archived')),
  rejection_reason TEXT,
  reviewed_by INTEGER,
  reviewed_at TEXT,
  approved_by INTEGER,
  approved_at TEXT,
  enrolled_student_id INTEGER,
  enrolled_at TEXT,
  source TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_acquisition_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  acquisition_id INTEGER NOT NULL,
  seq INTEGER,
  device_user_id TEXT NOT NULL,
  device_wall_time TEXT NOT NULL,
  verify_type INTEGER,
  io_mode INTEGER,
  status_code INTEGER,
  display_name TEXT,
  matched INTEGER,
  person_id INTEGER,
  role_type TEXT,
  role_ref_id INTEGER,
  duplicate_of_event_id INTEGER,
  committed_event_id INTEGER,
  validation_flags TEXT,
  raw_hex TEXT,
  created_at TEXT,
  corrected_wall_time TEXT
);

CREATE TABLE IF NOT EXISTS attendance_acquisitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT,
  device_ip TEXT,
  method TEXT NOT NULL CHECK (method IS NULL OR method IN ('tcp_pull','adms_push','usb_import','csv_import','manual_entry')),
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('pulling','staged','validated','committed','discarded','failed')),
  requested_by INTEGER,
  window_from TEXT,
  window_to TEXT,
  device_log_count INTEGER,
  records_received INTEGER NOT NULL,
  records_staged INTEGER NOT NULL,
  records_committed INTEGER NOT NULL,
  records_duplicate INTEGER NOT NULL,
  records_unmatched INTEGER NOT NULL,
  records_failed INTEGER NOT NULL,
  device_time_at_pull TEXT,
  server_time_at_pull TEXT,
  clock_delta_seconds INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  warnings_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT,
  operator_device_wall TEXT,
  operator_real_wall TEXT,
  operator_drift_seconds INTEGER,
  correction_applied INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IS NULL OR entity_type IN ('daily_attendance','manual_entry','device','rule')),
  entity_id INTEGER NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IS NULL OR change_type IN ('create','update','delete','process')),
  user_id INTEGER,
  user_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  old_values TEXT,
  new_values TEXT,
  change_summary TEXT,
  timestamp TEXT
);

CREATE TABLE IF NOT EXISTS attendance_boarding_policy (
  school_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  previous_mode TEXT,
  effective_from TEXT,
  reporting_period TEXT NOT NULL,
  period_days INTEGER,
  reported_sms_enabled INTEGER NOT NULL,
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS attendance_daily_aggregates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IS NULL OR role_type IN ('student','staff')),
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('present','late','absent','half_day','early_leave','holiday','weekend')),
  count INTEGER NOT NULL,
  last_refreshed TEXT
);

CREATE TABLE IF NOT EXISTS attendance_first_arrival_anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  role_type TEXT,
  display_name TEXT,
  median_arrival_minute INTEGER,
  mad_minutes INTEGER,
  sample_days INTEGER NOT NULL,
  window_days INTEGER NOT NULL,
  earliness_rank INTEGER,
  is_anchor INTEGER NOT NULL,
  computed_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_first_arrival_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  local_date TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  anchors_expected INTEGER NOT NULL,
  anchors_present INTEGER NOT NULL,
  anchors_missing INTEGER NOT NULL,
  match_pct INTEGER,
  observed_first_minute INTEGER,
  baseline_days INTEGER NOT NULL,
  recommendation TEXT,
  likely_cause TEXT,
  shift_simulation TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_live_ui_settings (
  school_id INTEGER NOT NULL,
  live_popup_enabled INTEGER NOT NULL,
  show_for_students INTEGER NOT NULL,
  show_for_staff INTEGER NOT NULL,
  show_for_unknown INTEGER NOT NULL,
  show_for_late_only INTEGER NOT NULL,
  show_sms_status INTEGER NOT NULL,
  show_guardian_phone INTEGER NOT NULL,
  show_fee_balance INTEGER NOT NULL,
  sound_enabled INTEGER NOT NULL,
  popup_duration_ms INTEGER NOT NULL,
  mount_scope TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  device_user_id INTEGER NOT NULL,
  scan_timestamp TEXT NOT NULL,
  received_timestamp TEXT,
  verification_status TEXT CHECK (verification_status IS NULL OR verification_status IN ('success','failed','unknown')),
  biometric_quality INTEGER,
  device_log_id TEXT,
  device_sync_count INTEGER,
  processing_status TEXT CHECK (processing_status IS NULL OR processing_status IN ('pending','processed','error','duplicate')),
  process_error_message TEXT,
  mapped_device_user_id INTEGER,
  is_duplicate INTEGER,
  duplicate_of_log_id INTEGER,
  raw_data TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_processing_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IS NULL OR job_type IN ('process_device_logs','calculate_daily_attendance','recalculate_date_range','rule_recalculation','sync_device')),
  parameters TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('queued','processing','completed','failed','retrying')),
  priority INTEGER,
  attempted_count INTEGER,
  max_attempts INTEGER,
  result TEXT,
  error_message TEXT,
  error_details TEXT,
  created_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  next_retry_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_reconciliation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  attendance_session_id INTEGER,
  student_id INTEGER NOT NULL,
  manual_status TEXT CHECK (manual_status IS NULL OR manual_status IN ('present','absent','late','excused')),
  manual_marked_by INTEGER,
  manual_marked_at TEXT,
  biometric_status TEXT CHECK (biometric_status IS NULL OR biometric_status IN ('present','absent','late')),
  biometric_marked_at TEXT,
  reconciliation_status TEXT CHECK (reconciliation_status IS NULL OR reconciliation_status IN ('matched','conflict','biometric_only','manual_only')),
  conflict_resolution TEXT CHECK (conflict_resolution IS NULL OR conflict_resolution IN ('trust_biometric','trust_manual','manual_correction')),
  resolved_at TEXT,
  resolved_by INTEGER,
  resolution_notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  report_type TEXT CHECK (report_type IS NULL OR report_type IN ('daily_summary','weekly_trend','monthly_summary','class_analysis','student_profile','period_comparison')),
  date_from TEXT,
  date_to TEXT,
  class_id INTEGER,
  stream_id INTEGER,
  academic_year_id INTEGER,
  report_data TEXT,
  generated_by INTEGER,
  generated_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_rule_day_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  weekday INTEGER NOT NULL,
  arrival_start_time TEXT,
  arrival_end_time TEXT,
  late_threshold_minutes INTEGER,
  closing_time TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  stream_id INTEGER,
  term_id INTEGER,
  academic_year_id INTEGER,
  subject_id INTEGER,
  teacher_id INTEGER,
  session_date TEXT NOT NULL,
  session_start_time TEXT,
  session_end_time TEXT,
  session_type TEXT CHECK (session_type IS NULL OR session_type IN ('morning_check','lesson','assembly','afternoon_check','custom')),
  attendance_type TEXT CHECK (attendance_type IS NULL OR attendance_type IN ('manual','biometric','hybrid')),
  status TEXT CHECK (status IS NULL OR status IN ('draft','open','submitted','locked','finalized')),
  notes TEXT,
  submitted_at TEXT,
  submitted_by INTEGER,
  finalized_at TEXT,
  finalized_by INTEGER,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS attendance_sms_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  student_id INTEGER,
  attendance_date TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  decision TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  decision_json TEXT NOT NULL,
  outbox_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance_time_baselines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  median_first_minute INTEGER,
  mad_minutes INTEGER,
  p10_first_minute INTEGER,
  p90_first_minute INTEGER,
  earliest_minute INTEGER,
  latest_first_minute INTEGER,
  median_daily_punches INTEGER,
  sample_days INTEGER NOT NULL,
  window_days INTEGER NOT NULL,
  computed_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_time_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  local_date TEXT NOT NULL,
  shift_minutes INTEGER NOT NULL,
  affected_rows INTEGER NOT NULL,
  original_times TEXT,
  source TEXT NOT NULL,
  applied_by INTEGER,
  applied_at TEXT,
  undone_by INTEGER,
  undone_at TEXT
);

CREATE TABLE IF NOT EXISTS attendance_time_policy (
  school_id INTEGER NOT NULL,
  school_timezone TEXT NOT NULL,
  utc_offset_minutes INTEGER NOT NULL,
  device_time_policy TEXT NOT NULL,
  auto_sync_device_time INTEGER NOT NULL,
  max_allowed_drift_seconds INTEGER NOT NULL,
  correct_offline_backlog INTEGER NOT NULL,
  display_raw_and_corrected_time INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  max_offline_backlog_seconds INTEGER NOT NULL,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS attendance_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  email TEXT,
  username TEXT,
  password_hash TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  role TEXT CHECK (role IS NULL OR role IN ('admin','director','teacher','parent','student','staff')),
  is_active INTEGER,
  email_verified INTEGER,
  last_login_at TEXT,
  last_login_ip TEXT,
  password_changed_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  changes_json TEXT,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  school_id INTEGER
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  old_values TEXT,
  new_values TEXT,
  ip_address TEXT,
  user_agent TEXT,
  status TEXT,
  error_message TEXT,
  created_at TEXT,
  action_type TEXT,
  details TEXT,
  source TEXT
);

CREATE TABLE IF NOT EXISTS audit_purges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  purged_by INTEGER,
  purged_by_email TEXT,
  reason TEXT NOT NULL,
  filter_json TEXT,
  rows_deleted INTEGER NOT NULL,
  oldest_purged TEXT,
  newest_purged TEXT,
  sample_json TEXT,
  ip TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS auth_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  code TEXT NOT NULL,
  consumed_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  table_name TEXT NOT NULL,
  sql_gzip BLOB NOT NULL,
  row_count INTEGER NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS backup_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_id INTEGER NOT NULL,
  part_number INTEGER NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  cloudinary_secure_url TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS backup_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  backup_uuid TEXT NOT NULL,
  school_id INTEGER NOT NULL,
  school_name_snapshot TEXT,
  initiated_by_user_id INTEGER,
  initiated_by_name TEXT,
  initiated_via TEXT NOT NULL,
  status TEXT NOT NULL,
  file_name TEXT,
  table_count INTEGER NOT NULL,
  tables_done INTEGER NOT NULL,
  row_count_total INTEGER NOT NULL,
  rows_done INTEGER NOT NULL,
  estimated_row_count INTEGER,
  size_warning INTEGER NOT NULL,
  uncompressed_bytes INTEGER,
  compressed_bytes INTEGER,
  checksum_sha256 TEXT,
  drais_version TEXT,
  db_engine TEXT,
  db_version TEXT,
  schema_version TEXT,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS balance_reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  student_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  reminder_type TEXT CHECK (reminder_type IS NULL OR reminder_type IN ('email','sms','both')),
  threshold_amount NUMERIC,
  message TEXT,
  sent_at TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('pending','sent','failed')),
  response_data TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS biometric_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_name TEXT NOT NULL,
  device_code TEXT,
  device_type TEXT,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  location TEXT,
  ip_address TEXT,
  mac_address TEXT,
  fingerprint_capacity INTEGER,
  enrollment_count INTEGER,
  status TEXT CHECK (status IS NULL OR status IN ('active','inactive','maintenance','offline')),
  last_sync_at TEXT,
  sync_status TEXT CHECK (sync_status IS NULL OR sync_status IN ('synced','pending','failed')),
  sync_error_message TEXT,
  last_sync_record_count INTEGER,
  battery_level INTEGER,
  storage_used_percent NUMERIC,
  is_master INTEGER,
  api_key TEXT,
  api_secret TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS biometric_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_uuid TEXT NOT NULL,
  school_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  role_type TEXT NOT NULL CHECK (role_type IS NULL OR role_type IN ('student','staff','visitor')),
  role_ref_id INTEGER NOT NULL,
  pin_value INTEGER NOT NULL,
  card_number TEXT,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('active','pending_capture','suspended','revoked','transferred')),
  origin_device_sn TEXT,
  enrolled_by INTEGER,
  enrolled_at TEXT,
  revoked_at TEXT,
  revoked_reason TEXT,
  legacy_source TEXT,
  legacy_id INTEGER,
  updated_at TEXT,
  capture_status TEXT NOT NULL,
  captured_at TEXT,
  last_seen_on_device_at TEXT,
  updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS biometric_enrollments_legacy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  device_slot INTEGER,
  student_id INTEGER,
  staff_id INTEGER,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('INITIATED','CAPTURED','UNASSIGNED','ASSIGNED','VERIFIED','ORPHANED')),
  source TEXT NOT NULL CHECK (source IS NULL OR source IN ('local','relay','adms')),
  session_id INTEGER,
  finger_index INTEGER,
  initiated_at TEXT NOT NULL,
  captured_at TEXT,
  assigned_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS biometric_face_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  enrollment_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  requested_at TEXT,
  command_id INTEGER,
  captured_at TEXT,
  template_size INTEGER,
  bio_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS biometric_mapping_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  enrollment_id INTEGER,
  device_sn TEXT,
  pin_value INTEGER,
  action TEXT NOT NULL,
  old_role_type TEXT CHECK (old_role_type IS NULL OR old_role_type IN ('student','staff','visitor')),
  old_role_ref_id INTEGER,
  old_person_id INTEGER,
  new_role_type TEXT CHECK (new_role_type IS NULL OR new_role_type IN ('student','staff','visitor')),
  new_role_ref_id INTEGER,
  new_person_id INTEGER,
  reason TEXT,
  actor_user_id INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS biometric_match_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  device_pin TEXT NOT NULL,
  device_name TEXT,
  device_priv INTEGER,
  device_card TEXT,
  has_fingerprint INTEGER,
  candidate_role TEXT,
  candidate_ref_id INTEGER,
  candidate_person_id INTEGER,
  candidate_name TEXT,
  candidate_position TEXT,
  confidence INTEGER NOT NULL,
  tier TEXT NOT NULL CHECK (tier IS NULL OR tier IN ('auto','review','unmatched')),
  contested INTEGER NOT NULL,
  match_rank INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('pending','confirmed','rejected','superseded')),
  decided_by INTEGER,
  decided_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS biometric_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL,
  finger_index INTEGER NOT NULL,
  template_bytes BLOB NOT NULL,
  template_size INTEGER,
  template_format TEXT NOT NULL,
  quality_score INTEGER,
  captured_at TEXT,
  captured_device_sn TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS boarding_presence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('checked_in','on_leave')),
  since_date TEXT NOT NULL,
  expected_return_date TEXT,
  reason TEXT,
  recorded_by INTEGER,
  source TEXT NOT NULL CHECK (source IS NULL OR source IN ('manual','biometric')),
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS boarding_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  period_key TEXT NOT NULL,
  period_start TEXT,
  period_end TEXT,
  reported_at TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  first_punch_event_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  budget_type TEXT NOT NULL,
  term_id INTEGER,
  scope_ref_id INTEGER,
  planned_amount NUMERIC NOT NULL,
  approved_amount NUMERIC NOT NULL,
  status TEXT NOT NULL,
  warning_threshold_pct INTEGER NOT NULL,
  notes TEXT,
  created_by INTEGER,
  approved_by INTEGER,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS class_teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  stream_id INTEGER,
  term_id INTEGER NOT NULL,
  staff_id INTEGER NOT NULL,
  assigned_by INTEGER NOT NULL,
  assigned_at TEXT NOT NULL,
  valid_until TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS comm_dispatch_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IS NULL OR channel IN ('sms','email','whatsapp','push','in_app')),
  template_id INTEGER,
  rule_id INTEGER,
  recipient_phone TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  recipient_user_id INTEGER,
  recipient_student_id INTEGER,
  recipient_staff_id INTEGER,
  message_body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('queued','sent','failed','skipped','delivered','read')),
  provider TEXT,
  provider_message_id TEXT,
  provider_cost TEXT,
  error_message TEXT,
  retries INTEGER NOT NULL,
  triggered_by_user_id INTEGER,
  source TEXT NOT NULL CHECK (source IS NULL OR source IN ('auto','manual')),
  context_json TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS comm_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IS NULL OR channel IN ('sms','email','whatsapp','push','in_app')),
  audience TEXT NOT NULL,
  custom_phones TEXT,
  auto_send INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS comm_settings (
  school_id INTEGER NOT NULL,
  sender_name TEXT,
  prefix TEXT,
  auto_mode INTEGER NOT NULL,
  default_provider TEXT NOT NULL,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  retry_attempts INTEGER NOT NULL,
  retry_delay_secs INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  provider_username TEXT,
  provider_api_key TEXT,
  sms_enabled INTEGER NOT NULL,
  staff_room_phones TEXT,
  whatsapp_enabled INTEGER NOT NULL,
  whatsapp_provider TEXT NOT NULL,
  whatsapp_sender TEXT,
  whatsapp_provider_base_url TEXT,
  whatsapp_provider_api_key TEXT,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS comm_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  event_type TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IS NULL OR channel IN ('sms','email','whatsapp','push','in_app')),
  body TEXT NOT NULL,
  language TEXT NOT NULL,
  is_active INTEGER NOT NULL,
  description TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  contact_type TEXT NOT NULL,
  occupation TEXT,
  alive_status TEXT,
  date_of_death TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS control_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource TEXT,
  metadata TEXT,
  ip TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS control_login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT,
  success INTEGER NOT NULL,
  attempted_at TEXT
);

CREATE TABLE IF NOT EXISTS control_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT,
  last_activity_at TEXT,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS control_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT,
  last_login TEXT,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL,
  totp_recovery TEXT
);

CREATE TABLE IF NOT EXISTS counties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id INTEGER NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS curriculums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER,
  school_id INTEGER
);

CREATE TABLE IF NOT EXISTS custom_fields (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IS NULL OR entity_type IN ('student','staff')),
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  data_type TEXT NOT NULL CHECK (data_type IS NULL OR data_type IN ('text','long_text','number','date','boolean','select','multiselect','phone','email','url')),
  options_json TEXT,
  validation_json TEXT,
  default_value TEXT,
  is_required INTEGER NOT NULL,
  is_searchable INTEGER NOT NULL,
  read_permission TEXT,
  write_permission TEXT,
  display_order INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS dahua_attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  student_id INTEGER,
  card_no TEXT,
  user_id TEXT,
  event_time TEXT NOT NULL,
  event_type TEXT CHECK (event_type IS NULL OR event_type IN ('Entry','Exit','Unknown')),
  method TEXT CHECK (method IS NULL OR method IN ('fingerprint','card','face','password','unknown')),
  status TEXT CHECK (status IS NULL OR status IN ('present','absent','late','processed')),
  raw_log_id INTEGER,
  matched_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS dahua_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_name TEXT NOT NULL,
  device_code TEXT,
  ip_address TEXT NOT NULL,
  port INTEGER,
  api_url TEXT NOT NULL,
  username TEXT,
  password TEXT,
  device_type TEXT CHECK (device_type IS NULL OR device_type IN ('attendance','access_control','hybrid')),
  protocol TEXT CHECK (protocol IS NULL OR protocol IN ('http','https')),
  status TEXT CHECK (status IS NULL OR status IN ('active','inactive','offline','error')),
  last_sync TEXT,
  last_sync_status TEXT CHECK (last_sync_status IS NULL OR last_sync_status IN ('success','failed','pending')),
  last_error_message TEXT,
  auto_sync_enabled INTEGER,
  sync_interval_minutes INTEGER,
  late_threshold_minutes INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS dahua_raw_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  raw_data TEXT NOT NULL,
  record_count INTEGER,
  parsed_successfully INTEGER,
  parse_errors TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS dahua_sync_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  sync_type TEXT CHECK (sync_type IS NULL OR sync_type IN ('manual','scheduled','automatic')),
  records_fetched INTEGER,
  records_processed INTEGER,
  records_failed INTEGER,
  status TEXT CHECK (status IS NULL OR status IN ('in_progress','success','failed','partial')),
  started_at TEXT,
  completed_at TEXT,
  error_details TEXT
);

CREATE TABLE IF NOT EXISTS daily_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  person_type TEXT NOT NULL CHECK (person_type IS NULL OR person_type IN ('student','teacher')),
  person_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT CHECK (status IS NULL OR status IN ('present','late','absent','excused','on_leave','pending')),
  first_arrival_time TEXT,
  last_departure_time TEXT,
  arrival_device_id INTEGER,
  is_manual_entry INTEGER,
  manual_entry_id INTEGER,
  is_late INTEGER,
  late_minutes INTEGER,
  late_reason TEXT,
  excuse_type TEXT CHECK (excuse_type IS NULL OR excuse_type IN ('medical','parental','official','other','none')),
  excuse_note TEXT,
  marking_rule_id INTEGER,
  processing_metadata TEXT,
  created_at TEXT,
  updated_at TEXT,
  processed_at TEXT
);

CREATE TABLE IF NOT EXISTS deadline_reminder_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  deadline_id INTEGER NOT NULL,
  recipient_phone TEXT NOT NULL,
  staff_id INTEGER,
  sent_at TEXT NOT NULL,
  status TEXT NOT NULL,
  message_id TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS department_workplans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  department_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_datetime TEXT,
  end_datetime TEXT,
  status TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_config_id INTEGER NOT NULL,
  device_serial_number TEXT,
  event_timestamp TEXT NOT NULL,
  user_id TEXT,
  card_number TEXT,
  person_name TEXT,
  access_result TEXT CHECK (access_result IS NULL OR access_result IN ('granted','denied','unknown')),
  device_event_id TEXT,
  device_event_type TEXT,
  raw_payload TEXT,
  is_synced INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS device_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_sn TEXT NOT NULL,
  school_id INTEGER,
  severity TEXT NOT NULL CHECK (severity IS NULL OR severity IN ('info','warning','critical')),
  code TEXT NOT NULL,
  message TEXT,
  details TEXT,
  created_at TEXT,
  acknowledged_at TEXT,
  acknowledged_by INTEGER
);

CREATE TABLE IF NOT EXISTS device_attendance_scopes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  scope TEXT NOT NULL,
  class_id INTEGER,
  stream_id INTEGER,
  room TEXT,
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_clock_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  local_date TEXT NOT NULL,
  confidence INTEGER NOT NULL,
  status TEXT NOT NULL,
  offset_estimate_min INTEGER,
  likely_cause TEXT,
  detail TEXT,
  batch_size INTEGER,
  first_arrival_minute INTEGER,
  corrected INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  raw_drift_min INTEGER,
  residual_drift_min INTEGER,
  resolved_by_policy INTEGER NOT NULL,
  policy TEXT
);

CREATE TABLE IF NOT EXISTS device_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_name TEXT NOT NULL,
  device_ip TEXT NOT NULL,
  device_port INTEGER,
  device_username TEXT NOT NULL,
  device_password_encrypted TEXT NOT NULL,
  device_serial_number TEXT,
  device_type TEXT,
  connection_status TEXT CHECK (connection_status IS NULL OR connection_status IN ('connected','disconnected','error')),
  last_connection_attempt TEXT,
  last_successful_connection TEXT,
  last_error_message TEXT,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS device_connection_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_config_id INTEGER NOT NULL,
  connection_attempt_type TEXT CHECK (connection_attempt_type IS NULL OR connection_attempt_type IN ('test','scheduled_check','manual_reconnect','system_startup')),
  status TEXT CHECK (status IS NULL OR status IN ('success','failed','timeout','unauthorized','unreachable','api_error')),
  http_status_code INTEGER,
  error_message TEXT,
  response_time_ms INTEGER,
  ip_address TEXT,
  port INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS device_directory_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  device_user_pin TEXT,
  action TEXT NOT NULL,
  actor_user_id INTEGER,
  detail_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sn TEXT NOT NULL,
  ip TEXT,
  push_version TEXT,
  options TEXT,
  payload TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_inventory_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IS NULL OR method IN ('tcp','adms')),
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('pending','running','completed','failed','timeout')),
  command_id INTEGER,
  users_returned_count INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  triggered_by INTEGER
);

CREATE TABLE IF NOT EXISTS device_log_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  device_sn TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL,
  trigger_source TEXT NOT NULL,
  command_id INTEGER,
  recovered_count INTEGER NOT NULL,
  inserted_count INTEGER NOT NULL,
  matched_count INTEGER NOT NULL,
  unresolved_count INTEGER NOT NULL,
  duplicate_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  error_message TEXT,
  triggered_by INTEGER,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS device_reconciliation_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  device_user_pin TEXT,
  device_name TEXT,
  matched_person_id INTEGER,
  matched_role_type TEXT CHECK (matched_role_type IS NULL OR matched_role_type IN ('student','staff')),
  matched_role_ref_id INTEGER,
  canonical_enrollment_id INTEGER,
  mismatch_type TEXT NOT NULL,
  confidence NUMERIC,
  candidates_json TEXT,
  action_status TEXT NOT NULL CHECK (action_status IS NULL OR action_status IN ('open','resolved','ignored','quarantined')),
  action_taken TEXT,
  resolved_by INTEGER,
  resolved_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_reconciliation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('running','completed','failed','partial')),
  trigger_source TEXT,
  requested_by INTEGER,
  device_user_count INTEGER NOT NULL,
  drais_expected_count INTEGER NOT NULL,
  mapped_count INTEGER NOT NULL,
  mismatch_count INTEGER NOT NULL,
  directory_is_partial INTEGER NOT NULL,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS device_school_hidden (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  hidden_by INTEGER,
  hidden_at TEXT
);

CREATE TABLE IF NOT EXISTS device_sync_checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  last_synced_device_time TEXT,
  last_synced_remote_time TEXT,
  total_logs_synced INTEGER,
  failed_sync_attempts INTEGER,
  is_syncing INTEGER,
  sync_status TEXT CHECK (sync_status IS NULL OR sync_status IN ('success','partial','failed')),
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS device_sync_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  sync_type TEXT CHECK (sync_type IS NULL OR sync_type IN ('attendance_download','fingerprint_upload','logs_fetch','device_sync')),
  sync_direction TEXT CHECK (sync_direction IS NULL OR sync_direction IN ('pull','push','bidirectional')),
  status TEXT CHECK (status IS NULL OR status IN ('pending','in_progress','success','partial_success','failed')),
  records_processed INTEGER,
  records_synced INTEGER,
  records_failed INTEGER,
  error_message TEXT,
  details_json TEXT,
  started_at TEXT,
  completed_at TEXT,
  duration_seconds INTEGER,
  initiated_by INTEGER
);

CREATE TABLE IF NOT EXISTS device_sync_state (
  id TEXT NOT NULL,
  device_sn TEXT NOT NULL,
  school_id INTEGER,
  expected_user_count INTEGER,
  last_known_device_user_count INTEGER,
  sync_status TEXT,
  last_sync_at TEXT,
  updated_at TEXT,
  PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS device_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_sn TEXT NOT NULL,
  from_school_id INTEGER,
  to_school_id INTEGER,
  initiated_by INTEGER,
  initiated_at TEXT,
  completed_at TEXT,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('initiated','released','acquired','decommissioned','aborted')),
  reason TEXT,
  enrollments_archived INTEGER NOT NULL,
  orphans_archived INTEGER NOT NULL,
  raw_events_preserved INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS device_user_directory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  device_sn TEXT NOT NULL,
  device_user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  device_card TEXT,
  device_priv TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  card_number TEXT,
  last_sync_run_id INTEGER,
  has_recent_echo INTEGER NOT NULL,
  directory_status TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_user_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  device_user_id TEXT,
  sync_status TEXT CHECK (sync_status IS NULL OR sync_status IN ('synced','pending','failed')),
  last_synced_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS device_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_user_id INTEGER NOT NULL,
  person_type TEXT NOT NULL CHECK (person_type IS NULL OR person_type IN ('student','teacher')),
  person_id INTEGER NOT NULL,
  device_name TEXT,
  is_enrolled INTEGER,
  enrollment_date TEXT,
  unenrollment_date TEXT,
  biometric_quality INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sn TEXT NOT NULL,
  model_name TEXT,
  last_seen TEXT NOT NULL,
  ip_address TEXT,
  is_online INTEGER,
  created_at TEXT,
  updated_at TEXT,
  device_name TEXT,
  location TEXT,
  firmware_version TEXT,
  push_version TEXT,
  options TEXT,
  school_id INTEGER,
  status TEXT NOT NULL,
  last_activity TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER,
  device_type TEXT,
  device_user_count INTEGER,
  device_user_count_at TEXT,
  device_user_count_source TEXT,
  lan_ip TEXT,
  clock_offset_seconds INTEGER,
  clock_last_synced_at TEXT,
  tz_offset_minutes INTEGER,
  passout_enabled INTEGER NOT NULL,
  role_label TEXT
);

CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS document_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  owner_type TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  document_type_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  issued_by TEXT,
  issue_date TEXT,
  notes TEXT,
  uploaded_by INTEGER,
  uploaded_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS drce_blocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IS NULL OR kind IN ('header','footer','comment_rules','custom')),
  schema_json TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drce_document_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL,
  schema_json TEXT NOT NULL,
  name TEXT,
  change_summary TEXT,
  author_user_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS drce_starters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  document_kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  schema_json TEXT NOT NULL,
  thumbnail_url TEXT,
  sort_order INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS dvcf_active_documents (
  school_id INTEGER NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IS NULL OR document_type IN ('report_card','id_card','transcript')),
  document_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (school_id, document_type)
);

CREATE TABLE IF NOT EXISTS dvcf_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  document_type TEXT NOT NULL CHECK (document_type IS NULL OR document_type IN ('report_card','id_card','transcript')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  is_default INTEGER NOT NULL,
  template_key TEXT,
  template_category TEXT NOT NULL CHECK (template_category IS NULL OR template_category IN ('standard','emergency','legacy_rpt','drce','arabic','custom')),
  document_kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('draft','pending_approval','approved','published','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  parent_id INTEGER,
  submitted_at TEXT,
  submitted_by INTEGER,
  approved_at TEXT,
  approved_by INTEGER,
  approval_notes TEXT,
  published_at TEXT,
  published_by INTEGER,
  archived_at TEXT,
  archived_by INTEGER
);

CREATE TABLE IF NOT EXISTS enrollment_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  enrollment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  old_class_id INTEGER,
  new_class_id INTEGER NOT NULL,
  changed_by INTEGER NOT NULL,
  reason TEXT,
  metadata TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS enrollment_programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id INTEGER NOT NULL,
  program_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollment_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  initiated_by INTEGER NOT NULL,
  student_id INTEGER,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('ACTIVE','COMPLETED','FAILED','EXPIRED')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_datetime TEXT NOT NULL,
  end_datetime TEXT NOT NULL,
  location TEXT,
  status TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  term_id INTEGER,
  name TEXT NOT NULL,
  body TEXT,
  date TEXT,
  start_time TEXT,
  end_time TEXT,
  status TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS expenditures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  category_id INTEGER NOT NULL,
  wallet_id INTEGER,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  vendor_name TEXT,
  vendor_contact TEXT,
  invoice_number TEXT,
  receipt_url TEXT,
  expense_date TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('pending','approved','paid','cancelled')),
  approved_by INTEGER,
  approved_at TEXT,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER,
  budget_id INTEGER
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  route_name TEXT NOT NULL,
  route_path TEXT NOT NULL,
  label TEXT NOT NULL,
  flag_name TEXT NOT NULL,
  flag_key TEXT NOT NULL,
  description TEXT,
  is_enabled INTEGER,
  is_new INTEGER,
  version_tag TEXT,
  category TEXT,
  priority INTEGER,
  date_added TEXT,
  expires_at TEXT,
  flag_type TEXT CHECK (flag_type IS NULL OR flag_type IN ('boolean','percentage','user_list','variant')),
  variant_data TEXT,
  rollout_percentage INTEGER,
  enabled_users TEXT,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS fee_assignment_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  fee_item_id INTEGER NOT NULL,
  term_id INTEGER,
  school_id INTEGER NOT NULL,
  ledger_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_clearance_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  term_id INTEGER,
  academic_year_id INTEGER,
  status TEXT NOT NULL,
  reason TEXT,
  requested_by INTEGER,
  approved_by INTEGER,
  approved_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_eligibility_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  fee_item_id INTEGER NOT NULL,
  name TEXT,
  applies_to TEXT NOT NULL,
  class_ids TEXT,
  level_min INTEGER,
  level_max INTEGER,
  gender TEXT,
  boarding TEXT,
  stream_id INTEGER,
  program_id INTEGER,
  is_candidate INTEGER,
  term_id INTEGER,
  academic_year_id INTEGER,
  amount NUMERIC,
  priority INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  is_new_entrant INTEGER
);

CREATE TABLE IF NOT EXISTS fee_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  invoice_no TEXT NOT NULL,
  student_id INTEGER NOT NULL,
  academic_year_id INTEGER,
  term_id INTEGER,
  fee_structure_id INTEGER,
  total_amount NUMERIC,
  discount_amount NUMERIC,
  waive_amount NUMERIC,
  paid_amount NUMERIC,
  balance_amount NUMERIC,
  status TEXT CHECK (status IS NULL OR status IN ('draft','issued','partial','paid','overdue','cancelled')),
  issue_date TEXT,
  due_date TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS fee_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  category TEXT NOT NULL,
  default_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  frequency TEXT NOT NULL,
  mandatory INTEGER NOT NULL,
  optional INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  effective_from TEXT,
  effective_to TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  name_ar TEXT,
  payment_channel TEXT NOT NULL,
  clearance TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS fee_payment_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id INTEGER NOT NULL,
  fee_item_id INTEGER NOT NULL,
  allocated_amount NUMERIC NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS fee_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  fee_item_id INTEGER,
  term_id INTEGER NOT NULL,
  multi_term_ids TEXT,
  wallet_id INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  method TEXT,
  discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('percentage','fixed')),
  discount_reason TEXT,
  approved_by INTEGER,
  approved_at TEXT,
  receipt_url TEXT,
  invoice_url TEXT,
  notes TEXT,
  paid_by TEXT,
  payer_contact TEXT,
  reference TEXT,
  receipt_no TEXT,
  payment_status TEXT CHECK (payment_status IS NULL OR payment_status IN ('pending','completed','failed','refunded')),
  gateway_reference TEXT,
  gateway_response TEXT,
  mpesa_receipt TEXT,
  phone_number TEXT,
  ledger_id INTEGER,
  created_at TEXT NOT NULL,
  discount_applied NUMERIC,
  tax_amount NUMERIC
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  section_id INTEGER,
  term_id INTEGER NOT NULL,
  academic_year TEXT,
  item TEXT NOT NULL,
  fee_type TEXT CHECK (fee_type IS NULL OR fee_type IN ('tuition','uniform','transport','boarding','examination','activity','books','other')),
  is_mandatory INTEGER,
  amount NUMERIC NOT NULL,
  description TEXT,
  due_date TEXT,
  late_fee_amount NUMERIC,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS finance_account_transfers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  from_wallet_id INTEGER NOT NULL,
  to_wallet_id INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  transfer_type TEXT,
  reference TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IS NULL OR type IN ('income','liability','clearing','asset')),
  school_id INTEGER NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  metadata TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS finance_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  category_type TEXT CHECK (category_type IS NULL OR category_type IN ('income','expense','transfer')),
  parent_id INTEGER,
  is_system INTEGER,
  color TEXT,
  icon TEXT,
  is_active INTEGER,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_fee_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  class_id INTEGER,
  program_id INTEGER,
  term_id INTEGER,
  school_id INTEGER NOT NULL,
  account_id INTEGER,
  description TEXT,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_import_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  source_system TEXT NOT NULL,
  import_type TEXT NOT NULL,
  filename TEXT,
  status TEXT NOT NULL,
  term_id INTEGER,
  total_rows INTEGER NOT NULL,
  matched_rows INTEGER NOT NULL,
  ambiguous_rows INTEGER NOT NULL,
  unmatched_rows INTEGER NOT NULL,
  duplicate_rows INTEGER NOT NULL,
  committed_rows INTEGER NOT NULL,
  summary_json TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  committed_at TEXT
);

CREATE TABLE IF NOT EXISTS finance_import_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  row_no INTEGER NOT NULL,
  admission_no TEXT,
  student_name TEXT,
  amount NUMERIC,
  reference TEXT,
  payment_date TEXT,
  method TEXT,
  raw_json TEXT,
  match_status TEXT NOT NULL,
  matched_student_id INTEGER,
  candidates_json TEXT,
  action TEXT NOT NULL,
  error TEXT,
  committed INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  account_id INTEGER,
  method TEXT NOT NULL CHECK (method IS NULL OR method IN ('cash','bank_transfer','mpesa','airtel','card','cheque','other')),
  reference TEXT,
  receipt_no TEXT,
  paid_by TEXT,
  payer_contact TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  report_type TEXT CHECK (report_type IS NULL OR report_type IN ('income_statement','balance_sheet','cash_flow','fee_collection','expense_analysis','budget_variance')),
  report_name TEXT,
  report_period TEXT CHECK (report_period IS NULL OR report_period IN ('daily','weekly','monthly','term','yearly')),
  start_date TEXT,
  end_date TEXT,
  academic_year_id INTEGER,
  term_id INTEGER,
  report_data TEXT,
  generated_by INTEGER,
  generated_at TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('generating','completed','failed')),
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS fingerprint_orphans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  device_sn TEXT NOT NULL,
  device_user_id TEXT NOT NULL,
  finger_id TEXT NOT NULL,
  template_size INTEGER,
  template_data TEXT NOT NULL,
  valid_flag TEXT,
  captured_at TEXT NOT NULL,
  claimed_at TEXT,
  claimed_by INTEGER,
  claimed_student_id INTEGER,
  claimed_staff_id INTEGER
);

CREATE TABLE IF NOT EXISTS fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  student_id INTEGER,
  staff_id INTEGER,
  fingerprint_data BLOB NOT NULL,
  finger_position TEXT,
  quality_score INTEGER,
  enrollment_date TEXT,
  is_verified INTEGER,
  verified_at TEXT
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  holiday_date TEXT NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IS NULL OR scope IN ('national','school','class')),
  applies_to_classes TEXT,
  created_by INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS id_card_designs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  spec_json TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  is_active INTEGER NOT NULL,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS id_card_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_uuid TEXT NOT NULL,
  school_id INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  status TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_sha256 TEXT NOT NULL,
  file_data BLOB,
  storage_ref TEXT,
  sheet_name TEXT,
  header_row INTEGER NOT NULL,
  mapping_json TEXT,
  row_count INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  row_number INTEGER NOT NULL,
  reason TEXT,
  raw_data TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  filename TEXT,
  total_rows INTEGER NOT NULL,
  processed_rows INTEGER NOT NULL,
  created_count INTEGER NOT NULL,
  updated_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('running','paused','cancelled','completed','failed')),
  options TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ingestion_conflict_policy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  pipeline_name TEXT NOT NULL,
  field TEXT,
  policy TEXT NOT NULL CHECK (policy IS NULL OR policy IN ('prefer-new','prefer-existing','prefer-higher','prefer-lower','prefer-non-empty','merge-average','fail-loud')),
  set_by INTEGER,
  set_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_field_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  pipeline_name TEXT NOT NULL,
  source_header TEXT NOT NULL,
  canonical_field TEXT NOT NULL,
  approved_by INTEGER,
  approved_at TEXT NOT NULL,
  last_used_at TEXT,
  use_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_orphans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  pipeline_name TEXT NOT NULL,
  run_id TEXT NOT NULL,
  source_file TEXT,
  source_sheet TEXT,
  source_row_index INTEGER,
  reason TEXT NOT NULL,
  candidates_json TEXT,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('pending','resolved','dismissed')),
  resolved_by INTEGER,
  resolved_at TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  school_id INTEGER NOT NULL,
  pipeline_name TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  report_json TEXT NOT NULL,
  parsed_count INTEGER NOT NULL,
  inserted_count INTEGER NOT NULL,
  updated_count INTEGER NOT NULL,
  merged_count INTEGER NOT NULL,
  skipped_count INTEGER NOT NULL,
  orphaned_count INTEGER NOT NULL,
  failed_count INTEGER NOT NULL,
  initiated_by INTEGER
);

CREATE TABLE IF NOT EXISTS initials_edit_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  previous_initials TEXT,
  new_initials TEXT NOT NULL,
  changed_by INTEGER NOT NULL,
  changed_at TEXT
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  store_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  capacity NUMERIC,
  reorder_level NUMERIC,
  current_quantity NUMERIC NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  tx_type TEXT NOT NULL CHECK (tx_type IS NULL OR tx_type IN ('in','out','adjust')),
  quantity NUMERIC NOT NULL,
  reference TEXT,
  notes TEXT,
  balance_after NUMERIC,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS issuance_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  detail_json TEXT,
  at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issuance_batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  document_kind TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  eligibility_json TEXT,
  scope_json TEXT,
  issued_run_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('draft','previewed','generating','generated','printed','failed','archived')),
  counts_json TEXT,
  generated_at TEXT,
  printed_at TEXT,
  failed_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by INTEGER
);

CREATE TABLE IF NOT EXISTS issuance_dedupe_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  template_id INTEGER NOT NULL,
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IS NULL OR recipient_kind IN ('student','staff')),
  recipient_id INTEGER NOT NULL,
  issued_run_key TEXT NOT NULL,
  batch_id INTEGER NOT NULL,
  item_id INTEGER NOT NULL,
  issued_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS issuance_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  recipient_kind TEXT NOT NULL CHECK (recipient_kind IS NULL OR recipient_kind IN ('student','staff')),
  recipient_id INTEGER NOT NULL,
  recipient_snapshot_json TEXT,
  rendered_html TEXT,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('eligible','issued','skipped','errored','reprinted')),
  skip_reason TEXT,
  error_message TEXT,
  issued_at TEXT,
  issued_by INTEGER,
  reprint_count INTEGER NOT NULL,
  last_reprinted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS learner_fee_adjustments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  fee_item_id INTEGER,
  term_id INTEGER,
  academic_year_id INTEGER,
  adjustment_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  tag TEXT,
  reason TEXT,
  status TEXT NOT NULL,
  effective_from TEXT,
  effective_to TEXT,
  approved_by INTEGER,
  approved_at TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  rejection_reason TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  tx_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reference TEXT,
  description TEXT,
  student_id INTEGER,
  staff_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ledger_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT CHECK (account_type IS NULL OR account_type IN ('asset','liability','income','expense','equity')),
  account_subtype TEXT,
  parent_id INTEGER,
  balance_type TEXT CHECK (balance_type IS NULL OR balance_type IN ('debit','credit')),
  opening_balance NUMERIC,
  current_balance NUMERIC,
  currency TEXT,
  is_active INTEGER,
  is_system INTEGER,
  description TEXT,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  transaction_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  entry_date TEXT,
  description TEXT,
  debit_amount NUMERIC,
  credit_amount NUMERIC,
  balance_after NUMERIC,
  currency TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  transaction_no TEXT NOT NULL,
  transaction_date TEXT,
  transaction_type TEXT CHECK (transaction_type IS NULL OR transaction_type IN ('journal','payment','receipt','adjustment','transfer')),
  description TEXT,
  reference_no TEXT,
  reference_type TEXT,
  reference_id INTEGER,
  total_amount NUMERIC,
  status TEXT CHECK (status IS NULL OR status IN ('draft','posted','voided')),
  posted_by INTEGER,
  posted_at TEXT,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS lesson_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  occurrence_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  student_id INTEGER,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  first_punch_at TEXT,
  last_punch_at TEXT,
  punch_count INTEGER NOT NULL,
  minutes_late INTEGER NOT NULL,
  device_sn TEXT,
  exception TEXT,
  reason TEXT,
  corrected_by INTEGER,
  corrected_at TEXT,
  computed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_attendance_settings (
  school_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  checkin_before_minutes INTEGER NOT NULL,
  grace_minutes INTEGER NOT NULL,
  late_until_minutes INTEGER NOT NULL,
  min_presence_minutes INTEGER NOT NULL,
  absent_finalize_delay_minutes INTEGER NOT NULL,
  unmapped_device_scope TEXT NOT NULL,
  auto_roster INTEGER NOT NULL,
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS lesson_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  timetable_entry_id INTEGER NOT NULL,
  lesson_date TEXT NOT NULL,
  class_id INTEGER NOT NULL,
  stream_id INTEGER,
  subject_id INTEGER NOT NULL,
  teacher_id INTEGER,
  room TEXT,
  period_name TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  term_id INTEGER,
  academic_year_id INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS living_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS manual_attendance_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  daily_attendance_id INTEGER NOT NULL,
  person_type TEXT NOT NULL CHECK (person_type IS NULL OR person_type IN ('student','teacher')),
  person_id INTEGER NOT NULL,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('present','late','absent','excused','on_leave')),
  arrival_time TEXT,
  departure_time TEXT,
  reason TEXT,
  notes TEXT,
  override_type TEXT CHECK (override_type IS NULL OR override_type IN ('status_change','new_entry','excuse_update','time_correction')),
  previous_status TEXT,
  previous_arrival_time TEXT,
  previous_departure_time TEXT,
  created_by_user_id INTEGER,
  created_at TEXT,
  deleted_by_user_id INTEGER,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS marks_migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  school_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  source_subject_id INTEGER NOT NULL,
  destination_subject_id INTEGER NOT NULL,
  academic_year_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  records_migrated INTEGER NOT NULL,
  conflicts_resolved INTEGER NOT NULL,
  skipped INTEGER NOT NULL,
  conflict_resolution TEXT NOT NULL,
  performed_by INTEGER NOT NULL,
  reason TEXT,
  migration_data TEXT,
  created_at TEXT,
  rolled_back_at TEXT,
  rolled_back_by INTEGER
);

CREATE TABLE IF NOT EXISTS marks_migration_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  source_subject_id INTEGER NOT NULL,
  destination_subject_id INTEGER NOT NULL,
  is_permitted INTEGER,
  requires_approval INTEGER,
  approver_role TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS migration_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mobile_money_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  student_id INTEGER,
  transaction_type TEXT CHECK (transaction_type IS NULL OR transaction_type IN ('deposit','withdrawal','payment','refund')),
  provider TEXT CHECK (provider IS NULL OR provider IN ('mpesa','airtel','tigo','vodacom','other')),
  phone_number TEXT,
  amount NUMERIC,
  currency TEXT,
  transaction_ref TEXT,
  conversation_id TEXT,
  original_transaction_id TEXT,
  transaction_date TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('pending','processing','completed','failed','cancelled')),
  result_code TEXT,
  result_desc TEXT,
  balance NUMERIC,
  receipt_url TEXT,
  metadata TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS name_repair_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  admission_no TEXT,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  applied_at TEXT,
  reverted_at TEXT
);

CREATE TABLE IF NOT EXISTS name_repair_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  actor_user_id INTEGER,
  filename TEXT,
  total_rows INTEGER NOT NULL,
  matched_rows INTEGER NOT NULL,
  applied_rows INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('previewed','applied','rolled_back')),
  applied_at TEXT,
  rolled_back_at TEXT,
  rolled_back_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS nationalities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outbox_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_message_id TEXT,
  cost TEXT,
  success INTEGER NOT NULL,
  error TEXT,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  subject_person_id INTEGER,
  recipient_phone TEXT,
  recipient_email TEXT,
  recipient_name TEXT,
  channel TEXT NOT NULL CHECK (channel IS NULL OR channel IN ('sms','email','push')),
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('queued','sending','delivered','failed','expired')),
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  last_error TEXT,
  dedup_key TEXT,
  scheduled_at TEXT,
  attempted_at TEXT,
  delivered_at TEXT,
  created_at TEXT,
  notification_type TEXT,
  attendance_date TEXT,
  subject_student_id INTEGER,
  decision_id INTEGER,
  delivery_confirmed_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  target_role TEXT NOT NULL CHECK (target_role IS NULL OR target_role IN ('guardian','self','staff_room','admin')),
  channel TEXT NOT NULL CHECK (channel IS NULL OR channel IN ('sms','email','push')),
  conditions TEXT,
  template_body TEXT,
  is_active INTEGER NOT NULL,
  daily_cap INTEGER NOT NULL,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  school_id INTEGER,
  channel TEXT NOT NULL,
  enabled INTEGER,
  do_not_disturb INTEGER,
  dnd_until TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL,
  recipient_user_id INTEGER,
  channel TEXT,
  attempts INTEGER,
  max_attempts INTEGER,
  last_attempt_at TEXT,
  next_attempt_at TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('pending','sent','failed','cancelled')),
  payload TEXT,
  error_message TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  code TEXT NOT NULL,
  title_template TEXT,
  message_template TEXT,
  default_channel TEXT,
  priority TEXT CHECK (priority IS NULL OR priority IN ('low','normal','high','critical')),
  is_system INTEGER,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  actor_user_id INTEGER,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  title TEXT,
  message TEXT,
  metadata TEXT,
  priority TEXT CHECK (priority IS NULL OR priority IN ('low','normal','high','critical')),
  channel TEXT,
  created_at TEXT,
  read_count INTEGER,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS orphan_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  label TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parent_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  full_name TEXT,
  email TEXT,
  password_hash TEXT,
  phone_verified INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('active','suspended')),
  failed_logins INTEGER NOT NULL,
  locked_until TEXT,
  last_login_at TEXT,
  last_login_ip TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parent_otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IS NULL OR purpose IN ('verify','reset','link')),
  attempts INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parent_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_account_id INTEGER NOT NULL,
  session_token TEXT NOT NULL,
  active_school_id INTEGER,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_activity_at TEXT,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parent_student_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_account_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  relationship TEXT,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('pending','active','revoked')),
  verified_via TEXT,
  requested_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by INTEGER,
  revoked_at TEXT,
  revoked_by INTEGER,
  access_uuid TEXT
);

CREATE TABLE IF NOT EXISTS parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parishes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subcounty_id INTEGER NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS passout_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  passout_id INTEGER,
  student_id INTEGER,
  attendance_raw_event_id INTEGER,
  device_sn TEXT,
  event_type TEXT NOT NULL,
  decision TEXT,
  reason TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  ip TEXT,
  verify_method TEXT
);

CREATE TABLE IF NOT EXISTS passout_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  requested_by INTEGER,
  approved_by INTEGER,
  status TEXT NOT NULL,
  reason TEXT,
  destination TEXT,
  guardian_contact_id INTEGER,
  guardian_phone_snapshot TEXT,
  approved_from TEXT,
  approved_until TEXT,
  expected_return_at TEXT,
  actual_exit_at TEXT,
  actual_return_at TEXT,
  exit_device_sn TEXT,
  return_device_sn TEXT,
  exit_verified_by_event_id INTEGER,
  return_verified_by_event_id INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  passout_no TEXT,
  is_emergency INTEGER NOT NULL,
  is_medical INTEGER NOT NULL,
  accompanied_by TEXT,
  transport_method TEXT,
  verify_method TEXT,
  returned_late INTEGER NOT NULL,
  first_approved_by INTEGER,
  first_approved_at TEXT,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_reconciliations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  payment_id INTEGER NOT NULL,
  reconciled_by INTEGER,
  reconciled_at TEXT,
  status TEXT,
  notes TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS payroll_definitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS pending_device_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  device_sn TEXT NOT NULL,
  device_user_pin TEXT NOT NULL,
  device_name TEXT,
  device_card TEXT,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('pending','ambiguous','mapped','ignored','quarantined')),
  reason TEXT,
  candidates_json TEXT,
  resolved_by INTEGER,
  resolved_at TEXT,
  resolved_enrollment_id INTEGER,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  acknowledged_at TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_api_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id TEXT NOT NULL,
  key_id TEXT,
  consumer TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  ip TEXT,
  user_agent TEXT,
  idempotency_key TEXT,
  payload_bytes INTEGER,
  response_ms INTEGER,
  error_code TEXT,
  school_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_id TEXT NOT NULL,
  secret_hash TEXT NOT NULL,
  consumer TEXT NOT NULL,
  label TEXT,
  scopes TEXT NOT NULL,
  allowed_ips TEXT,
  rate_limit_per_min INTEGER NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  revoked_by INTEGER,
  last_used_at TEXT,
  last_used_ip TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  school_id INTEGER,
  payload TEXT NOT NULL,
  emitted_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_health_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  snapshot_date TEXT NOT NULL,
  score INTEGER NOT NULL,
  worst TEXT,
  issue_count INTEGER NOT NULL,
  issues TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_idempotency_keys (
  key_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (key_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS platform_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  plan_code TEXT,
  period_start TEXT,
  period_end TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  due_date TEXT,
  voided INTEGER NOT NULL,
  paid_at TEXT,
  note TEXT,
  created_by INTEGER,
  created_at TEXT,
  installation_amount NUMERIC NOT NULL,
  subscription_amount NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL,
  run_after TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  lock_token TEXT,
  locked_at TEXT,
  last_error TEXT,
  dedup_key TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS platform_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  method TEXT,
  reference TEXT,
  note TEXT,
  recorded_by INTEGER,
  received_at TEXT,
  created_at TEXT,
  provider_ref TEXT
);

CREATE TABLE IF NOT EXISTS platform_rate_limits (
  bucket_key TEXT NOT NULL,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (bucket_key)
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key_name TEXT NOT NULL,
  value_text TEXT,
  updated_at TEXT,
  PRIMARY KEY (key_name)
);

CREATE TABLE IF NOT EXISTS pocket_money_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  custodian TEXT,
  low_balance_threshold NUMERIC NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pocket_money_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  custodian TEXT,
  reason TEXT,
  depositor_name TEXT,
  approved_by INTEGER,
  received_by INTEGER,
  slip_no TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IS NULL OR category IN ('academic','admin','finance','support','spiritual')),
  is_teaching INTEGER NOT NULL,
  default_role_id INTEGER,
  is_active INTEGER NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS programs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  display_name TEXT,
  code TEXT,
  curriculum_body TEXT,
  eligibility TEXT NOT NULL,
  is_default INTEGER NOT NULL,
  name_ar TEXT
);

CREATE TABLE IF NOT EXISTS promotion_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  promotion_id INTEGER,
  student_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IS NULL OR action_type IN ('promoted','demoted','dropped','status_changed','criteria_applied','cancelled')),
  from_class_id INTEGER,
  to_class_id INTEGER,
  from_academic_year_id INTEGER,
  to_academic_year_id INTEGER,
  status_before TEXT,
  status_after TEXT,
  criteria_applied TEXT,
  performed_by INTEGER NOT NULL,
  reason TEXT,
  ip_address TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS promotion_criteria (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  criteria_type TEXT CHECK (criteria_type IS NULL OR criteria_type IN ('marks','average','attendance','conduct','custom')),
  condition_json TEXT NOT NULL,
  is_active INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  from_class_id INTEGER,
  to_class_id INTEGER NOT NULL,
  from_academic_year_id INTEGER,
  to_academic_year_id INTEGER,
  promotion_status TEXT CHECK (promotion_status IS NULL OR promotion_status IN ('promoted','not_promoted','pending','deferred')),
  criteria_used TEXT,
  remarks TEXT,
  promoted_by INTEGER,
  approval_status TEXT CHECK (approval_status IS NULL OR approval_status IN ('pending','approved','rejected')),
  approved_by INTEGER,
  term_used TEXT,
  promotion_reason TEXT CHECK (promotion_reason IS NULL OR promotion_reason IN ('criteria_based','manual','appeal','correction')),
  prerequisite_met INTEGER,
  additional_notes TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  student_id INTEGER,
  payment_id INTEGER,
  receipt_no TEXT NOT NULL,
  invoice_no TEXT,
  amount NUMERIC NOT NULL,
  payment_method TEXT,
  reference TEXT,
  payer_name TEXT,
  payer_contact TEXT,
  notes TEXT,
  file_url TEXT,
  qr_code_data TEXT,
  invoice_url TEXT,
  metadata TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS relay_agents (
  device_sn TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  status TEXT CHECK (status IS NULL OR status IN ('online','offline')),
  agent_version TEXT,
  device_ip TEXT,
  created_at TEXT,
  PRIMARY KEY (device_sn)
);

CREATE TABLE IF NOT EXISTS relay_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_sn TEXT NOT NULL,
  action TEXT NOT NULL,
  params TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('pending','sent','completed','failed')),
  result TEXT,
  error_message TEXT,
  created_at TEXT,
  sent_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  target_role TEXT,
  due_date TEXT NOT NULL,
  is_recurring INTEGER,
  created_by INTEGER,
  status TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS report_card_metrics (
  report_card_id INTEGER NOT NULL,
  total_score NUMERIC,
  average_score NUMERIC,
  min_score NUMERIC,
  max_score NUMERIC,
  position INTEGER,
  promoted INTEGER,
  promotion_class_id INTEGER,
  computed_at TEXT
);

CREATE TABLE IF NOT EXISTS report_card_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL,
  student_db_id INTEGER,
  override_kind TEXT NOT NULL CHECK (override_kind IS NULL OR override_kind IN ('hide_section','hide_row','hide_subject','style_patch','text_replace','spacing_patch')),
  target_id TEXT,
  payload_json TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_card_subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_card_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  total_score NUMERIC,
  grade TEXT,
  remarks TEXT,
  position INTEGER
);

CREATE TABLE IF NOT EXISTS report_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  overall_grade TEXT,
  class_teacher_comment TEXT,
  headteacher_comment TEXT,
  dos_comment TEXT
);

CREATE TABLE IF NOT EXISTS report_comment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  subject_id INTEGER,
  class_id INTEGER,
  program_id INTEGER,
  grade_code TEXT,
  min_score NUMERIC,
  max_score NUMERIC,
  competency_level TEXT,
  comment_text TEXT NOT NULL,
  language TEXT NOT NULL,
  priority INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_overall_comment_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  role TEXT NOT NULL,
  template_id INTEGER,
  custom_key TEXT,
  mode TEXT NOT NULL,
  condition_json TEXT,
  comment_text TEXT NOT NULL,
  comment_text_ar TEXT,
  priority INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS report_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  layout_json TEXT NOT NULL,
  is_default INTEGER NOT NULL,
  school_id INTEGER,
  template_key TEXT,
  created_at TEXT,
  updated_at TEXT,
  is_archived INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS requirements_master (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS result_submission_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  result_type_id INTEGER,
  term_id INTEGER,
  class_id INTEGER,
  deadline_date TEXT NOT NULL,
  description TEXT,
  status TEXT,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS result_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  weight NUMERIC,
  deadline TEXT,
  status TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER,
  name_ar TEXT
);

CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  score NUMERIC,
  grade TEXT,
  remarks TEXT,
  school_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS results_submission_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('success','failed')),
  class_id INTEGER,
  subject_id INTEGER,
  result_type_id INTEGER,
  term_id INTEGER,
  inserted_count INTEGER NOT NULL,
  ignored_count INTEGER NOT NULL,
  error_count INTEGER NOT NULL,
  error_message TEXT,
  submitted_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS salary_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  staff_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  amount NUMERIC NOT NULL,
  method TEXT,
  reference TEXT,
  ledger_id INTEGER,
  paid_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT,
  applied_by TEXT,
  environment TEXT,
  execution_time_ms INTEGER,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('success','failed')),
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS school_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  school_name TEXT NOT NULL,
  school_motto TEXT,
  school_address TEXT,
  school_contact TEXT,
  school_email TEXT,
  school_logo TEXT,
  registration_number TEXT,
  website TEXT,
  founded_year INTEGER,
  principal_name TEXT,
  principal_email TEXT,
  principal_phone TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS school_modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  module_code TEXT NOT NULL CHECK (module_code IS NULL OR module_code IN ('academics','finance','payroll','tahfiz','attendance','inventory','examinations','analytics','fingerprint_auth','intelligence','work_plans')),
  is_enabled INTEGER NOT NULL,
  enabled_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS school_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  key_name TEXT NOT NULL,
  value_text TEXT
);

CREATE TABLE IF NOT EXISTS school_sms_routes (
  school_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  central_provider_id INTEGER,
  source_school_id INTEGER,
  note TEXT,
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS school_theme_settings (
  school_id INTEGER NOT NULL,
  primary_color TEXT,
  secondary_color TEXT,
  accent_color TEXT,
  logo_url TEXT,
  glass_enabled INTEGER NOT NULL,
  border_radius TEXT NOT NULL,
  button_style TEXT NOT NULL,
  card_style TEXT NOT NULL,
  sidebar_style TEXT NOT NULL,
  report_branding TEXT NOT NULL,
  receipt_branding TEXT NOT NULL,
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS security_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  data_type TEXT CHECK (data_type IS NULL OR data_type IN ('string','integer','boolean','json')),
  description TEXT,
  is_editable INTEGER,
  updated_by INTEGER,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS sentinel_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER,
  channel TEXT NOT NULL,
  destination TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('sent','failed','retrying')),
  provider_message_id TEXT,
  error TEXT,
  attempts INTEGER NOT NULL,
  attempted_at TEXT,
  delivered_at TEXT
);

CREATE TABLE IF NOT EXISTS sentinel_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  triggered_by INTEGER,
  trigger_source TEXT NOT NULL,
  overall_score INTEGER,
  readiness TEXT,
  commit_sha TEXT,
  sentinel_version TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  report TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS sentinel_heartbeats (
  name TEXT NOT NULL,
  last_started_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_error TEXT,
  consecutive_failures INTEGER NOT NULL,
  expected_interval_seconds INTEGER,
  updated_at TEXT,
  PRIMARY KEY (name)
);

CREATE TABLE IF NOT EXISTS sentinel_incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dedup_key TEXT NOT NULL,
  kind TEXT NOT NULL,
  observer TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IS NULL OR scope IN ('global','school')),
  school_id INTEGER,
  module TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IS NULL OR severity IN ('info','low','medium','high','critical')),
  confidence INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('open','acknowledged','resolved','suppressed')),
  first_detected_at TEXT,
  last_detected_at TEXT,
  occurrence_count INTEGER NOT NULL,
  probable_cause TEXT,
  user_impact TEXT,
  technical_impact TEXT,
  evidence TEXT,
  recommended_action TEXT,
  auto_remediation_safe INTEGER NOT NULL,
  notify_required INTEGER NOT NULL,
  notified_at TEXT,
  acknowledged_by INTEGER,
  acknowledged_at TEXT,
  resolved_by INTEGER,
  resolved_at TEXT,
  suppressed_reason TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS sentinel_observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  module TEXT NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  error_class TEXT,
  signal TEXT,
  correlation_id TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  setting_type TEXT,
  category TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS shift_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  shift_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER,
  effective_from TEXT,
  effective_to TEXT,
  status TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  applies_to TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  arrival_window_minutes INTEGER NOT NULL,
  late_threshold_minutes INTEGER NOT NULL,
  early_leave_threshold_minutes INTEGER NOT NULL,
  overtime_after_minutes INTEGER,
  weekday_mask INTEGER NOT NULL,
  crosses_midnight INTEGER NOT NULL,
  effective_from TEXT,
  effective_to TEXT,
  status TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_allocations (
  school_id INTEGER NOT NULL,
  quota_sms INTEGER NOT NULL,
  note TEXT,
  updated_by INTEGER,
  updated_at TEXT,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS sms_provider_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  encrypted_config TEXT NOT NULL,
  config_fingerprint TEXT,
  status TEXT NOT NULL,
  status_message TEXT,
  balance_amount NUMERIC,
  balance_currency TEXT,
  balance_units INTEGER,
  balance_checked_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  last_provider_message_id TEXT,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_provider_operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER,
  provider_type TEXT NOT NULL,
  operation TEXT NOT NULL,
  success INTEGER NOT NULL,
  http_status INTEGER,
  provider_message_id TEXT,
  recipient_phone TEXT,
  error_message TEXT,
  metadata_json TEXT,
  control_user_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sms_school_prices (
  school_id INTEGER NOT NULL,
  price_ugx NUMERIC,
  topup_enabled INTEGER NOT NULL,
  note TEXT,
  updated_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (school_id)
);

CREATE TABLE IF NOT EXISTS sms_topups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL,
  school_id INTEGER NOT NULL,
  user_id INTEGER,
  amount_ugx INTEGER NOT NULL,
  price_ugx NUMERIC NOT NULL,
  sms_units INTEGER NOT NULL,
  phone_masked TEXT,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_uuid TEXT,
  provider_status TEXT,
  provider_network TEXT,
  failure_reason TEXT,
  is_sandbox INTEGER NOT NULL,
  paid_at TEXT,
  credited_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  notify_phone TEXT,
  confirm_sent_at TEXT,
  confirm_attempts INTEGER NOT NULL,
  confirm_claimed_at TEXT,
  confirm_error TEXT
);

CREATE TABLE IF NOT EXISTS sms_usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  ref TEXT,
  segments INTEGER NOT NULL,
  success INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS staff_employment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IS NULL OR event_type IN ('hired','reactivated','suspended','on_leave','returned_from_leave','transferred','promoted','demoted','terminated')),
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('active','on_leave','suspended','terminated')),
  contract_type TEXT CHECK (contract_type IS NULL OR contract_type IN ('permanent','fixed_term','contract','volunteer','part_time')),
  effective_date TEXT NOT NULL,
  end_date TEXT,
  salary_grade TEXT,
  position_id INTEGER,
  department_id INTEGER,
  reason TEXT,
  notes TEXT,
  recorded_by INTEGER NOT NULL,
  event_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_qualifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  degree_type TEXT NOT NULL,
  institution TEXT NOT NULL,
  field_of_study TEXT,
  year_obtained INTEGER,
  document_url TEXT,
  notes TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_salaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  staff_id INTEGER NOT NULL,
  month INTEGER,
  period_month INTEGER,
  definition_id INTEGER NOT NULL,
  amount NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_subject_specializations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  certified INTEGER NOT NULL,
  notes TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS streams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER,
  name_ar TEXT
);

CREATE TABLE IF NOT EXISTS student_additional_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  orphan_status TEXT,
  previous_school TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  student_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT,
  method TEXT,
  time_in TEXT,
  time_out TEXT,
  notes TEXT,
  marked_at TEXT,
  marked_by INTEGER,
  attendance_session_id INTEGER,
  term_id INTEGER,
  academic_year_id INTEGER,
  stream_id INTEGER,
  subject_id INTEGER,
  teacher_id INTEGER,
  device_id INTEGER,
  biometric_timestamp TEXT,
  confidence_score NUMERIC,
  override_reason TEXT,
  is_locked INTEGER,
  locked_at TEXT
);

CREATE TABLE IF NOT EXISTS student_component_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  framework_id INTEGER NOT NULL,
  component_id INTEGER NOT NULL,
  score NUMERIC,
  value_text TEXT,
  grade_code TEXT,
  remarks TEXT,
  entered_at TEXT NOT NULL,
  entered_by INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_contacts (
  student_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  relationship TEXT,
  is_primary INTEGER
);

CREATE TABLE IF NOT EXISTS student_curriculums (
  student_id INTEGER NOT NULL,
  curriculum_id INTEGER,
  active INTEGER,
  assigned_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_custom_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  field_id INTEGER NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_date TEXT,
  value_bool INTEGER,
  value_json TEXT,
  updated_at TEXT NOT NULL,
  updated_by INTEGER
);

CREATE TABLE IF NOT EXISTS student_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_education_levels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  education_type TEXT NOT NULL,
  level_name TEXT NOT NULL,
  institution TEXT,
  year_completed INTEGER
);

CREATE TABLE IF NOT EXISTS student_family_status (
  student_id INTEGER NOT NULL,
  orphan_status_id INTEGER,
  primary_guardian_name TEXT,
  primary_guardian_contact TEXT,
  primary_guardian_occupation TEXT,
  father_name TEXT,
  father_living_status_id INTEGER,
  father_occupation TEXT,
  father_contact TEXT,
  notes TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS student_fee_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  section_id INTEGER,
  academic_year TEXT,
  fee_structure_id INTEGER,
  fee_type TEXT,
  due_date TEXT,
  late_fee NUMERIC,
  status TEXT CHECK (status IS NULL OR status IN ('pending','partial','paid','overdue','waived')),
  waived_by INTEGER,
  waived_reason TEXT,
  approved_by INTEGER,
  approved_at TEXT,
  last_payment_date TEXT,
  created_at TEXT,
  updated_at TEXT,
  term_id INTEGER NOT NULL,
  item TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  discount NUMERIC,
  paid NUMERIC,
  balance NUMERIC GENERATED ALWAYS AS ((amount - discount) - paid),
  waived NUMERIC,
  fee_item_id INTEGER
);

CREATE TABLE IF NOT EXISTS student_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  device_id INTEGER,
  finger_position TEXT CHECK (finger_position IS NULL OR finger_position IN ('thumb','index','middle','ring','pinky','unknown')),
  hand TEXT CHECK (hand IS NULL OR hand IN ('left','right')),
  template_data BLOB,
  template_format TEXT,
  biometric_uuid TEXT,
  quality_score INTEGER,
  enrollment_timestamp TEXT,
  is_active INTEGER,
  status TEXT CHECK (status IS NULL OR status IN ('active','inactive','revoked')),
  last_matched_at TEXT,
  match_count INTEGER,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS student_generic_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  skill_code TEXT NOT NULL,
  skill_label TEXT NOT NULL,
  scoring_model_id INTEGER,
  score NUMERIC,
  value_text TEXT,
  grade_code TEXT,
  remarks TEXT,
  entered_at TEXT NOT NULL,
  entered_by INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_hafz_progress_summary (
  student_id INTEGER NOT NULL,
  juz_memorized INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  academic_year_id INTEGER,
  term_id INTEGER,
  class_id INTEGER,
  stream_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  performed_by INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS student_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IS NULL OR type IN ('debit','credit')),
  amount NUMERIC NOT NULL,
  reference TEXT NOT NULL,
  fee_item_id INTEGER,
  payment_id INTEGER,
  term_id INTEGER,
  created_by INTEGER,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_next_of_kin (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  occupation TEXT,
  contact TEXT
);

CREATE TABLE IF NOT EXISTS student_parents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  parent_id INTEGER NOT NULL,
  relationship TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_profiles (
  student_id INTEGER NOT NULL,
  place_of_birth TEXT,
  place_of_residence TEXT,
  district_id INTEGER,
  nationality_id INTEGER,
  passport_document_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS student_projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  descriptor TEXT,
  outcome TEXT,
  evidence_url TEXT,
  scoring_model_id INTEGER,
  grade_code TEXT,
  remarks TEXT,
  entered_at TEXT NOT NULL,
  entered_by INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS student_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  requirement_id INTEGER NOT NULL,
  brought INTEGER,
  date_reported TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS study_modes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL,
  is_active INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subcounties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  county_id INTEGER NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_report_order (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  class_id INTEGER,
  result_type_id INTEGER,
  priority INTEGER NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS subject_weekly_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  subject_id INTEGER NOT NULL,
  periods_per_week INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  tier INTEGER NOT NULL,
  limits TEXT,
  features TEXT,
  is_active INTEGER NOT NULL,
  created_at TEXT,
  updated_at TEXT,
  price NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  installments INTEGER NOT NULL,
  deliverables TEXT,
  installation_fee NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS system_errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  user_id INTEGER,
  endpoint TEXT,
  method TEXT,
  error_code TEXT,
  error_msg TEXT,
  error_message TEXT,
  stack_trace TEXT,
  request_id TEXT,
  ip_address TEXT,
  metadata TEXT,
  resolved INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS system_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_sn TEXT,
  event_type TEXT NOT NULL CHECK (event_type IS NULL OR event_type IN ('HEARTBEAT','PUNCH','COMMAND_SENT','COMMAND_ACK','USERINFO','ERROR','SYSTEM')),
  direction TEXT NOT NULL CHECK (direction IS NULL OR direction IN ('INCOMING','OUTGOING')),
  raw_data TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  status TEXT CHECK (status IS NULL OR status IN ('present','absent','late','excused')),
  remarks TEXT,
  recorded_by INTEGER,
  recorded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  total_units INTEGER,
  unit_type TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_custom_book_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  custom_book_id INTEGER NOT NULL,
  order_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  parent_unit_id INTEGER,
  page_from INTEGER,
  page_to INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_custom_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  structure_type TEXT NOT NULL CHECK (structure_type IS NULL OR structure_type IN ('ordered_lessons','versed_poem','chaptered_text')),
  unit_label TEXT,
  total_units INTEGER,
  teaching_order INTEGER,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('active','archived')),
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  track TEXT NOT NULL CHECK (track IS NULL OR track IN ('academic_plus_tahfiz','tahfiz_only')),
  program TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('active','suspended','withdrawn','completed')),
  joined_date TEXT,
  left_date TEXT,
  notes TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  group_id INTEGER,
  teacher_id INTEGER,
  retention_score NUMERIC,
  tajweed_score NUMERIC,
  voice_score NUMERIC,
  discipline_score NUMERIC,
  overall_score NUMERIC,
  notes TEXT,
  evaluated_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_global_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  title_ar TEXT,
  title_en TEXT NOT NULL,
  structure_type TEXT NOT NULL CHECK (structure_type IS NULL OR structure_type IN ('quran','ordered_lessons','versed_poem','chaptered_text')),
  total_units INTEGER,
  unit_label TEXT,
  is_active INTEGER NOT NULL,
  source_note TEXT,
  version TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  joined_date TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  joined_at TEXT,
  role TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  teacher_id INTEGER NOT NULL,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  book_id INTEGER,
  teacher_id INTEGER NOT NULL,
  class_id INTEGER,
  stream_id INTEGER,
  group_id INTEGER,
  assigned_date TEXT NOT NULL,
  portion_text TEXT NOT NULL,
  portion_unit TEXT,
  expected_length INTEGER,
  type TEXT NOT NULL,
  notes TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_portions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  teacher_id INTEGER,
  book_id INTEGER,
  portion_text TEXT NOT NULL,
  portion_unit TEXT,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  rating TEXT,
  score NUMERIC,
  notes TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  portion_name TEXT,
  surah_name TEXT,
  ayah_from INTEGER,
  ayah_to INTEGER,
  juz_number INTEGER,
  page_from INTEGER,
  page_to INTEGER,
  difficulty_level TEXT,
  estimated_days INTEGER,
  assigned_at TEXT,
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_hizb (
  hizb_number INTEGER NOT NULL,
  juz_number INTEGER NOT NULL,
  start_surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  start_page INTEGER,
  PRIMARY KEY (hizb_number)
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_juz (
  juz_number INTEGER NOT NULL,
  start_surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  start_page INTEGER,
  PRIMARY KEY (juz_number)
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_pages (
  page_number INTEGER NOT NULL,
  start_surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  PRIMARY KEY (page_number)
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_quarters (
  quarter_number INTEGER NOT NULL,
  hizb_number INTEGER NOT NULL,
  juz_number INTEGER NOT NULL,
  start_surah INTEGER NOT NULL,
  start_ayah INTEGER NOT NULL,
  start_page INTEGER,
  PRIMARY KEY (quarter_number)
);

CREATE TABLE IF NOT EXISTS tahfiz_quran_surahs (
  number INTEGER NOT NULL,
  name_ar TEXT NOT NULL,
  name_translit TEXT NOT NULL,
  name_en TEXT,
  ayah_count INTEGER NOT NULL,
  revelation_type TEXT NOT NULL CHECK (revelation_type IS NULL OR revelation_type IN ('Meccan','Medinan')),
  juz_start INTEGER,
  start_page INTEGER,
  end_page INTEGER,
  PRIMARY KEY (number)
);

CREATE TABLE IF NOT EXISTS tahfiz_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  plan_id INTEGER,
  portion_id INTEGER,
  group_id INTEGER,
  book_id INTEGER,
  teacher_id INTEGER,
  date TEXT NOT NULL,
  type TEXT NOT NULL,
  portion_text TEXT,
  rating TEXT,
  score NUMERIC,
  notes TEXT,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  presented INTEGER,
  presented_length INTEGER,
  retention_score NUMERIC,
  mark NUMERIC,
  recorded_by INTEGER,
  recorded_at TEXT
);

CREATE TABLE IF NOT EXISTS tahfiz_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  group_id INTEGER,
  term_id INTEGER,
  academic_year_id INTEGER,
  portion_id INTEGER,
  result_date TEXT,
  pages_memorized INTEGER,
  pages_reviewed INTEGER,
  juz_completed INTEGER,
  memorization_percentage NUMERIC,
  accuracy_score NUMERIC,
  overall_score NUMERIC,
  remarks TEXT,
  recorded_by INTEGER,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS tahfiz_school_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  global_book_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  local_name_override TEXT,
  teaching_order INTEGER,
  default_for_program TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tahfiz_seven_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  result_id INTEGER NOT NULL,
  fluency_score NUMERIC,
  accuracy_score NUMERIC,
  tajweed_score NUMERIC,
  consistency_score NUMERIC,
  participation_score NUMERIC,
  attitude_score NUMERIC,
  improvement_score NUMERIC,
  overall_score NUMERIC,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS template_distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IS NULL OR status IN ('queued','loading','loaded','failed','removed')),
  queued_at TEXT,
  attempted_at TEXT,
  loaded_at TEXT,
  attempts INTEGER NOT NULL,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS timetable_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  day_of_week INTEGER NOT NULL,
  period_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  stream_id INTEGER,
  subject_id INTEGER NOT NULL,
  teacher_id INTEGER,
  room TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS timetable_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  period_order INTEGER NOT NULL,
  is_break INTEGER,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS user_notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notification_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  school_id INTEGER,
  is_read INTEGER,
  is_archived INTEGER,
  channel TEXT,
  created_at TEXT,
  read_at TEXT,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS user_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  session_token TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS villages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parish_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS visitation_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  card_uid TEXT NOT NULL,
  card_type TEXT NOT NULL,
  guardian_contact_id INTEGER,
  student_id INTEGER,
  status TEXT NOT NULL,
  issued_by INTEGER,
  issued_at TEXT,
  expires_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS visitation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  card_id INTEGER,
  card_uid TEXT,
  guardian_contact_id INTEGER,
  student_id INTEGER,
  device_sn TEXT,
  event_type TEXT NOT NULL,
  decision TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS waivers_discounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER,
  student_id INTEGER NOT NULL,
  term_id INTEGER NOT NULL,
  fee_item_id INTEGER,
  waiver_type TEXT CHECK (waiver_type IS NULL OR waiver_type IN ('full','partial')),
  discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('percentage','fixed')),
  amount NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  approved_by INTEGER,
  approved_at TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  currency TEXT,
  balance NUMERIC,
  status TEXT,
  created_at TEXT,
  updated_at TEXT,
  location_type TEXT NOT NULL,
  provider TEXT,
  account_number TEXT,
  bank_name TEXT,
  branch_name TEXT,
  opening_balance NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subscription_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  max_attempts INTEGER NOT NULL,
  status TEXT NOT NULL,
  response_code INTEGER,
  response_ms INTEGER,
  response_body TEXT,
  next_retry_at TEXT,
  delivered_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  consumer TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL,
  event_types TEXT NOT NULL,
  is_active INTEGER NOT NULL,
  last_delivery_at TEXT,
  last_status TEXT,
  created_by_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workplans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_datetime TEXT,
  end_datetime TEXT,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  progress INTEGER NOT NULL,
  assigned_to INTEGER,
  owner_type TEXT NOT NULL,
  owner_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT,
  deleted_by INTEGER,
  delete_reason TEXT,
  restored_at TEXT,
  restored_by INTEGER
);

CREATE TABLE IF NOT EXISTS zk_attendance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  device_user_id TEXT NOT NULL,
  student_id INTEGER,
  staff_id INTEGER,
  check_time TEXT NOT NULL,
  verify_type INTEGER,
  io_mode INTEGER,
  log_id TEXT,
  work_code TEXT,
  processed INTEGER,
  matched INTEGER,
  raw_log_id INTEGER,
  created_at TEXT,
  device_reported_time TEXT,
  clock_skew_seconds INTEGER,
  time_source TEXT NOT NULL,
  time_confidence TEXT
);

CREATE TABLE IF NOT EXISTS zk_device_commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_sn TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT CHECK (status IS NULL OR status IN ('pending','sent','acknowledged','failed','expired')),
  priority INTEGER,
  sent_at TEXT,
  ack_at TEXT,
  retry_count INTEGER,
  max_retries INTEGER,
  error_message TEXT,
  created_by INTEGER,
  created_at TEXT,
  updated_at TEXT,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS zk_device_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_sn TEXT,
  ip_address TEXT,
  event_type TEXT NOT NULL,
  table_name TEXT,
  raw_payload TEXT,
  parsed_json TEXT,
  record_count INTEGER NOT NULL,
  user_id TEXT,
  check_time TEXT,
  matched INTEGER NOT NULL,
  student_id INTEGER,
  staff_id INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  school_id INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zk_devices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  serial_number TEXT NOT NULL,
  device_name TEXT,
  model TEXT,
  firmware_version TEXT,
  location TEXT,
  ip_address TEXT,
  status TEXT CHECK (status IS NULL OR status IN ('active','inactive','offline','maintenance')),
  push_version TEXT,
  last_heartbeat TEXT,
  last_activity TEXT,
  options TEXT,
  registered_at TEXT,
  created_at TEXT,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS zk_parsed_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raw_log_id INTEGER,
  device_sn TEXT,
  school_id INTEGER,
  table_name TEXT,
  raw_line TEXT,
  user_id TEXT,
  check_time TEXT,
  verify_type TEXT,
  inout_mode TEXT,
  work_code TEXT,
  log_id TEXT,
  matched INTEGER NOT NULL,
  student_id INTEGER,
  staff_id INTEGER,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS zk_raw_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_sn TEXT NOT NULL,
  http_method TEXT NOT NULL,
  query_string TEXT,
  raw_body TEXT,
  parsed_data TEXT,
  source_ip TEXT,
  user_agent TEXT,
  created_at TEXT,
  headers TEXT,
  endpoint TEXT,
  school_id INTEGER
);

CREATE TABLE IF NOT EXISTS zk_user_mapping (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  school_id INTEGER NOT NULL,
  device_user_id TEXT NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IS NULL OR user_type IN ('student','staff')),
  student_id INTEGER,
  staff_id INTEGER,
  device_sn TEXT,
  card_number TEXT,
  created_at TEXT,
  updated_at TEXT
);

`;

export const SHELL_SCHEMA_INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_academic_programs_idx_school_active ON academic_programs (school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_academic_programs_uq_school_slug ON academic_programs (school_id, slug);
CREATE INDEX IF NOT EXISTS idx_admission_audit_idx_aaud_admission ON admission_audit (admission_id, created_at);
CREATE INDEX IF NOT EXISTS idx_admission_documents_idx_adoc_admission ON admission_documents (admission_id);
CREATE INDEX IF NOT EXISTS idx_admissions_idx_adm_appno ON admissions (application_no);
CREATE INDEX IF NOT EXISTS idx_admissions_idx_adm_school_status ON admissions (school_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_acquisition_records_idx_acquisition ON attendance_acquisition_records (acquisition_id, device_wall_time);
CREATE INDEX IF NOT EXISTS idx_attendance_acquisition_records_idx_pin ON attendance_acquisition_records (acquisition_id, device_user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_acquisitions_idx_device ON attendance_acquisitions (device_sn, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_acquisitions_idx_school_created ON attendance_acquisitions (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_acquisitions_idx_status ON attendance_acquisitions (school_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_idx_change_type ON attendance_audit_logs (change_type);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_idx_entity ON attendance_audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_idx_school_id ON attendance_audit_logs (school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_idx_timestamp ON attendance_audit_logs (timestamp);
CREATE INDEX IF NOT EXISTS idx_attendance_audit_logs_idx_user_id ON attendance_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_attendance_daily_aggregates_idx_school_class_day ON attendance_daily_aggregates (school_id, class_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_daily_aggregates_idx_school_day ON attendance_daily_aggregates (school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_daily_aggregates_uk_bucket ON attendance_daily_aggregates (school_id, class_id, attendance_date, role_type, status);
CREATE INDEX IF NOT EXISTS idx_attendance_first_arrival_anchors_idx_school_anchor ON attendance_first_arrival_anchors (school_id, is_anchor, earliness_rank);
CREATE INDEX IF NOT EXISTS idx_attendance_first_arrival_anchors_uk_school_person ON attendance_first_arrival_anchors (school_id, person_id);
CREATE INDEX IF NOT EXISTS idx_attendance_first_arrival_health_uk_school_day ON attendance_first_arrival_health (school_id, local_date);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_idx_device_id ON attendance_logs (device_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_idx_device_user_scan ON attendance_logs (device_user_id, scan_timestamp);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_idx_processing_status ON attendance_logs (processing_status);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_idx_received_timestamp ON attendance_logs (received_timestamp);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_idx_scan_timestamp ON attendance_logs (scan_timestamp);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_idx_school_scan ON attendance_logs (school_id, scan_timestamp);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_uk_school_duplicate ON attendance_logs (school_id, device_id, device_user_id, scan_timestamp, device_log_id);
CREATE INDEX IF NOT EXISTS idx_attendance_processing_queue_idx_created_at ON attendance_processing_queue (created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_processing_queue_idx_next_retry ON attendance_processing_queue (next_retry_at);
CREATE INDEX IF NOT EXISTS idx_attendance_processing_queue_idx_priority ON attendance_processing_queue (priority);
CREATE INDEX IF NOT EXISTS idx_attendance_processing_queue_idx_school_status ON attendance_processing_queue (school_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_processing_queue_idx_status ON attendance_processing_queue (status);
CREATE INDEX IF NOT EXISTS idx_attendance_reconciliation_fk_reconciliation_school ON attendance_reconciliation (school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_reconciliation_idx_created_at ON attendance_reconciliation (created_at);
CREATE INDEX IF NOT EXISTS idx_attendance_reconciliation_idx_reconciliation_status ON attendance_reconciliation (reconciliation_status);
CREATE INDEX IF NOT EXISTS idx_attendance_reconciliation_idx_session_student ON attendance_reconciliation (attendance_session_id, student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_reconciliation_idx_student ON attendance_reconciliation (student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_reports_idx_generated_at ON attendance_reports (generated_at);
CREATE INDEX IF NOT EXISTS idx_attendance_reports_idx_report_type ON attendance_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_attendance_reports_idx_school ON attendance_reports (school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_rule_day_overrides_uk_rule_day ON attendance_rule_day_overrides (rule_id, weekday);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_fk_attendance_sessions_school ON attendance_sessions (school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_fk_attendance_sessions_stream ON attendance_sessions (stream_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_idx_academic_year ON attendance_sessions (academic_year_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_idx_class_date ON attendance_sessions (class_id, session_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_idx_session_date ON attendance_sessions (session_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_idx_status ON attendance_sessions (status);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_idx_teacher ON attendance_sessions (teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sms_decisions_idx_decision_outbox ON attendance_sms_decisions (outbox_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sms_decisions_idx_decision_school_date ON attendance_sms_decisions (school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_sms_decisions_uk_decision ON attendance_sms_decisions (school_id, person_id, attendance_date, notification_type, decision, reason_code);
CREATE INDEX IF NOT EXISTS idx_attendance_time_baselines_uk_school_device ON attendance_time_baselines (school_id, device_sn);
CREATE INDEX IF NOT EXISTS idx_attendance_time_corrections_idx_school_device ON attendance_time_corrections (school_id, device_sn, local_date);
CREATE INDEX IF NOT EXISTS idx_attendance_users_email ON attendance_users (email);
CREATE INDEX IF NOT EXISTS idx_attendance_users_idx_email ON attendance_users (email);
CREATE INDEX IF NOT EXISTS idx_attendance_users_idx_is_active ON attendance_users (is_active);
CREATE INDEX IF NOT EXISTS idx_attendance_users_idx_role ON attendance_users (role);
CREATE INDEX IF NOT EXISTS idx_attendance_users_idx_school_id ON attendance_users (school_id);
CREATE INDEX IF NOT EXISTS idx_attendance_users_username ON attendance_users (username);
CREATE INDEX IF NOT EXISTS idx_audit_log_idx_audit_log_school_id ON audit_log (school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_idx_action ON audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_idx_created_at ON audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_idx_entity ON audit_logs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_idx_school_id ON audit_logs (school_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_idx_user_id ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_purges_idx_school_time ON audit_purges (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_auth_codes_idx_user_purpose ON auth_codes (user_id, purpose, expires_at);
CREATE INDEX IF NOT EXISTS idx_backup_chunks_idx_backup_seq ON backup_chunks (backup_id, seq);
CREATE INDEX IF NOT EXISTS idx_backup_parts_idx_backup_part ON backup_parts (backup_id, part_number);
CREATE INDEX IF NOT EXISTS idx_backup_records_idx_school ON backup_records (school_id, started_at);
CREATE INDEX IF NOT EXISTS idx_backup_records_uk_backup_uuid ON backup_records (backup_uuid);
CREATE INDEX IF NOT EXISTS idx_balance_reminders_idx_reminders_school ON balance_reminders (school_id);
CREATE INDEX IF NOT EXISTS idx_balance_reminders_idx_reminders_sent ON balance_reminders (sent_at);
CREATE INDEX IF NOT EXISTS idx_balance_reminders_idx_reminders_status ON balance_reminders (status);
CREATE INDEX IF NOT EXISTS idx_balance_reminders_idx_reminders_student ON balance_reminders (student_id);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_device_code ON biometric_devices (device_code);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_idx_school ON biometric_devices (school_id);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_idx_status ON biometric_devices (status);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_idx_sync_status ON biometric_devices (sync_status);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_serial_number ON biometric_devices (serial_number);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_unique_device_code ON biometric_devices (device_code);
CREATE INDEX IF NOT EXISTS idx_biometric_devices_unique_serial ON biometric_devices (serial_number);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_idx_capture ON biometric_enrollments (school_id, capture_status);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_idx_card ON biometric_enrollments (school_id, card_number);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_idx_person ON biometric_enrollments (person_id);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_idx_role ON biometric_enrollments (role_type, role_ref_id);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_idx_school_status ON biometric_enrollments (school_id, status);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_uk_enrollment_uuid ON biometric_enrollments (enrollment_uuid);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_uk_school_pin ON biometric_enrollments (school_id, pin_value);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_legacy_idx_be_school ON biometric_enrollments_legacy (school_id);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_legacy_idx_be_session ON biometric_enrollments_legacy (session_id);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_legacy_idx_be_status ON biometric_enrollments_legacy (status);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_legacy_idx_be_student ON biometric_enrollments_legacy (student_id);
CREATE INDEX IF NOT EXISTS idx_biometric_enrollments_legacy_uq_device_slot ON biometric_enrollments_legacy (device_sn, device_slot);
CREATE INDEX IF NOT EXISTS idx_biometric_face_enrollments_idx_face_school ON biometric_face_enrollments (school_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_biometric_face_enrollments_uk_face_enrollment_device ON biometric_face_enrollments (enrollment_id, device_sn);
CREATE INDEX IF NOT EXISTS idx_biometric_mapping_history_idx_enrollment ON biometric_mapping_history (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_biometric_mapping_history_idx_school_created ON biometric_mapping_history (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_biometric_mapping_history_idx_school_pin ON biometric_mapping_history (school_id, device_sn, pin_value);
CREATE INDEX IF NOT EXISTS idx_biometric_match_suggestions_idx_pin ON biometric_match_suggestions (school_id, device_sn, device_pin);
CREATE INDEX IF NOT EXISTS idx_biometric_match_suggestions_idx_school_device ON biometric_match_suggestions (school_id, device_sn, status);
CREATE INDEX IF NOT EXISTS idx_biometric_templates_idx_captured_device ON biometric_templates (captured_device_sn);
CREATE INDEX IF NOT EXISTS idx_biometric_templates_idx_enrollment ON biometric_templates (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_biometric_templates_uk_enrollment_finger ON biometric_templates (enrollment_id, finger_index);
CREATE INDEX IF NOT EXISTS idx_boarding_presence_idx_boarding_presence_person ON boarding_presence (person_id);
CREATE INDEX IF NOT EXISTS idx_boarding_presence_uk_boarding_presence_student ON boarding_presence (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_boarding_reports_idx_report_period ON boarding_reports (school_id, period_key);
CREATE INDEX IF NOT EXISTS idx_boarding_reports_uk_boarding_report ON boarding_reports (school_id, student_id, period_key);
CREATE INDEX IF NOT EXISTS idx_budgets_idx_school_status ON budgets (school_id, status);
CREATE INDEX IF NOT EXISTS idx_class_teachers_fk_class_teacher_stream ON class_teachers (stream_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_fk_class_teacher_term ON class_teachers (term_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_idx_class_term ON class_teachers (class_id, term_id, stream_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_idx_school_class ON class_teachers (school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_class_teachers_idx_staff ON class_teachers (staff_id);
CREATE INDEX IF NOT EXISTS idx_comm_dispatch_log_idx_disp_event ON comm_dispatch_log (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_comm_dispatch_log_idx_disp_school ON comm_dispatch_log (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comm_dispatch_log_idx_disp_status ON comm_dispatch_log (status);
CREATE INDEX IF NOT EXISTS idx_comm_rules_idx_rules_event ON comm_rules (school_id, event_type, is_active);
CREATE INDEX IF NOT EXISTS idx_comm_templates_idx_tpl_event ON comm_templates (event_type, channel, is_active);
CREATE INDEX IF NOT EXISTS idx_comm_templates_uk_tpl ON comm_templates (school_id, event_type, channel, language);
CREATE INDEX IF NOT EXISTS idx_control_audit_logs_idx_created ON control_audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_control_audit_logs_idx_user ON control_audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_control_login_attempts_idx_email_time ON control_login_attempts (email, attempted_at);
CREATE INDEX IF NOT EXISTS idx_control_sessions_idx_control_session_user_active ON control_sessions (user_id, revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_control_sessions_idx_user ON control_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_control_sessions_uk_control_token ON control_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_control_users_uk_control_email ON control_users (email);
CREATE INDEX IF NOT EXISTS idx_custom_fields_idx_school_entity_active ON custom_fields (school_id, entity_type, is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_custom_fields_uk_school_entity_code ON custom_fields (school_id, entity_type, code);
CREATE INDEX IF NOT EXISTS idx_dahua_attendance_logs_idx_card ON dahua_attendance_logs (card_no);
CREATE INDEX IF NOT EXISTS idx_dahua_attendance_logs_idx_created ON dahua_attendance_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_dahua_attendance_logs_idx_device ON dahua_attendance_logs (device_id);
CREATE INDEX IF NOT EXISTS idx_dahua_attendance_logs_idx_event_time ON dahua_attendance_logs (event_time);
CREATE INDEX IF NOT EXISTS idx_dahua_attendance_logs_idx_student ON dahua_attendance_logs (student_id);
CREATE INDEX IF NOT EXISTS idx_dahua_attendance_logs_uk_dahua_event ON dahua_attendance_logs (device_id, user_id, event_time, event_type);
CREATE INDEX IF NOT EXISTS idx_dahua_devices_device_code ON dahua_devices (device_code);
CREATE INDEX IF NOT EXISTS idx_dahua_devices_idx_ip ON dahua_devices (ip_address);
CREATE INDEX IF NOT EXISTS idx_dahua_devices_idx_school ON dahua_devices (school_id);
CREATE INDEX IF NOT EXISTS idx_dahua_devices_idx_status ON dahua_devices (status);
CREATE INDEX IF NOT EXISTS idx_dahua_devices_unique_dahua_code ON dahua_devices (device_code);
CREATE INDEX IF NOT EXISTS idx_dahua_raw_logs_idx_created ON dahua_raw_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_dahua_raw_logs_idx_device ON dahua_raw_logs (device_id);
CREATE INDEX IF NOT EXISTS idx_dahua_sync_history_idx_device ON dahua_sync_history (device_id);
CREATE INDEX IF NOT EXISTS idx_dahua_sync_history_idx_started ON dahua_sync_history (started_at);
CREATE INDEX IF NOT EXISTS idx_dahua_sync_history_idx_status ON dahua_sync_history (status);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_idx_is_late ON daily_attendance (is_late);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_idx_is_manual ON daily_attendance (is_manual_entry);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_idx_person ON daily_attendance (person_type, person_id);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_idx_school_date ON daily_attendance (school_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_idx_status ON daily_attendance (status);
CREATE INDEX IF NOT EXISTS idx_daily_attendance_uk_school_person_date ON daily_attendance (school_id, person_type, person_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_deadline_reminder_log_idx_school ON deadline_reminder_log (school_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_deadline_reminder_log_uk_deadline_phone_day ON deadline_reminder_log (deadline_id, recipient_phone, sent_at);
CREATE INDEX IF NOT EXISTS idx_device_access_logs_idx_access_result ON device_access_logs (access_result);
CREATE INDEX IF NOT EXISTS idx_device_access_logs_idx_device_config ON device_access_logs (device_config_id);
CREATE INDEX IF NOT EXISTS idx_device_access_logs_idx_device_serial ON device_access_logs (device_serial_number);
CREATE INDEX IF NOT EXISTS idx_device_access_logs_idx_event_timestamp ON device_access_logs (event_timestamp);
CREATE INDEX IF NOT EXISTS idx_device_alerts_idx_code_open ON device_alerts (code, acknowledged_at);
CREATE INDEX IF NOT EXISTS idx_device_alerts_idx_device_time ON device_alerts (device_sn, created_at);
CREATE INDEX IF NOT EXISTS idx_device_alerts_idx_school_open ON device_alerts (school_id, acknowledged_at, severity);
CREATE INDEX IF NOT EXISTS idx_device_attendance_scopes_uk_device_scope ON device_attendance_scopes (school_id, device_sn);
CREATE INDEX IF NOT EXISTS idx_device_clock_health_uk_device_day ON device_clock_health (school_id, device_sn, local_date);
CREATE INDEX IF NOT EXISTS idx_device_configs_device_serial_number ON device_configs (device_serial_number);
CREATE INDEX IF NOT EXISTS idx_device_configs_idx_connection_status ON device_configs (connection_status);
CREATE INDEX IF NOT EXISTS idx_device_configs_idx_school_id ON device_configs (school_id);
CREATE INDEX IF NOT EXISTS idx_device_configs_idx_serial_number ON device_configs (device_serial_number);
CREATE INDEX IF NOT EXISTS idx_device_connection_history_idx_created_at ON device_connection_history (created_at);
CREATE INDEX IF NOT EXISTS idx_device_connection_history_idx_device_config ON device_connection_history (device_config_id);
CREATE INDEX IF NOT EXISTS idx_device_connection_history_idx_status ON device_connection_history (status);
CREATE INDEX IF NOT EXISTS idx_device_directory_audit_idx_dda_device ON device_directory_audit (device_sn, created_at);
CREATE INDEX IF NOT EXISTS idx_device_directory_audit_idx_dda_school ON device_directory_audit (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_device_heartbeats_idx_created ON device_heartbeats (created_at);
CREATE INDEX IF NOT EXISTS idx_device_heartbeats_idx_sn ON device_heartbeats (sn);
CREATE INDEX IF NOT EXISTS idx_device_inventory_runs_idx_inv_device ON device_inventory_runs (device_sn, started_at);
CREATE INDEX IF NOT EXISTS idx_device_inventory_runs_idx_inv_school ON device_inventory_runs (school_id, started_at);
CREATE INDEX IF NOT EXISTS idx_device_inventory_runs_idx_inv_status ON device_inventory_runs (device_sn, status);
CREATE INDEX IF NOT EXISTS idx_device_log_sync_runs_idx_device_status ON device_log_sync_runs (device_sn, status);
CREATE INDEX IF NOT EXISTS idx_device_log_sync_runs_idx_school ON device_log_sync_runs (school_id);
CREATE INDEX IF NOT EXISTS idx_device_reconciliation_items_idx_item_device_type ON device_reconciliation_items (device_sn, mismatch_type, action_status);
CREATE INDEX IF NOT EXISTS idx_device_reconciliation_items_idx_item_pin ON device_reconciliation_items (device_sn, device_user_pin);
CREATE INDEX IF NOT EXISTS idx_device_reconciliation_items_idx_item_run ON device_reconciliation_items (run_id);
CREATE INDEX IF NOT EXISTS idx_device_reconciliation_items_idx_item_school ON device_reconciliation_items (school_id, action_status);
CREATE INDEX IF NOT EXISTS idx_device_reconciliation_runs_idx_recon_device ON device_reconciliation_runs (device_sn, started_at);
CREATE INDEX IF NOT EXISTS idx_device_reconciliation_runs_idx_recon_school ON device_reconciliation_runs (school_id, started_at);
CREATE INDEX IF NOT EXISTS idx_device_school_hidden_idx_school ON device_school_hidden (school_id);
CREATE INDEX IF NOT EXISTS idx_device_school_hidden_uq_device_school ON device_school_hidden (device_id, school_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_checkpoints_uk_device ON device_sync_checkpoints (school_id, device_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_logs_fk_sync_logs_school ON device_sync_logs (school_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_logs_idx_device ON device_sync_logs (device_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_logs_idx_started_at ON device_sync_logs (started_at);
CREATE INDEX IF NOT EXISTS idx_device_sync_logs_idx_status ON device_sync_logs (status);
CREATE INDEX IF NOT EXISTS idx_device_sync_logs_idx_sync_type ON device_sync_logs (sync_type);
CREATE INDEX IF NOT EXISTS idx_device_sync_state_idx_school ON device_sync_state (school_id);
CREATE INDEX IF NOT EXISTS idx_device_sync_state_idx_sn ON device_sync_state (device_sn);
CREATE INDEX IF NOT EXISTS idx_device_transfers_idx_device_time ON device_transfers (device_sn, initiated_at);
CREATE INDEX IF NOT EXISTS idx_device_transfers_idx_from_school ON device_transfers (from_school_id);
CREATE INDEX IF NOT EXISTS idx_device_transfers_idx_status ON device_transfers (status);
CREATE INDEX IF NOT EXISTS idx_device_transfers_idx_to_school ON device_transfers (to_school_id);
CREATE INDEX IF NOT EXISTS idx_device_user_directory_idx_dud_name ON device_user_directory (device_name);
CREATE INDEX IF NOT EXISTS idx_device_user_directory_idx_dud_run ON device_user_directory (last_sync_run_id);
CREATE INDEX IF NOT EXISTS idx_device_user_directory_idx_dud_school ON device_user_directory (school_id);
CREATE INDEX IF NOT EXISTS idx_device_user_directory_uk_dud ON device_user_directory (device_sn, device_user_id);
CREATE INDEX IF NOT EXISTS idx_device_user_mappings_idx_dum_device ON device_user_mappings (device_id);
CREATE INDEX IF NOT EXISTS idx_device_user_mappings_idx_dum_school ON device_user_mappings (school_id);
CREATE INDEX IF NOT EXISTS idx_device_user_mappings_idx_dum_student ON device_user_mappings (student_id);
CREATE INDEX IF NOT EXISTS idx_device_user_mappings_uq_device_student ON device_user_mappings (device_id, student_id);
CREATE INDEX IF NOT EXISTS idx_device_users_idx_is_enrolled ON device_users (is_enrolled);
CREATE INDEX IF NOT EXISTS idx_device_users_idx_person ON device_users (person_type, person_id);
CREATE INDEX IF NOT EXISTS idx_device_users_idx_school_id ON device_users (school_id);
CREATE INDEX IF NOT EXISTS idx_device_users_uk_school_device_user ON device_users (school_id, device_user_id);
CREATE INDEX IF NOT EXISTS idx_devices_idx_devices_deleted ON devices (deleted_at);
CREATE INDEX IF NOT EXISTS idx_devices_idx_devices_ip ON devices (ip_address);
CREATE INDEX IF NOT EXISTS idx_devices_idx_devices_school ON devices (school_id);
CREATE INDEX IF NOT EXISTS idx_devices_sn ON devices (sn);
CREATE INDEX IF NOT EXISTS idx_devices_uk_devices_sn ON devices (sn);
CREATE INDEX IF NOT EXISTS idx_drce_blocks_idx_drce_blocks_kind ON drce_blocks (kind);
CREATE INDEX IF NOT EXISTS idx_drce_blocks_idx_drce_blocks_name ON drce_blocks (name);
CREATE INDEX IF NOT EXISTS idx_drce_blocks_idx_drce_blocks_school ON drce_blocks (school_id);
CREATE INDEX IF NOT EXISTS idx_drce_document_versions_idx_doc_created ON drce_document_versions (document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_drce_document_versions_uq_doc_version ON drce_document_versions (document_id, version_no);
CREATE INDEX IF NOT EXISTS idx_drce_starters_idx_kind_sort ON drce_starters (document_kind, sort_order, is_active);
CREATE INDEX IF NOT EXISTS idx_drce_starters_uk_starter_scope ON drce_starters (school_id, document_kind, name);
CREATE INDEX IF NOT EXISTS idx_dvcf_active_documents_idx_document_id ON dvcf_active_documents (document_id);
CREATE INDEX IF NOT EXISTS idx_dvcf_documents_idx_dvcf_kind ON dvcf_documents (school_id, document_kind);
CREATE INDEX IF NOT EXISTS idx_dvcf_documents_idx_dvcf_parent ON dvcf_documents (parent_id);
CREATE INDEX IF NOT EXISTS idx_dvcf_documents_idx_dvcf_status ON dvcf_documents (school_id, status);
CREATE INDEX IF NOT EXISTS idx_dvcf_documents_idx_dvcf_template_category ON dvcf_documents (template_category, document_type);
CREATE INDEX IF NOT EXISTS idx_dvcf_documents_idx_is_default ON dvcf_documents (is_default);
CREATE INDEX IF NOT EXISTS idx_dvcf_documents_idx_school_type ON dvcf_documents (school_id, document_type);
CREATE INDEX IF NOT EXISTS idx_dvcf_documents_idx_template_key ON dvcf_documents (template_key);
CREATE INDEX IF NOT EXISTS idx_enrollment_history_idx_changed_by ON enrollment_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_enrollment_history_idx_created_at ON enrollment_history (created_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_history_idx_enrollment_id ON enrollment_history (enrollment_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_history_idx_school_id ON enrollment_history (school_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_history_idx_student_id ON enrollment_history (student_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_programs_uq_enrollment_program ON enrollment_programs (enrollment_id, program_id);
CREATE INDEX IF NOT EXISTS idx_enrollment_sessions_idx_es_expires ON enrollment_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_enrollment_sessions_idx_es_school_device ON enrollment_sessions (school_id, device_sn);
CREATE INDEX IF NOT EXISTS idx_enrollment_sessions_idx_es_status ON enrollment_sessions (status);
CREATE INDEX IF NOT EXISTS idx_exams_idx_exams_deleted_at ON exams (deleted_at);
CREATE INDEX IF NOT EXISTS idx_expenditures_idx_expenditures_category ON expenditures (category_id);
CREATE INDEX IF NOT EXISTS idx_expenditures_idx_expenditures_date ON expenditures (expense_date);
CREATE INDEX IF NOT EXISTS idx_expenditures_idx_expenditures_school ON expenditures (school_id);
CREATE INDEX IF NOT EXISTS idx_expenditures_idx_expenditures_status ON expenditures (status);
CREATE INDEX IF NOT EXISTS idx_expenditures_idx_expenditures_wallet ON expenditures (wallet_id);
CREATE INDEX IF NOT EXISTS idx_feature_flags_idx_flag_enabled ON feature_flags (is_enabled, updated_at);
CREATE INDEX IF NOT EXISTS idx_feature_flags_uq_flag_school ON feature_flags (school_id, flag_key);
CREATE INDEX IF NOT EXISTS idx_fee_assignment_log_idx_fal_student ON fee_assignment_log (student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_fee_assignment_log_uq_assignment ON fee_assignment_log (student_id, fee_item_id, term_id);
CREATE INDEX IF NOT EXISTS idx_fee_clearance_exceptions_idx_school_student ON fee_clearance_exceptions (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_fee_clearance_exceptions_idx_status ON fee_clearance_exceptions (school_id, status);
CREATE INDEX IF NOT EXISTS idx_fee_eligibility_rules_idx_active ON fee_eligibility_rules (school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_fee_eligibility_rules_idx_school_item ON fee_eligibility_rules (school_id, fee_item_id);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_idx_finv_no ON fee_invoices (invoice_no);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_idx_finv_school ON fee_invoices (school_id);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_idx_finv_status ON fee_invoices (status);
CREATE INDEX IF NOT EXISTS idx_fee_invoices_idx_finv_student ON fee_invoices (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_items_idx_school_active ON fee_items (school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_fee_payment_allocations_idx_fee_item ON fee_payment_allocations (fee_item_id);
CREATE INDEX IF NOT EXISTS idx_fee_payment_allocations_idx_payment ON fee_payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_idx_fp_date ON fee_payments (created_at);
CREATE INDEX IF NOT EXISTS idx_fee_payments_idx_fp_status ON fee_payments (payment_status);
CREATE INDEX IF NOT EXISTS idx_fee_payments_idx_fp_student ON fee_payments (student_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_idx_fs_class ON fee_structures (class_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_idx_fs_year ON fee_structures (academic_year);
CREATE INDEX IF NOT EXISTS idx_finance_account_transfers_idx_from ON finance_account_transfers (from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_finance_account_transfers_idx_school ON finance_account_transfers (school_id);
CREATE INDEX IF NOT EXISTS idx_finance_account_transfers_idx_to ON finance_account_transfers (to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_idx_fa_active ON finance_accounts (school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_finance_accounts_idx_fa_school ON finance_accounts (school_id);
CREATE INDEX IF NOT EXISTS idx_finance_actions_idx_school ON finance_actions (school_id);
CREATE INDEX IF NOT EXISTS idx_finance_fee_items_idx_ffi_active ON finance_fee_items (school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_finance_fee_items_idx_ffi_class ON finance_fee_items (class_id);
CREATE INDEX IF NOT EXISTS idx_finance_fee_items_idx_ffi_program ON finance_fee_items (program_id);
CREATE INDEX IF NOT EXISTS idx_finance_fee_items_idx_ffi_school ON finance_fee_items (school_id);
CREATE INDEX IF NOT EXISTS idx_finance_fee_items_idx_ffi_term ON finance_fee_items (term_id);
CREATE INDEX IF NOT EXISTS idx_finance_import_batches_idx_school_status ON finance_import_batches (school_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_import_rows_idx_batch ON finance_import_rows (batch_id);
CREATE INDEX IF NOT EXISTS idx_finance_import_rows_idx_school ON finance_import_rows (school_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_idx_fp2_account ON finance_payments (account_id);
CREATE INDEX IF NOT EXISTS idx_finance_payments_idx_fp2_created ON finance_payments (created_at);
CREATE INDEX IF NOT EXISTS idx_finance_payments_idx_fp2_receipt ON finance_payments (receipt_no);
CREATE INDEX IF NOT EXISTS idx_finance_payments_idx_fp2_student_school ON finance_payments (student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_financial_reports_idx_frep_period ON financial_reports (start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_financial_reports_idx_frep_school ON financial_reports (school_id);
CREATE INDEX IF NOT EXISTS idx_financial_reports_idx_frep_type ON financial_reports (report_type);
CREATE INDEX IF NOT EXISTS idx_fingerprint_orphans_idx_orphan_school ON fingerprint_orphans (school_id, captured_at);
CREATE INDEX IF NOT EXISTS idx_fingerprint_orphans_idx_orphan_unclaimed ON fingerprint_orphans (claimed_at, device_sn);
CREATE INDEX IF NOT EXISTS idx_fingerprint_orphans_uk_orphan ON fingerprint_orphans (device_sn, device_user_id, finger_id);
CREATE INDEX IF NOT EXISTS idx_fingerprints_idx_school ON fingerprints (school_id);
CREATE INDEX IF NOT EXISTS idx_fingerprints_idx_staff ON fingerprints (staff_id);
CREATE INDEX IF NOT EXISTS idx_fingerprints_idx_student ON fingerprints (student_id);
CREATE INDEX IF NOT EXISTS idx_holidays_idx_date ON holidays (holiday_date);
CREATE INDEX IF NOT EXISTS idx_holidays_uk_school_date_name ON holidays (school_id, holiday_date, name);
CREATE INDEX IF NOT EXISTS idx_id_card_designs_idx_card_design_school ON id_card_designs (school_id, deleted_at, is_active);
CREATE INDEX IF NOT EXISTS idx_id_card_jobs_idx_card_job_expiry ON id_card_jobs (expires_at);
CREATE INDEX IF NOT EXISTS idx_id_card_jobs_idx_card_job_owner ON id_card_jobs (school_id, created_by, status);
CREATE INDEX IF NOT EXISTS idx_id_card_jobs_uk_card_job_uuid ON id_card_jobs (job_uuid);
CREATE INDEX IF NOT EXISTS idx_import_errors_idx_session ON import_errors (session_id);
CREATE INDEX IF NOT EXISTS idx_import_sessions_idx_created ON import_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_import_sessions_idx_school_status ON import_sessions (school_id, status);
CREATE INDEX IF NOT EXISTS idx_ingestion_conflict_policy_idx_ingestion_conflict_policy_school ON ingestion_conflict_policy (school_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_conflict_policy_uk_ingestion_conflict_policy ON ingestion_conflict_policy (school_id, pipeline_name, field);
CREATE INDEX IF NOT EXISTS idx_ingestion_field_memory_idx_ingestion_field_memory_pipeline ON ingestion_field_memory (school_id, pipeline_name);
CREATE INDEX IF NOT EXISTS idx_ingestion_field_memory_uk_ingestion_field_memory ON ingestion_field_memory (school_id, pipeline_name, source_header);
CREATE INDEX IF NOT EXISTS idx_ingestion_orphans_idx_ingestion_orphans_run ON ingestion_orphans (run_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_orphans_idx_ingestion_orphans_school_status ON ingestion_orphans (school_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_idx_ingestion_runs_school_pipe ON ingestion_runs (school_id, pipeline_name, started_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_runs_uk_ingestion_runs_run_id ON ingestion_runs (run_id);
CREATE INDEX IF NOT EXISTS idx_initials_edit_history_idx_class_subject ON initials_edit_history (class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_initials_edit_history_idx_school ON initials_edit_history (school_id);
CREATE INDEX IF NOT EXISTS idx_initials_edit_history_idx_timestamp ON initials_edit_history (changed_at);
CREATE INDEX IF NOT EXISTS idx_inventory_items_idx_items_school ON inventory_items (school_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_items_idx_items_store ON inventory_items (store_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_idx_tx_item ON inventory_transactions (item_id, created_at);
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_idx_tx_school ON inventory_transactions (school_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_issuance_audit_log_idx_audit_batch ON issuance_audit_log (batch_id, at);
CREATE INDEX IF NOT EXISTS idx_issuance_batches_idx_batch_school_status ON issuance_batches (school_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_issuance_batches_idx_batch_template ON issuance_batches (template_id);
CREATE INDEX IF NOT EXISTS idx_issuance_dedupe_keys_idx_dedupe_batch ON issuance_dedupe_keys (batch_id);
CREATE INDEX IF NOT EXISTS idx_issuance_dedupe_keys_uk_dedupe ON issuance_dedupe_keys (school_id, template_id, recipient_kind, recipient_id, issued_run_key);
CREATE INDEX IF NOT EXISTS idx_issuance_items_idx_item_batch ON issuance_items (batch_id, status);
CREATE INDEX IF NOT EXISTS idx_issuance_items_idx_item_recipient ON issuance_items (recipient_kind, recipient_id, status);
CREATE INDEX IF NOT EXISTS idx_learner_fee_adjustments_idx_school_student ON learner_fee_adjustments (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_learner_fee_adjustments_idx_status ON learner_fee_adjustments (school_id, status);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_idx_ledger_code ON ledger_accounts (account_code);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_idx_ledger_parent ON ledger_accounts (parent_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_idx_ledger_school ON ledger_accounts (school_id);
CREATE INDEX IF NOT EXISTS idx_ledger_accounts_idx_ledger_type ON ledger_accounts (account_type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_idx_lent_account ON ledger_entries (account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_idx_lent_date ON ledger_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_idx_lent_school ON ledger_entries (school_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_idx_lent_transaction ON ledger_entries (transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idx_ltrx_date ON ledger_transactions (transaction_date);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idx_ltrx_no ON ledger_transactions (transaction_no);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idx_ltrx_school ON ledger_transactions (school_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idx_ltrx_status ON ledger_transactions (status);
CREATE INDEX IF NOT EXISTS idx_lesson_attendance_idx_la_school_person ON lesson_attendance (school_id, person_id);
CREATE INDEX IF NOT EXISTS idx_lesson_attendance_idx_la_school_status ON lesson_attendance (school_id, status);
CREATE INDEX IF NOT EXISTS idx_lesson_attendance_uk_lesson_person ON lesson_attendance (occurrence_id, person_id);
CREATE INDEX IF NOT EXISTS idx_lesson_occurrences_idx_occ_day ON lesson_occurrences (school_id, lesson_date, class_id);
CREATE INDEX IF NOT EXISTS idx_lesson_occurrences_idx_occ_teacher ON lesson_occurrences (school_id, teacher_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_lesson_occurrences_uk_occurrence ON lesson_occurrences (school_id, timetable_entry_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_manual_attendance_entries_idx_attendance_date ON manual_attendance_entries (attendance_date);
CREATE INDEX IF NOT EXISTS idx_manual_attendance_entries_idx_created_at ON manual_attendance_entries (created_at);
CREATE INDEX IF NOT EXISTS idx_manual_attendance_entries_idx_created_by ON manual_attendance_entries (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_manual_attendance_entries_idx_daily_attendance ON manual_attendance_entries (daily_attendance_id);
CREATE INDEX IF NOT EXISTS idx_manual_attendance_entries_idx_person ON manual_attendance_entries (person_type, person_id);
CREATE INDEX IF NOT EXISTS idx_manual_attendance_entries_idx_school_id ON manual_attendance_entries (school_id);
CREATE INDEX IF NOT EXISTS idx_marks_migration_log_idx_migration_id ON marks_migration_log (migration_id);
CREATE INDEX IF NOT EXISTS idx_marks_migration_log_idx_school_class ON marks_migration_log (school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_marks_migration_log_idx_timestamp ON marks_migration_log (created_at);
CREATE INDEX IF NOT EXISTS idx_marks_migration_log_idx_transaction_id ON marks_migration_log (transaction_id);
CREATE INDEX IF NOT EXISTS idx_marks_migration_log_migration_id ON marks_migration_log (migration_id);
CREATE INDEX IF NOT EXISTS idx_marks_migration_policies_idx_school ON marks_migration_policies (school_id);
CREATE INDEX IF NOT EXISTS idx_marks_migration_policies_uq_migration_path ON marks_migration_policies (school_id, source_subject_id, destination_subject_id);
CREATE INDEX IF NOT EXISTS idx_migration_runs_uk_migration_filename ON migration_runs (filename);
CREATE INDEX IF NOT EXISTS idx_mobile_money_transactions_idx_momo_provider ON mobile_money_transactions (provider);
CREATE INDEX IF NOT EXISTS idx_mobile_money_transactions_idx_momo_ref ON mobile_money_transactions (transaction_ref);
CREATE INDEX IF NOT EXISTS idx_mobile_money_transactions_idx_momo_school ON mobile_money_transactions (school_id);
CREATE INDEX IF NOT EXISTS idx_mobile_money_transactions_idx_momo_status ON mobile_money_transactions (status);
CREATE INDEX IF NOT EXISTS idx_mobile_money_transactions_idx_momo_student ON mobile_money_transactions (student_id);
CREATE INDEX IF NOT EXISTS idx_name_repair_changes_idx_person ON name_repair_changes (person_id);
CREATE INDEX IF NOT EXISTS idx_name_repair_changes_idx_session ON name_repair_changes (session_id);
CREATE INDEX IF NOT EXISTS idx_name_repair_sessions_idx_created ON name_repair_sessions (created_at);
CREATE INDEX IF NOT EXISTS idx_name_repair_sessions_idx_school_status ON name_repair_sessions (school_id, status);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_idx_outbox ON notification_deliveries (outbox_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_idx_school_day ON notification_deliveries (school_id, delivered_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_idx_outbox_school_created ON notification_outbox (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_idx_outbox_type ON notification_outbox (school_id, notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_idx_policy ON notification_outbox (policy_id);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_idx_school_status ON notification_outbox (school_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_idx_status_sched ON notification_outbox (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_uk_dedup ON notification_outbox (dedup_key);
CREATE INDEX IF NOT EXISTS idx_notification_policies_idx_school_event ON notification_policies (school_id, event_type, is_active);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_idx_preferences_user ON notification_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_notification_preferences_uq_user_channel ON notification_preferences (user_id, channel);
CREATE INDEX IF NOT EXISTS idx_notification_queue_idx_queue_notification ON notification_queue (notification_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_idx_queue_recipient ON notification_queue (recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_notification_queue_idx_queue_status ON notification_queue (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_notification_templates_idx_templates_system ON notification_templates (is_system, is_active);
CREATE INDEX IF NOT EXISTS idx_notification_templates_uq_template_code ON notification_templates (school_id, code);
CREATE INDEX IF NOT EXISTS idx_notifications_idx_notifications_action ON notifications (action);
CREATE INDEX IF NOT EXISTS idx_notifications_idx_notifications_actor ON notifications (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_idx_notifications_entity ON notifications (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_idx_notifications_priority ON notifications (priority, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_idx_notifications_school_created ON notifications (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_parent_accounts_uq_parent_phone ON parent_accounts (phone);
CREATE INDEX IF NOT EXISTS idx_parent_otp_codes_idx_otp_created ON parent_otp_codes (created_at);
CREATE INDEX IF NOT EXISTS idx_parent_otp_codes_idx_otp_phone_purpose ON parent_otp_codes (phone, purpose);
CREATE INDEX IF NOT EXISTS idx_parent_sessions_idx_parent_session_account ON parent_sessions (parent_account_id);
CREATE INDEX IF NOT EXISTS idx_parent_sessions_idx_parent_session_active ON parent_sessions (is_active, expires_at);
CREATE INDEX IF NOT EXISTS idx_parent_sessions_uq_parent_session_token ON parent_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_idx_link_account_active ON parent_student_links (parent_account_id, school_id, status);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_idx_link_school_status ON parent_student_links (school_id, status);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_idx_link_student ON parent_student_links (student_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_uq_parent_student ON parent_student_links (parent_account_id, school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_parent_student_links_uq_psl_access_uuid ON parent_student_links (access_uuid);
CREATE INDEX IF NOT EXISTS idx_passout_events_idx_passout ON passout_events (passout_id);
CREATE INDEX IF NOT EXISTS idx_passout_events_idx_school_created ON passout_events (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_passout_events_idx_student ON passout_events (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_passout_requests_idx_active ON passout_requests (school_id, student_id, status, approved_until);
CREATE INDEX IF NOT EXISTS idx_passout_requests_idx_school_status ON passout_requests (school_id, status);
CREATE INDEX IF NOT EXISTS idx_passout_requests_idx_school_student ON passout_requests (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_idx_expires ON password_resets (expires_at);
CREATE INDEX IF NOT EXISTS idx_password_resets_idx_token ON password_resets (token);
CREATE INDEX IF NOT EXISTS idx_password_resets_idx_user_id ON password_resets (user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON password_resets (token);
CREATE INDEX IF NOT EXISTS idx_payment_reconciliations_idx_payment ON payment_reconciliations (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_reconciliations_idx_school ON payment_reconciliations (school_id);
CREATE INDEX IF NOT EXISTS idx_pending_device_users_idx_pdu_status ON pending_device_users (school_id, status, last_seen);
CREATE INDEX IF NOT EXISTS idx_pending_device_users_uk_pdu ON pending_device_users (school_id, device_sn, device_user_pin);
CREATE INDEX IF NOT EXISTS idx_platform_alerts_idx_created ON platform_alerts (created_at);
CREATE INDEX IF NOT EXISTS idx_platform_alerts_uk_school_kind_day ON platform_alerts (school_id, kind, NULL);
CREATE INDEX IF NOT EXISTS idx_platform_api_audit_ix_platform_audit_error_time ON platform_api_audit (error_code, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_api_audit_ix_platform_audit_key_time ON platform_api_audit (key_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_api_audit_ix_platform_audit_path_time ON platform_api_audit (path, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_api_audit_ix_platform_audit_req ON platform_api_audit (request_id);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_ix_platform_api_keys_active ON platform_api_keys (revoked_at, expires_at);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_ix_platform_api_keys_consumer ON platform_api_keys (consumer);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_key_id ON platform_api_keys (key_id);
CREATE INDEX IF NOT EXISTS idx_platform_events_ix_platform_events_school_time ON platform_events (school_id, emitted_at);
CREATE INDEX IF NOT EXISTS idx_platform_events_ix_platform_events_type_time ON platform_events (event_type, emitted_at);
CREATE INDEX IF NOT EXISTS idx_platform_health_snapshots_uk_school_day ON platform_health_snapshots (school_id, snapshot_date);
CREATE INDEX IF NOT EXISTS idx_platform_idempotency_keys_ix_platform_idem_created ON platform_idempotency_keys (created_at);
CREATE INDEX IF NOT EXISTS idx_platform_invoices_idx_school ON platform_invoices (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_platform_jobs_idx_due ON platform_jobs (status, run_after);
CREATE INDEX IF NOT EXISTS idx_platform_jobs_uk_dedup ON platform_jobs (dedup_key);
CREATE INDEX IF NOT EXISTS idx_platform_payments_idx_invoice ON platform_payments (invoice_id);
CREATE INDEX IF NOT EXISTS idx_platform_payments_idx_provider_ref ON platform_payments (provider_ref);
CREATE INDEX IF NOT EXISTS idx_platform_payments_idx_school ON platform_payments (school_id);
CREATE INDEX IF NOT EXISTS idx_platform_rate_limits_ix_platform_rl_window ON platform_rate_limits (window_start);
CREATE INDEX IF NOT EXISTS idx_pocket_money_accounts_uq_school_student ON pocket_money_accounts (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_pocket_money_transactions_idx_account ON pocket_money_transactions (account_id);
CREATE INDEX IF NOT EXISTS idx_pocket_money_transactions_idx_school_student ON pocket_money_transactions (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_positions_idx_position_category ON positions (category, is_active);
CREATE INDEX IF NOT EXISTS idx_positions_idx_position_teaching ON positions (is_teaching, is_active);
CREATE INDEX IF NOT EXISTS idx_positions_uk_position_code_per_school ON positions (school_id, code);
CREATE INDEX IF NOT EXISTS idx_programs_uq_program_school_name ON programs (school_id, name);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_log_idx_action_type ON promotion_audit_log (action_type);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_log_idx_created_at ON promotion_audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_log_idx_performed_by ON promotion_audit_log (performed_by);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_log_idx_school_id ON promotion_audit_log (school_id);
CREATE INDEX IF NOT EXISTS idx_promotion_audit_log_idx_student_id ON promotion_audit_log (student_id);
CREATE INDEX IF NOT EXISTS idx_promotion_criteria_idx_is_active ON promotion_criteria (is_active);
CREATE INDEX IF NOT EXISTS idx_promotion_criteria_idx_school_id ON promotion_criteria (school_id);
CREATE INDEX IF NOT EXISTS idx_promotions_idx_approval_status ON promotions (approval_status);
CREATE INDEX IF NOT EXISTS idx_promotions_idx_created_at ON promotions (created_at);
CREATE INDEX IF NOT EXISTS idx_promotions_idx_from_class ON promotions (from_class_id);
CREATE INDEX IF NOT EXISTS idx_promotions_idx_promoted_by ON promotions (promoted_by);
CREATE INDEX IF NOT EXISTS idx_promotions_idx_promotion_status ON promotions (promotion_status);
CREATE INDEX IF NOT EXISTS idx_promotions_idx_school_id ON promotions (school_id);
CREATE INDEX IF NOT EXISTS idx_promotions_idx_student_id ON promotions (student_id);
CREATE INDEX IF NOT EXISTS idx_promotions_idx_to_class ON promotions (to_class_id);
CREATE INDEX IF NOT EXISTS idx_promotions_unique_promotion_cycle ON promotions (school_id, student_id, from_academic_year_id);
CREATE INDEX IF NOT EXISTS idx_receipts_idx_receipts_date ON receipts (created_at);
CREATE INDEX IF NOT EXISTS idx_receipts_idx_receipts_no ON receipts (receipt_no);
CREATE INDEX IF NOT EXISTS idx_receipts_idx_receipts_school ON receipts (school_id);
CREATE INDEX IF NOT EXISTS idx_receipts_idx_receipts_student ON receipts (student_id);
CREATE INDEX IF NOT EXISTS idx_relay_commands_idx_relay_cmd_created ON relay_commands (created_at);
CREATE INDEX IF NOT EXISTS idx_relay_commands_idx_relay_cmd_device_status ON relay_commands (device_sn, status);
CREATE INDEX IF NOT EXISTS idx_reminders_idx_due ON reminders (due_date);
CREATE INDEX IF NOT EXISTS idx_reminders_idx_school ON reminders (school_id);
CREATE INDEX IF NOT EXISTS idx_report_card_overrides_idx_snapshot_kind ON report_card_overrides (snapshot_id, override_kind);
CREATE INDEX IF NOT EXISTS idx_report_card_overrides_idx_snapshot_student ON report_card_overrides (snapshot_id, student_db_id);
CREATE INDEX IF NOT EXISTS idx_report_comment_rules_idx_school_active ON report_comment_rules (school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_report_overall_comment_rules_idx_school_role_active ON report_overall_comment_rules (school_id, role, is_active);
CREATE INDEX IF NOT EXISTS idx_report_overall_comment_rules_idx_school_template ON report_overall_comment_rules (school_id, template_id, is_active);
CREATE INDEX IF NOT EXISTS idx_result_submission_deadlines_idx_school ON result_submission_deadlines (school_id);
CREATE INDEX IF NOT EXISTS idx_result_submission_deadlines_idx_term ON result_submission_deadlines (term_id);
CREATE INDEX IF NOT EXISTS idx_results_idx_results_school_id ON results (school_id);
CREATE INDEX IF NOT EXISTS idx_results_submission_log_idx_school_time ON results_submission_log (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_results_submission_log_idx_status_time ON results_submission_log (status, created_at);
CREATE INDEX IF NOT EXISTS idx_salary_payments_idx_salary_payments_deleted_at ON salary_payments (deleted_at);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_idx_name ON schema_migrations (migration_name);
CREATE INDEX IF NOT EXISTS idx_schema_migrations_uk_name_success ON schema_migrations (migration_name, status);
CREATE INDEX IF NOT EXISTS idx_school_info_idx_created_at ON school_info (created_at);
CREATE INDEX IF NOT EXISTS idx_school_info_idx_school_id ON school_info (school_id);
CREATE INDEX IF NOT EXISTS idx_school_info_unique_school ON school_info (school_id);
CREATE INDEX IF NOT EXISTS idx_school_modules_idx_module_school ON school_modules (module_code, school_id, is_enabled);
CREATE INDEX IF NOT EXISTS idx_school_modules_uk_school_module ON school_modules (school_id, module_code);
CREATE INDEX IF NOT EXISTS idx_school_sms_routes_idx_route_source ON school_sms_routes (source_school_id);
CREATE INDEX IF NOT EXISTS idx_security_settings_idx_ss_school_id ON security_settings (school_id);
CREATE INDEX IF NOT EXISTS idx_security_settings_idx_ss_setting_key ON security_settings (setting_key);
CREATE INDEX IF NOT EXISTS idx_security_settings_unique_school_setting ON security_settings (school_id, setting_key);
CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_idx_incident ON sentinel_alerts (incident_id);
CREATE INDEX IF NOT EXISTS idx_sentinel_alerts_idx_status_time ON sentinel_alerts (status, attempted_at);
CREATE INDEX IF NOT EXISTS idx_sentinel_diagnostics_idx_created ON sentinel_diagnostics (created_at);
CREATE INDEX IF NOT EXISTS idx_sentinel_incidents_idx_kind ON sentinel_incidents (kind);
CREATE INDEX IF NOT EXISTS idx_sentinel_incidents_idx_school_status ON sentinel_incidents (school_id, status);
CREATE INDEX IF NOT EXISTS idx_sentinel_incidents_idx_status_sev ON sentinel_incidents (status, severity, last_detected_at);
CREATE INDEX IF NOT EXISTS idx_sentinel_incidents_uk_dedup ON sentinel_incidents (dedup_key);
CREATE INDEX IF NOT EXISTS idx_sentinel_observations_idx_module_time ON sentinel_observations (module, created_at);
CREATE INDEX IF NOT EXISTS idx_sentinel_observations_idx_school_time ON sentinel_observations (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_settings_uq_school_setting ON settings (school_id, setting_key);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_idx_school_target ON shift_assignments (school_id, target_type, target_id, status);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_idx_shift ON shift_assignments (shift_id);
CREATE INDEX IF NOT EXISTS idx_shifts_idx_school ON shifts (school_id, status);
CREATE INDEX IF NOT EXISTS idx_sms_provider_configs_idx_sms_provider_active ON sms_provider_configs (is_active, enabled);
CREATE INDEX IF NOT EXISTS idx_sms_provider_configs_uk_sms_provider_type ON sms_provider_configs (provider_type);
CREATE INDEX IF NOT EXISTS idx_sms_provider_operations_idx_sms_provider_ops_provider ON sms_provider_operations (provider_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_topups_idx_topup_school ON sms_topups (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_topups_idx_topup_status ON sms_topups (status, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_topups_uk_topup_provider_uuid ON sms_topups (provider_uuid);
CREATE INDEX IF NOT EXISTS idx_sms_topups_uk_topup_reference ON sms_topups (reference);
CREATE INDEX IF NOT EXISTS idx_sms_usage_events_idx_usage_school ON sms_usage_events (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_usage_events_uk_usage_ref ON sms_usage_events (source, ref);
CREATE INDEX IF NOT EXISTS idx_staff_employment_fk_employment_position ON staff_employment (position_id);
CREATE INDEX IF NOT EXISTS idx_staff_employment_idx_school_status ON staff_employment (school_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_employment_idx_staff_event ON staff_employment (staff_id, event_date);
CREATE INDEX IF NOT EXISTS idx_staff_qualifications_idx_sq_school ON staff_qualifications (school_id);
CREATE INDEX IF NOT EXISTS idx_staff_qualifications_idx_sq_staff ON staff_qualifications (staff_id, school_id);
CREATE INDEX IF NOT EXISTS idx_staff_subject_specializations_fk_sss_subject ON staff_subject_specializations (subject_id);
CREATE INDEX IF NOT EXISTS idx_staff_subject_specializations_idx_sss_school ON staff_subject_specializations (school_id);
CREATE INDEX IF NOT EXISTS idx_staff_subject_specializations_uk_staff_subject ON staff_subject_specializations (staff_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_stores_idx_stores_school ON stores (school_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_streams_idx_school_class ON streams (school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_streams_unique_class_stream ON streams (class_id, name, school_id);
CREATE INDEX IF NOT EXISTS idx_student_additional_info_student_id ON student_additional_info (student_id);
CREATE INDEX IF NOT EXISTS idx_student_attendance_idx_biometric_timestamp ON student_attendance (biometric_timestamp);
CREATE INDEX IF NOT EXISTS idx_student_attendance_idx_device ON student_attendance (device_id);
CREATE INDEX IF NOT EXISTS idx_student_attendance_idx_is_locked ON student_attendance (is_locked);
CREATE INDEX IF NOT EXISTS idx_student_attendance_idx_session ON student_attendance (attendance_session_id);
CREATE INDEX IF NOT EXISTS idx_student_attendance_idx_stream ON student_attendance (stream_id);
CREATE INDEX IF NOT EXISTS idx_student_attendance_idx_student_attendance_school_id ON student_attendance (school_id);
CREATE INDEX IF NOT EXISTS idx_student_attendance_idx_teacher ON student_attendance (teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_component_results_idx_scr_framework ON student_component_results (framework_id, component_id);
CREATE INDEX IF NOT EXISTS idx_student_component_results_idx_scr_lookup ON student_component_results (school_id, class_id, term_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_student_component_results_uk_scr_cell ON student_component_results (student_id, class_id, subject_id, term_id, component_id);
CREATE INDEX IF NOT EXISTS idx_student_custom_values_idx_field_value_date ON student_custom_values (field_id, value_date);
CREATE INDEX IF NOT EXISTS idx_student_custom_values_idx_field_value_number ON student_custom_values (field_id, value_number);
CREATE INDEX IF NOT EXISTS idx_student_custom_values_idx_field_value_text ON student_custom_values (field_id, value_text);
CREATE INDEX IF NOT EXISTS idx_student_custom_values_uk_student_field ON student_custom_values (student_id, field_id);
CREATE INDEX IF NOT EXISTS idx_student_fee_items_idx_sfi_status ON student_fee_items (status);
CREATE INDEX IF NOT EXISTS idx_student_fee_items_idx_sfi_student ON student_fee_items (student_id);
CREATE INDEX IF NOT EXISTS idx_student_fee_items_idx_student_fee_items_fee_item ON student_fee_items (fee_item_id);
CREATE INDEX IF NOT EXISTS idx_student_fingerprints_fk_fingerprints_school ON student_fingerprints (school_id);
CREATE INDEX IF NOT EXISTS idx_student_fingerprints_idx_biometric_uuid ON student_fingerprints (biometric_uuid);
CREATE INDEX IF NOT EXISTS idx_student_fingerprints_idx_device ON student_fingerprints (device_id);
CREATE INDEX IF NOT EXISTS idx_student_fingerprints_idx_status ON student_fingerprints (status);
CREATE INDEX IF NOT EXISTS idx_student_fingerprints_idx_student ON student_fingerprints (student_id);
CREATE INDEX IF NOT EXISTS idx_student_fingerprints_idx_student_device ON student_fingerprints (student_id, device_id);
CREATE INDEX IF NOT EXISTS idx_student_generic_skills_idx_gskill_school_term ON student_generic_skills (school_id, term_id);
CREATE INDEX IF NOT EXISTS idx_student_generic_skills_idx_gskill_skill ON student_generic_skills (skill_code);
CREATE INDEX IF NOT EXISTS idx_student_generic_skills_uk_gskill ON student_generic_skills (student_id, term_id, skill_code);
CREATE INDEX IF NOT EXISTS idx_student_history_idx_sh_school ON student_history (school_id);
CREATE INDEX IF NOT EXISTS idx_student_history_idx_sh_student ON student_history (student_id);
CREATE INDEX IF NOT EXISTS idx_student_ledger_idx_sl_created ON student_ledger (created_at);
CREATE INDEX IF NOT EXISTS idx_student_ledger_idx_sl_school ON student_ledger (school_id);
CREATE INDEX IF NOT EXISTS idx_student_ledger_idx_sl_student_school ON student_ledger (student_id, school_id);
CREATE INDEX IF NOT EXISTS idx_student_ledger_idx_sl_term ON student_ledger (term_id);
CREATE INDEX IF NOT EXISTS idx_student_ledger_idx_sl_type ON student_ledger (type);
CREATE INDEX IF NOT EXISTS idx_student_parents_uq_student_parent ON student_parents (student_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_student_projects_idx_project_school_term ON student_projects (school_id, term_id);
CREATE INDEX IF NOT EXISTS idx_student_projects_idx_project_student_term ON student_projects (student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_study_modes_uq_study_mode_school_name ON study_modes (school_id, name);
CREATE INDEX IF NOT EXISTS idx_subject_groups_idx_school ON subject_groups (school_id, status);
CREATE INDEX IF NOT EXISTS idx_subject_report_order_idx_subject_order_class ON subject_report_order (school_id, class_id);
CREATE INDEX IF NOT EXISTS idx_subject_report_order_idx_subject_order_result_type ON subject_report_order (school_id, result_type_id);
CREATE INDEX IF NOT EXISTS idx_subject_report_order_idx_subject_order_school ON subject_report_order (school_id);
CREATE INDEX IF NOT EXISTS idx_subject_report_order_uq_subject_order_scope ON subject_report_order (school_id, subject_id, class_id, result_type_id);
CREATE INDEX IF NOT EXISTS idx_subject_weekly_periods_idx_class ON subject_weekly_periods (class_id);
CREATE INDEX IF NOT EXISTS idx_subject_weekly_periods_unique_class_subject ON subject_weekly_periods (school_id, class_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plans_uk_plan_code ON subscription_plans (code);
CREATE INDEX IF NOT EXISTS idx_system_errors_idx_syserr_created ON system_errors (created_at);
CREATE INDEX IF NOT EXISTS idx_system_errors_idx_syserr_endpoint ON system_errors (endpoint);
CREATE INDEX IF NOT EXISTS idx_system_errors_idx_syserr_resolved ON system_errors (resolved);
CREATE INDEX IF NOT EXISTS idx_system_errors_idx_syserr_school ON system_errors (school_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_idx_created ON system_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_idx_device_sn ON system_logs (device_sn);
CREATE INDEX IF NOT EXISTS idx_system_logs_idx_event_type ON system_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_system_logs_idx_type_date ON system_logs (event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_tahfiz_custom_book_units_idx_custom_units ON tahfiz_custom_book_units (custom_book_id, order_index);
CREATE INDEX IF NOT EXISTS idx_tahfiz_custom_books_idx_custom_books ON tahfiz_custom_books (school_id, status);
CREATE INDEX IF NOT EXISTS idx_tahfiz_enrollments_idx_tahfiz_enroll_status ON tahfiz_enrollments (school_id, status);
CREATE INDEX IF NOT EXISTS idx_tahfiz_enrollments_uq_tahfiz_enroll ON tahfiz_enrollments (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_evaluations_idx_school ON tahfiz_evaluations (school_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_evaluations_idx_student ON tahfiz_evaluations (student_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_global_books_uq_global_book_code ON tahfiz_global_books (code);
CREATE INDEX IF NOT EXISTS idx_tahfiz_group_members_idx_tgm_group ON tahfiz_group_members (group_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_group_members_idx_tgm_student ON tahfiz_group_members (student_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_group_members_uq_group_student ON tahfiz_group_members (group_id, student_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_groups_idx_name ON tahfiz_groups (name);
CREATE INDEX IF NOT EXISTS idx_tahfiz_groups_idx_school_id ON tahfiz_groups (school_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_groups_idx_teacher_id ON tahfiz_groups (teacher_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_plans_idx_book_id ON tahfiz_plans (book_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_plans_idx_class_id ON tahfiz_plans (class_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_plans_idx_group_id ON tahfiz_plans (group_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_plans_idx_school_date ON tahfiz_plans (school_id, assigned_date);
CREATE INDEX IF NOT EXISTS idx_tahfiz_plans_idx_teacher ON tahfiz_plans (teacher_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_portions_idx_tp_date ON tahfiz_portions (date);
CREATE INDEX IF NOT EXISTS idx_tahfiz_portions_idx_tp_plan ON tahfiz_portions (plan_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_portions_idx_tp_student ON tahfiz_portions (student_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_records_idx_tr_date ON tahfiz_records (date);
CREATE INDEX IF NOT EXISTS idx_tahfiz_records_idx_tr_group ON tahfiz_records (group_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_records_idx_tr_plan ON tahfiz_records (plan_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_records_idx_tr_school ON tahfiz_records (school_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_records_idx_tr_student ON tahfiz_records (student_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_results_idx_result_date ON tahfiz_results (result_date);
CREATE INDEX IF NOT EXISTS idx_tahfiz_results_idx_school_student ON tahfiz_results (school_id, student_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_results_idx_term_academic_year ON tahfiz_results (term_id, academic_year_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_school_books_idx_school_books ON tahfiz_school_books (school_id, enabled);
CREATE INDEX IF NOT EXISTS idx_tahfiz_school_books_uq_school_book ON tahfiz_school_books (school_id, global_book_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_seven_metrics_idx_school_id ON tahfiz_seven_metrics (school_id);
CREATE INDEX IF NOT EXISTS idx_tahfiz_seven_metrics_result_id ON tahfiz_seven_metrics (result_id);
CREATE INDEX IF NOT EXISTS idx_template_distributions_idx_device_status ON template_distributions (device_sn, status);
CREATE INDEX IF NOT EXISTS idx_template_distributions_idx_queued ON template_distributions (status, queued_at);
CREATE INDEX IF NOT EXISTS idx_template_distributions_uk_template_device ON template_distributions (template_id, device_sn);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_idx_class_day ON timetable_entries (class_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_idx_room_day ON timetable_entries (room, day_of_week, period_id);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_idx_school ON timetable_entries (school_id);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_idx_stream_day ON timetable_entries (stream_id, day_of_week, period_id);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_idx_teacher_day ON timetable_entries (teacher_id, day_of_week, period_id);
CREATE INDEX IF NOT EXISTS idx_timetable_entries_unique_slot ON timetable_entries (school_id, day_of_week, period_id, class_id, stream_id);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_idx_school_order ON timetable_periods (school_id, period_order);
CREATE INDEX IF NOT EXISTS idx_timetable_periods_unique_school_period ON timetable_periods (school_id, name);
CREATE INDEX IF NOT EXISTS idx_user_notifications_idx_user_notifications_created ON user_notifications (created_at);
CREATE INDEX IF NOT EXISTS idx_user_notifications_idx_user_notifications_school ON user_notifications (school_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_notifications_idx_user_notifications_user ON user_notifications (user_id, is_read, is_archived);
CREATE INDEX IF NOT EXISTS idx_user_notifications_uq_user_notification ON user_notifications (notification_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_idx_expires_at ON user_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_idx_session_token ON user_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_idx_user_id ON user_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions (session_token);
CREATE INDEX IF NOT EXISTS idx_villages_idx_villages_deleted ON villages (deleted_at);
CREATE INDEX IF NOT EXISTS idx_villages_idx_villages_name ON villages (name);
CREATE INDEX IF NOT EXISTS idx_villages_idx_villages_parish ON villages (parish_id);
CREATE INDEX IF NOT EXISTS idx_villages_name ON villages (name);
CREATE INDEX IF NOT EXISTS idx_visitation_cards_idx_school_status ON visitation_cards (school_id, status);
CREATE INDEX IF NOT EXISTS idx_visitation_cards_idx_school_uid ON visitation_cards (school_id, card_uid);
CREATE INDEX IF NOT EXISTS idx_visitation_events_idx_card ON visitation_events (school_id, card_uid);
CREATE INDEX IF NOT EXISTS idx_visitation_events_idx_school_created ON visitation_events (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_waivers_discounts_idx_waivers_school ON waivers_discounts (school_id);
CREATE INDEX IF NOT EXISTS idx_waivers_discounts_idx_waivers_status ON waivers_discounts (status);
CREATE INDEX IF NOT EXISTS idx_waivers_discounts_idx_waivers_student ON waivers_discounts (student_id);
CREATE INDEX IF NOT EXISTS idx_waivers_discounts_idx_waivers_term ON waivers_discounts (term_id);
CREATE INDEX IF NOT EXISTS idx_wallets_idx_school ON wallets (school_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_ix_webhook_del_event ON webhook_deliveries (event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_ix_webhook_del_status_created ON webhook_deliveries (status, created_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_ix_webhook_del_status_retry ON webhook_deliveries (status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_ix_webhook_del_sub ON webhook_deliveries (subscription_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_uq_webhook_del_sub_event ON webhook_deliveries (subscription_id, event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_ix_webhook_sub_active ON webhook_subscriptions (is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_subscriptions_ix_webhook_sub_consumer ON webhook_subscriptions (consumer);
CREATE INDEX IF NOT EXISTS idx_workplans_idx_assigned_to ON workplans (assigned_to);
CREATE INDEX IF NOT EXISTS idx_workplans_idx_school_id ON workplans (school_id);
CREATE INDEX IF NOT EXISTS idx_workplans_idx_status ON workplans (status);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_idx_check_time ON zk_attendance_logs (check_time);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_idx_device_sn ON zk_attendance_logs (device_sn);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_idx_device_user ON zk_attendance_logs (device_user_id);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_idx_matched ON zk_attendance_logs (matched);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_idx_processed ON zk_attendance_logs (processed);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_idx_school_date ON zk_attendance_logs (school_id, check_time);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_idx_staff ON zk_attendance_logs (staff_id);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_idx_student ON zk_attendance_logs (student_id);
CREATE INDEX IF NOT EXISTS idx_zk_attendance_logs_uk_punch_identity ON zk_attendance_logs (device_sn, device_user_id, device_reported_time);
CREATE INDEX IF NOT EXISTS idx_zk_device_commands_idx_created ON zk_device_commands (created_at);
CREATE INDEX IF NOT EXISTS idx_zk_device_commands_idx_device_pending ON zk_device_commands (device_sn, status, priority);
CREATE INDEX IF NOT EXISTS idx_zk_device_commands_idx_expires ON zk_device_commands (expires_at);
CREATE INDEX IF NOT EXISTS idx_zk_device_commands_idx_status ON zk_device_commands (status);
CREATE INDEX IF NOT EXISTS idx_zk_device_logs_idx_check_time ON zk_device_logs (check_time);
CREATE INDEX IF NOT EXISTS idx_zk_device_logs_idx_device_sn ON zk_device_logs (device_sn);
CREATE INDEX IF NOT EXISTS idx_zk_device_logs_idx_event_type ON zk_device_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_zk_device_logs_idx_matched ON zk_device_logs (matched);
CREATE INDEX IF NOT EXISTS idx_zk_device_logs_idx_school_created ON zk_device_logs (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_zk_device_logs_idx_status ON zk_device_logs (status);
CREATE INDEX IF NOT EXISTS idx_zk_device_logs_idx_user_id ON zk_device_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_zk_devices_idx_last_heartbeat ON zk_devices (last_heartbeat);
CREATE INDEX IF NOT EXISTS idx_zk_devices_idx_school ON zk_devices (school_id);
CREATE INDEX IF NOT EXISTS idx_zk_devices_idx_status ON zk_devices (status);
CREATE INDEX IF NOT EXISTS idx_zk_devices_uk_serial ON zk_devices (serial_number);
CREATE INDEX IF NOT EXISTS idx_zk_parsed_logs_idx_device_sn ON zk_parsed_logs (device_sn);
CREATE INDEX IF NOT EXISTS idx_zk_parsed_logs_idx_matched ON zk_parsed_logs (matched);
CREATE INDEX IF NOT EXISTS idx_zk_parsed_logs_idx_raw_log_id ON zk_parsed_logs (raw_log_id);
CREATE INDEX IF NOT EXISTS idx_zk_parsed_logs_idx_school_time ON zk_parsed_logs (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_zk_parsed_logs_idx_status ON zk_parsed_logs (status);
CREATE INDEX IF NOT EXISTS idx_zk_parsed_logs_idx_table_name ON zk_parsed_logs (table_name);
CREATE INDEX IF NOT EXISTS idx_zk_parsed_logs_idx_user_id ON zk_parsed_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_zk_raw_logs_idx_created ON zk_raw_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_zk_raw_logs_idx_device_sn ON zk_raw_logs (device_sn);
CREATE INDEX IF NOT EXISTS idx_zk_raw_logs_idx_method ON zk_raw_logs (http_method);
CREATE INDEX IF NOT EXISTS idx_zk_raw_logs_idx_school_created ON zk_raw_logs (school_id, created_at);
CREATE INDEX IF NOT EXISTS idx_zk_user_mapping_idx_school ON zk_user_mapping (school_id);
CREATE INDEX IF NOT EXISTS idx_zk_user_mapping_idx_staff ON zk_user_mapping (staff_id);
CREATE INDEX IF NOT EXISTS idx_zk_user_mapping_idx_student ON zk_user_mapping (student_id);
CREATE INDEX IF NOT EXISTS idx_zk_user_mapping_uk_device_user ON zk_user_mapping (device_user_id, device_sn);
`;

export const SHELL_SCHEMA_TABLES: readonly string[] = [
  "academic_programs",
  "admission_audit",
  "admission_documents",
  "admissions",
  "attendance_acquisition_records",
  "attendance_acquisitions",
  "attendance_audit_logs",
  "attendance_boarding_policy",
  "attendance_daily_aggregates",
  "attendance_first_arrival_anchors",
  "attendance_first_arrival_health",
  "attendance_live_ui_settings",
  "attendance_logs",
  "attendance_processing_queue",
  "attendance_reconciliation",
  "attendance_reports",
  "attendance_rule_day_overrides",
  "attendance_sessions",
  "attendance_sms_decisions",
  "attendance_time_baselines",
  "attendance_time_corrections",
  "attendance_time_policy",
  "attendance_users",
  "audit_log",
  "audit_logs",
  "audit_purges",
  "auth_codes",
  "backup_chunks",
  "backup_parts",
  "backup_records",
  "balance_reminders",
  "biometric_devices",
  "biometric_enrollments",
  "biometric_enrollments_legacy",
  "biometric_face_enrollments",
  "biometric_mapping_history",
  "biometric_match_suggestions",
  "biometric_templates",
  "boarding_presence",
  "boarding_reports",
  "branches",
  "budgets",
  "class_teachers",
  "comm_dispatch_log",
  "comm_rules",
  "comm_settings",
  "comm_templates",
  "contacts",
  "control_audit_logs",
  "control_login_attempts",
  "control_sessions",
  "control_users",
  "counties",
  "curriculums",
  "custom_fields",
  "dahua_attendance_logs",
  "dahua_devices",
  "dahua_raw_logs",
  "dahua_sync_history",
  "daily_attendance",
  "deadline_reminder_log",
  "department_workplans",
  "device_access_logs",
  "device_alerts",
  "device_attendance_scopes",
  "device_clock_health",
  "device_configs",
  "device_connection_history",
  "device_directory_audit",
  "device_heartbeats",
  "device_inventory_runs",
  "device_log_sync_runs",
  "device_reconciliation_items",
  "device_reconciliation_runs",
  "device_school_hidden",
  "device_sync_checkpoints",
  "device_sync_logs",
  "device_sync_state",
  "device_transfers",
  "device_user_directory",
  "device_user_mappings",
  "device_users",
  "devices",
  "districts",
  "document_types",
  "documents",
  "drce_blocks",
  "drce_document_versions",
  "drce_starters",
  "dvcf_active_documents",
  "dvcf_documents",
  "enrollment_history",
  "enrollment_programs",
  "enrollment_sessions",
  "events",
  "exams",
  "expenditures",
  "feature_flags",
  "fee_assignment_log",
  "fee_clearance_exceptions",
  "fee_eligibility_rules",
  "fee_invoices",
  "fee_items",
  "fee_payment_allocations",
  "fee_payments",
  "fee_structures",
  "finance_account_transfers",
  "finance_accounts",
  "finance_actions",
  "finance_categories",
  "finance_fee_items",
  "finance_import_batches",
  "finance_import_rows",
  "finance_payments",
  "financial_reports",
  "fingerprint_orphans",
  "fingerprints",
  "holidays",
  "id_card_designs",
  "id_card_jobs",
  "import_errors",
  "import_sessions",
  "ingestion_conflict_policy",
  "ingestion_field_memory",
  "ingestion_orphans",
  "ingestion_runs",
  "initials_edit_history",
  "inventory_items",
  "inventory_transactions",
  "issuance_audit_log",
  "issuance_batches",
  "issuance_dedupe_keys",
  "issuance_items",
  "learner_fee_adjustments",
  "ledger",
  "ledger_accounts",
  "ledger_entries",
  "ledger_transactions",
  "lesson_attendance",
  "lesson_attendance_settings",
  "lesson_occurrences",
  "living_statuses",
  "manual_attendance_entries",
  "marks_migration_log",
  "marks_migration_policies",
  "migration_runs",
  "mobile_money_transactions",
  "name_repair_changes",
  "name_repair_sessions",
  "nationalities",
  "notification_deliveries",
  "notification_outbox",
  "notification_policies",
  "notification_preferences",
  "notification_queue",
  "notification_templates",
  "notifications",
  "orphan_statuses",
  "parent_accounts",
  "parent_otp_codes",
  "parent_sessions",
  "parent_student_links",
  "parents",
  "parishes",
  "passout_events",
  "passout_requests",
  "password_resets",
  "payment_reconciliations",
  "payroll_definitions",
  "pending_device_users",
  "platform_alerts",
  "platform_api_audit",
  "platform_api_keys",
  "platform_events",
  "platform_health_snapshots",
  "platform_idempotency_keys",
  "platform_invoices",
  "platform_jobs",
  "platform_payments",
  "platform_rate_limits",
  "platform_settings",
  "pocket_money_accounts",
  "pocket_money_transactions",
  "positions",
  "programs",
  "promotion_audit_log",
  "promotion_criteria",
  "promotions",
  "receipts",
  "relay_agents",
  "relay_commands",
  "reminders",
  "report_card_metrics",
  "report_card_overrides",
  "report_card_subjects",
  "report_cards",
  "report_comment_rules",
  "report_overall_comment_rules",
  "report_templates",
  "requirements_master",
  "result_submission_deadlines",
  "result_types",
  "results",
  "results_submission_log",
  "salary_payments",
  "schema_migrations",
  "school_info",
  "school_modules",
  "school_settings",
  "school_sms_routes",
  "school_theme_settings",
  "security_settings",
  "sentinel_alerts",
  "sentinel_diagnostics",
  "sentinel_heartbeats",
  "sentinel_incidents",
  "sentinel_observations",
  "settings",
  "shift_assignments",
  "shifts",
  "sms_allocations",
  "sms_provider_configs",
  "sms_provider_operations",
  "sms_school_prices",
  "sms_topups",
  "sms_usage_events",
  "staff_attendance",
  "staff_employment",
  "staff_qualifications",
  "staff_salaries",
  "staff_subject_specializations",
  "stores",
  "streams",
  "student_additional_info",
  "student_attendance",
  "student_component_results",
  "student_contacts",
  "student_curriculums",
  "student_custom_values",
  "student_documents",
  "student_education_levels",
  "student_family_status",
  "student_fee_items",
  "student_fingerprints",
  "student_generic_skills",
  "student_hafz_progress_summary",
  "student_history",
  "student_ledger",
  "student_next_of_kin",
  "student_parents",
  "student_profiles",
  "student_projects",
  "student_requirements",
  "study_modes",
  "subcounties",
  "subject_groups",
  "subject_report_order",
  "subject_weekly_periods",
  "subscription_plans",
  "system_errors",
  "system_logs",
  "tahfiz_attendance",
  "tahfiz_books",
  "tahfiz_custom_book_units",
  "tahfiz_custom_books",
  "tahfiz_enrollments",
  "tahfiz_evaluations",
  "tahfiz_global_books",
  "tahfiz_group_members",
  "tahfiz_groups",
  "tahfiz_plans",
  "tahfiz_portions",
  "tahfiz_quran_hizb",
  "tahfiz_quran_juz",
  "tahfiz_quran_pages",
  "tahfiz_quran_quarters",
  "tahfiz_quran_surahs",
  "tahfiz_records",
  "tahfiz_results",
  "tahfiz_school_books",
  "tahfiz_seven_metrics",
  "template_distributions",
  "timetable_entries",
  "timetable_periods",
  "user_notifications",
  "user_sessions",
  "villages",
  "visitation_cards",
  "visitation_events",
  "waivers_discounts",
  "wallets",
  "webhook_deliveries",
  "webhook_subscriptions",
  "workplans",
  "zk_attendance_logs",
  "zk_device_commands",
  "zk_device_logs",
  "zk_devices",
  "zk_parsed_logs",
  "zk_raw_logs",
  "zk_user_mapping"
];
