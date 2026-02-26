# DRAIS Finance Module - Complete Implementation Guide

## 📋 Overview

This document provides a comprehensive overview of the enhanced Finance Module implemented for the DRAIS School Management System.

---

## 🗂️ Database Schema

### New Tables Created

| Table | Description | Migration File |
|-------|-------------|----------------|
| `expenditures` | School expenditure tracking | `014_finance_complete_system.sql` |
| `waivers_discounts` | Fee waivers and discounts with approval tracking | `014_finance_complete_system.sql` |
| `balance_reminders` | Automated balance reminder tracking | `014_finance_complete_system.sql` |
| `mobile_money_transactions` | M-Pesa transaction tracking | `014_finance_complete_system.sql` |
| `ledger_accounts` | General ledger accounts | `014_finance_complete_system.sql` |
| `ledger_transactions` | General ledger transactions | `014_finance_complete_system.sql` |
| `ledger_entries` | General ledger entries | `014_finance_complete_system.sql` |
| `financial_reports` | Financial reports storage | `014_finance_complete_system.sql` |
| `fee_invoices` | Fee invoices | `014_finance_complete_system.sql` |
| `receipts` | Receipt tracking | `014_finance_complete_system.sql` |

### Enhanced Tables

| Table | New Columns |
|-------|------------|
| `fee_structures` | `section_id`, `academic_year`, `fee_type`, `is_mandatory`, `description`, `due_date`, `late_fee_amount` |
| `student_fee_items` | `section_id`, `academic_year`, `fee_structure_id`, `fee_type`, `due_date`, `late_fee`, `status`, `waived_by`, `waived_reason`, `approved_by`, `approved_at` |
| `fee_payments` | `fee_item_id`, `multi_term_ids`, `payment_status`, `gateway_reference`, `gateway_response`, `mpesa_receipt`, `phone_number`, `discount_type`, `discount_reason`, `approved_by`, `approved_at`, `receipt_url`, `invoice_url` |
| `receipts` | `qr_code_data`, `invoice_no`, `invoice_url`, `metadata` |
| `finance_categories` | `category_type`, `parent_id`, `is_system`, `color`, `icon`, `is_active` |

### Views Created

| View | Description |
|------|-------------|
| `income_statement` | Financial income statement by category |
| `balance_sheet` | School balance sheet with assets and liabilities |
| `fees_performance_by_class` | Fee collection performance by class |
| `fees_performance_by_section` | Fee collection performance by section (Day/Boarding) |
| `payment_trends` | Daily payment trends analysis |

---

## 🔌 API Endpoints

### Fees Ledger
- **GET** `/api/finance/ledger/fees` - Central fees ledger with filters

### Invoices
- **GET** `/api/finance/invoices` - Generate professional invoice PDF
- **POST** `/api/finance/invoices` - Create invoice record

### Expenditures
- **GET** `/api/finance/expenditures` - List expenditures with filters
- **POST** `/api/finance/expenditures` - Create expenditure
- **PUT** `/api/finance/expenditures` - Update expenditure
- **DELETE** `/api/finance/expenditures` - Soft delete expenditure

### Waivers & Discounts
- **GET** `/api/finance/waivers` - List waivers and discounts
- **POST** `/api/finance/waivers` - Create waiver/discount
- **PUT** `/api/finance/waivers` - Approve/reject waiver
- **DELETE** `/api/finance/waivers` - Delete waiver

### Financial Reports
- **GET** `/api/finance/reports/income-statement` - Income statement report
- **GET** `/api/finance/reports/balance-sheet` - Balance sheet report

### M-Pesa Integration
- **POST** `/api/finance/mpesa/stk-push` - Trigger STK push
- **GET** `/api/finance/mpesa/stk-push` - Check transaction status
- **POST** `/api/finance/mpesa/stk-push/callback` - M-Pesa callback handler

---

## 📄 Frontend Pages

| Page | Route | Description |
|------|-------|-------------|
| Fees Ledger | `/finance/ledger/fees` | Central view of all learners with fee status |
| Expenditures | `/finance/expenditures` | School expenditure management |
| Income Statement | `/finance/reports/income-statement` | Financial income statement |
| Balance Sheet | `/finance/reports/balance-sheet` | School balance sheet |

---

## 🔧 Key Features Implemented

### 1. Section-Based Fee Structures
- Support for Day and Boarding sections
- Academic year tracking
- Multiple fee types (tuition, uniform, transport, boarding, examination, activity, books)

### 2. Professional Receipts & Invoices
- QR code generation for verification
- Professional A4 format
- Thermal receipt support
- Amount in words conversion
- School branding integration

### 3. Central Fees Ledger
- View all students with fee balances
- Filter by class, section, term, status
- Send payment reminders
- Export to CSV

### 4. Expenditure Management
- Category-based tracking
- Vendor management
- Approval workflow
- Expense reporting

### 5. Waivers & Discounts
- Full or partial waivers
- Percentage or fixed discounts
- Approval tracking
- Reason documentation

### 6. M-Pesa Integration
- STK push support
- Callback handling
- Transaction tracking
- Payment reconciliation

### 7. Financial Reports
- Income Statement
- Balance Sheet
- Fee Performance by Class
- Fee Performance by Section
- Payment Trends

---

## 📱 Sidebar Navigation

Updated sidebar with new finance menu items:
- Wallets
- Fee Items
- Fees Ledger (NEW)
- Payments
- General Ledger
- Waivers & Discounts (NEW)
- Expenditures (NEW)
- Income Statement (NEW)
- Balance Sheet (NEW)
- Categories

---

## 🏗️ Installation Steps

### 1. Run Database Migration

```bash
mysql -u username -p database_name < database/migrations/014_finance_complete_system.sql
```

### 2. Start the Application

```bash
npm run dev
```

---

## 🔒 Security Considerations

- All endpoints require authentication
- Audit logging for financial transactions
- Approval workflow for waivers and expenditures
- Soft delete for data retention

---

## 📊 Performance Optimizations

- Database indexes on frequently queried columns
- Pagination for large datasets
- Efficient balance calculations
- Cached report views

---

## 🌍 Uganda-Specific Features

- UGX currency support
- M-Pesa integration
- Academic year (Sept-July) support
- Term-based fee structures
- Section-based (Day/Boarding) fee differentiation

---

## 📈 Future Enhancements

- Parent portal for fee viewing and payment
- SMS integration for payment notifications
- Advanced budgeting module
- Inventory-cost integration
- Multi-school support

---

## 📝 API Response Examples

### Fees Ledger Response
```json
{
  "success": true,
  "data": [...],
  "pagination": { "page": 1, "limit": 50, "total": 100, "pages": 2 },
  "summary": {
    "total_students": 100,
    "total_expected": 50000000,
    "total_collected": 35000000,
    "total_outstanding": 15000000
  }
}
```

### Payment Response
```json
{
  "success": true,
  "payment_id": 123,
  "receipt": {
    "receipt_no": "R-2024-000001",
    "download_url": "/api/finance/payments/123/receipt"
  }
}
```

---

## 🛠️ Troubleshooting

### Common Issues

1. **Receipt PDF Generation Fails**
   - Ensure `jspdf` and `qrcode` packages are installed
   - Check font configuration

2. **M-Pesa STK Push Not Working**
   - Verify M-Pesa credentials in environment variables
   - Check sandbox/live mode configuration

3. **Fee Balances Not Calculating**
   - Run database migration to add missing columns
   - Check trigger execution

---

## 📞 Support

For issues or questions, contact the development team.

---

**Version:** 2.0.0  
**Last Updated:** February 2024  
**Author:** DRAIS Development Team
