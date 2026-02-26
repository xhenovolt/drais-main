# Excel Islamic School Database Setup Guide

## Execution Order

Run the following files in this exact order:

1. **production_init.sql** - Complete schema with all fixes integrated
2. Optional patch files (only if needed for existing installations):
   - staff_table_fixes.sql
   - add_school_id.sql  
   - attendance_upgrade.sql
   - auth_migration.sql
   - auth_schema.sql
   - timetable_recurring_schema.sql
   - timetable.sql

## Fresh Installation

For new installations, only run:
```bash
mysql -u root -p < production_init.sql
```

## Existing Installation Upgrade

For existing Excel Islamic School installations, run patches in order:
```bash
mysql -u root -p drais_school < fixes/staff_table_fixes.sql
mysql -u root -p drais_school < add_school_id.sql
mysql -u root -p drais_school < attendance_upgrade.sql
mysql -u root -p drais_school < auth_migration.sql
```

## Verification

After setup, verify with:
```sql
USE drais_school;
SHOW TABLES;
SELECT COUNT(*) FROM users WHERE role = 'superadmin';
```

## Default Credentials

- Username: `admin`
- Password: `admin123`
- Email: `admin@excellslamicschool.edu`

**Change these immediately in production!**
