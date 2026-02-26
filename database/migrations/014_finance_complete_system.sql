-- =====================================================
-- DRAIS Finance Module - Complete Migration
-- Phase: Comprehensive Fees, Payments & Reporting
-- Date: 2026-02-09
-- =====================================================

-- Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- 1. ENHANCE fee_payments - Add missing columns
-- =====================================================
ALTER TABLE fee_payments ADD COLUMN discount_type ENUM('percentage','fixed') DEFAULT NULL AFTER method;
ALTER TABLE fee_payments ADD COLUMN discount_reason TEXT DEFAULT NULL AFTER discount_type;
ALTER TABLE fee_payments ADD COLUMN approved_by BIGINT DEFAULT NULL AFTER discount_reason;
ALTER TABLE fee_payments ADD COLUMN approved_at TIMESTAMP NULL DEFAULT NULL AFTER approved_by;
ALTER TABLE fee_payments ADD COLUMN receipt_url VARCHAR(255) DEFAULT NULL AFTER approved_at;
ALTER TABLE fee_payments ADD COLUMN invoice_url VARCHAR(255) DEFAULT NULL AFTER receipt_url;
ALTER TABLE fee_payments ADD COLUMN notes TEXT DEFAULT NULL AFTER invoice_url;

-- 2. ENHANCE finance_categories - Add missing columns
-- =====================================================
ALTER TABLE finance_categories ADD COLUMN category_type ENUM('income','expense','transfer') DEFAULT 'income' AFTER type;
ALTER TABLE finance_categories ADD COLUMN parent_id BIGINT DEFAULT NULL AFTER category_type;
ALTER TABLE finance_categories ADD COLUMN is_system TINYINT(1) DEFAULT 0 AFTER parent_id;
ALTER TABLE finance_categories ADD COLUMN color VARCHAR(20) DEFAULT '#3B82F6' AFTER is_system;
ALTER TABLE finance_categories ADD COLUMN icon VARCHAR(50) DEFAULT 'DollarSign' AFTER color;
ALTER TABLE finance_categories ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER icon;

-- 3. CREATE receipts TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS receipts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  student_id BIGINT DEFAULT NULL,
  payment_id BIGINT DEFAULT NULL,
  receipt_no VARCHAR(60) NOT NULL,
  invoice_no VARCHAR(60) DEFAULT NULL,
  amount DECIMAL(14,2) NOT NULL,
  payment_method VARCHAR(30) DEFAULT NULL,
  reference VARCHAR(120) DEFAULT NULL,
  payer_name VARCHAR(150) DEFAULT NULL,
  payer_contact VARCHAR(50) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  file_url VARCHAR(255) DEFAULT NULL,
  qr_code_data TEXT DEFAULT NULL,
  invoice_url VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_receipts_school (school_id),
  INDEX idx_receipts_student (student_id),
  INDEX idx_receipts_no (receipt_no),
  INDEX idx_receipts_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Receipt tracking';

-- 4. CREATE expenditures TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS expenditures (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  category_id BIGINT NOT NULL,
  wallet_id BIGINT DEFAULT NULL,
  amount DECIMAL(14,2) NOT NULL,
  description TEXT NOT NULL,
  vendor_name VARCHAR(150) DEFAULT NULL,
  vendor_contact VARCHAR(100) DEFAULT NULL,
  invoice_number VARCHAR(100) DEFAULT NULL,
  receipt_url VARCHAR(255) DEFAULT NULL,
  expense_date DATE DEFAULT NULL,
  status ENUM('pending','approved','paid','cancelled') DEFAULT 'pending',
  approved_by BIGINT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_expenditures_school (school_id),
  INDEX idx_expenditures_category (category_id),
  INDEX idx_expenditures_wallet (wallet_id),
  INDEX idx_expenditures_date (expense_date),
  INDEX idx_expenditures_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Expenditure tracking for school expenses';

-- 5. CREATE waivers_discounts TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS waivers_discounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  fee_item_id BIGINT DEFAULT NULL,
  waiver_type ENUM('full','partial') DEFAULT 'partial',
  discount_type ENUM('percentage','fixed') DEFAULT 'fixed',
  amount DECIMAL(14,2) NOT NULL,
  reason TEXT NOT NULL,
  approved_by BIGINT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  status ENUM('pending','approved','rejected') DEFAULT 'pending',
  rejection_reason TEXT DEFAULT NULL,
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_waivers_school (school_id),
  INDEX idx_waivers_student (student_id),
  INDEX idx_waivers_term (term_id),
  INDEX idx_waivers_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Fee waivers and discounts tracking';

-- 6. CREATE balance_reminders TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS balance_reminders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  reminder_type ENUM('email','sms','both') DEFAULT 'both',
  threshold_amount DECIMAL(14,2) DEFAULT NULL,
  message TEXT DEFAULT NULL,
  sent_at TIMESTAMP NULL DEFAULT NULL,
  status ENUM('pending','sent','failed') DEFAULT 'pending',
  response_data JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_reminders_school (school_id),
  INDEX idx_reminders_student (student_id),
  INDEX idx_reminders_status (status),
  INDEX idx_reminders_sent (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Balance reminder tracking';

-- 7. CREATE mobile_money_transactions TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS mobile_money_transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  student_id BIGINT DEFAULT NULL,
  transaction_type ENUM('deposit','withdrawal','payment','refund') DEFAULT 'payment',
  provider ENUM('mpesa','airtel','tigo','vodacom','other') DEFAULT 'mpesa',
  phone_number VARCHAR(20) DEFAULT NULL,
  amount DECIMAL(14,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'TZS',
  transaction_ref VARCHAR(100) DEFAULT NULL,
  conversation_id VARCHAR(100) DEFAULT NULL,
  original_transaction_id VARCHAR(100) DEFAULT NULL,
  transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('pending','processing','completed','failed','cancelled') DEFAULT 'pending',
  result_code VARCHAR(20) DEFAULT NULL,
  result_desc TEXT DEFAULT NULL,
  balance DECIMAL(14,2) DEFAULT NULL,
  receipt_url VARCHAR(255) DEFAULT NULL,
  metadata JSON DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_momo_school (school_id),
  INDEX idx_momo_student (student_id),
  INDEX idx_momo_provider (provider),
  INDEX idx_momo_status (status),
  INDEX idx_momo_ref (transaction_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Mobile money transaction tracking';

-- 8. CREATE ledger_accounts TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS ledger_accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  account_code VARCHAR(50) NOT NULL,
  account_name VARCHAR(150) NOT NULL,
  account_type ENUM('asset','liability','income','expense','equity') DEFAULT 'asset',
  account_subtype VARCHAR(50) DEFAULT NULL,
  parent_id BIGINT DEFAULT NULL,
  balance_type ENUM('debit','credit') DEFAULT 'debit',
  opening_balance DECIMAL(14,2) DEFAULT 0,
  current_balance DECIMAL(14,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'TZS',
  is_active TINYINT(1) DEFAULT 1,
  is_system TINYINT(1) DEFAULT 0,
  description TEXT DEFAULT NULL,
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ledger_school (school_id),
  INDEX idx_ledger_code (account_code),
  INDEX idx_ledger_type (account_type),
  INDEX idx_ledger_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='General ledger accounts';

-- 9. CREATE ledger_transactions TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS ledger_transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  transaction_no VARCHAR(50) NOT NULL,
  transaction_date DATE DEFAULT NULL,
  transaction_type ENUM('journal','payment','receipt','adjustment','transfer') DEFAULT 'journal',
  description TEXT DEFAULT NULL,
  reference_no VARCHAR(100) DEFAULT NULL,
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id BIGINT DEFAULT NULL,
  total_amount DECIMAL(14,2) DEFAULT 0,
  status ENUM('draft','posted','voided') DEFAULT 'draft',
  posted_by BIGINT DEFAULT NULL,
  posted_at TIMESTAMP NULL DEFAULT NULL,
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ltrx_school (school_id),
  INDEX idx_ltrx_no (transaction_no),
  INDEX idx_ltrx_date (transaction_date),
  INDEX idx_ltrx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='General ledger transactions';

-- 10. CREATE ledger_entries TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS ledger_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  transaction_id BIGINT NOT NULL,
  account_id BIGINT NOT NULL,
  entry_date DATE DEFAULT NULL,
  description TEXT DEFAULT NULL,
  debit_amount DECIMAL(14,2) DEFAULT 0,
  credit_amount DECIMAL(14,2) DEFAULT 0,
  balance_after DECIMAL(14,2) DEFAULT NULL,
  currency VARCHAR(10) DEFAULT 'TZS',
  reference_type VARCHAR(50) DEFAULT NULL,
  reference_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_lent_school (school_id),
  INDEX idx_lent_transaction (transaction_id),
  INDEX idx_lent_account (account_id),
  INDEX idx_lent_date (entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='General ledger entries';

-- 11. CREATE financial_reports TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS financial_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  report_type ENUM('income_statement','balance_sheet','cash_flow','fee_collection','expense_analysis','budget_variance') DEFAULT 'income_statement',
  report_name VARCHAR(150) DEFAULT NULL,
  report_period ENUM('daily','weekly','monthly','term','yearly') DEFAULT 'monthly',
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  term_id BIGINT DEFAULT NULL,
  report_data JSON DEFAULT NULL,
  generated_by BIGINT DEFAULT NULL,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('generating','completed','failed') DEFAULT 'completed',
  error_message TEXT DEFAULT NULL,
  INDEX idx_frep_school (school_id),
  INDEX idx_frep_type (report_type),
  INDEX idx_frep_period (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Financial reports storage';

-- 12. CREATE fee_invoices TABLE (NEW)
-- =====================================================
CREATE TABLE IF NOT EXISTS fee_invoices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  invoice_no VARCHAR(50) NOT NULL,
  student_id BIGINT NOT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  term_id BIGINT DEFAULT NULL,
  fee_structure_id BIGINT DEFAULT NULL,
  total_amount DECIMAL(14,2) DEFAULT 0,
  discount_amount DECIMAL(14,2) DEFAULT 0,
  waive_amount DECIMAL(14,2) DEFAULT 0,
  paid_amount DECIMAL(14,2) DEFAULT 0,
  balance_amount DECIMAL(14,2) DEFAULT 0,
  status ENUM('draft','issued','partial','paid','overdue','cancelled') DEFAULT 'draft',
  issue_date DATE DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_finv_school (school_id),
  INDEX idx_finv_student (student_id),
  INDEX idx_finv_status (status),
  INDEX idx_finv_no (invoice_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Fee invoices';

-- 13. ADD PERFORMANCE INDEXES
-- =====================================================
ALTER TABLE fee_payments ADD INDEX idx_fp_student (student_id);
ALTER TABLE fee_payments ADD INDEX idx_fp_status (payment_status);
ALTER TABLE fee_payments ADD INDEX idx_fp_date (created_at);

ALTER TABLE student_fee_items ADD INDEX idx_sfi_student (student_id);
ALTER TABLE student_fee_items ADD INDEX idx_sfi_status (status);

ALTER TABLE fee_structures ADD INDEX idx_fs_class (class_id);
ALTER TABLE fee_structures ADD INDEX idx_fs_year (academic_year);

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

-- Migration completed successfully
