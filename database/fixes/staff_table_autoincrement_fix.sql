-- Fix for staff table: Add AUTO_INCREMENT and PRIMARY KEY to id column
-- Issue: Field 'id' doesn't have a default value
-- This is the MariaDB compatible version

-- Step 1: Add PRIMARY KEY if not exists (may fail if already exists, that's ok)
ALTER TABLE staff ADD PRIMARY KEY (id);

-- Step 2: Modify column to be AUTO_INCREMENT (MariaDB syntax)
ALTER TABLE staff MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT;

-- Step 3: Set the next auto increment value (get max id + 1)
ALTER TABLE staff AUTO_INCREMENT = (SELECT COALESCE(MAX(id), 0) + 1 FROM (SELECT id FROM staff) AS t);

-- Verify the changes
SHOW CREATE TABLE staff;

-- Check AUTO_INCREMENT value
SELECT AUTO_INCREMENT FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'staff';
