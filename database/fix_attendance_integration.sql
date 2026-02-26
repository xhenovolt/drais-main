-- Fix Attendance Feature Integration
-- Drop problematic views and recreate them with correct table references

DROP VIEW IF EXISTS `v_today_arrivals`;
DROP VIEW IF EXISTS `v_class_attendance_summary`;

-- Create views that work with the existing schema
CREATE OR REPLACE VIEW `v_today_arrivals` AS
SELECT 
    da.school_id,
    da.person_id,
    s.admission_no as person_id_number,
    CONCAT(p.first_name, ' ', p.last_name) as person_name,
    da.person_type,
    da.status,
    da.first_arrival_time,
    ar.arrival_end_time,
    CASE 
        WHEN da.first_arrival_time > ar.arrival_end_time THEN 
            TIMESTAMPDIFF(MINUTE, ar.arrival_end_time, da.first_arrival_time)
        ELSE 0
    END as late_minutes,
    bd.location_name as arrival_device_location
FROM daily_attendance da
LEFT JOIN students s ON da.person_id = s.id AND da.person_type = 'student'
LEFT JOIN people p ON s.person_id = p.id
LEFT JOIN biometric_devices bd ON da.arrival_device_id = bd.id
LEFT JOIN attendance_rules ar ON ar.school_id = da.school_id AND ar.is_active = TRUE
WHERE DATE(da.attendance_date) = CURDATE()
ORDER BY da.first_arrival_time DESC;

CREATE OR REPLACE VIEW `v_class_attendance_summary` AS
SELECT 
    c.school_id,
    c.id as class_id,
    c.class_name,
    DATE(da.attendance_date) as date,
    COUNT(DISTINCT s.id) as total_strength,
    SUM(CASE WHEN da.status IN ('present', 'late') THEN 1 ELSE 0 END) as present_count,
    SUM(CASE WHEN da.status = 'late' THEN 1 ELSE 0 END) as late_count,
    SUM(CASE WHEN da.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
    SUM(CASE WHEN da.status = 'excused' THEN 1 ELSE 0 END) as excused_count,
    ROUND(
        (SUM(CASE WHEN da.status IN ('present', 'late') THEN 1 ELSE 0 END) / 
         COUNT(DISTINCT s.id)) * 100, 2
    ) as attendance_percentage
FROM classes c
LEFT JOIN students s ON c.id = s.class_id
LEFT JOIN daily_attendance da ON s.id = da.person_id 
    AND da.person_type = 'student' 
    AND da.attendance_date = CURDATE()
WHERE c.is_active = TRUE
GROUP BY c.school_id, c.id, c.class_name, DATE(da.attendance_date);

-- Add sample attendance rules if none exist
INSERT IGNORE INTO `attendance_rules` (
    `school_id`, `rule_name`, `arrival_start_time`, `arrival_end_time`, 
    `late_threshold_minutes`, `absence_cutoff_time`, `closing_time`, `applies_to`, `is_active`
)
SELECT 
    `id`, 'Student Standard Rules', '06:00:00', '08:00:00', 
    15, '09:00:00', '15:00:00', 'students', TRUE
FROM `schools`
WHERE NOT EXISTS (
    SELECT 1 FROM attendance_rules WHERE school_id = schools.id
)
LIMIT 5;

-- Create index on schools.id if not exists
ALTER TABLE `attendance_rules` ADD KEY `idx_school_id` (`school_id`);

-- Verify attendance tables exist and have proper structure
SELECT 'Attendance tables status:' as result;

SELECT 
    TABLE_NAME,
    TABLE_ROWS,
    DATA_FREE,
    ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) AS 'Size(MB)'
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'drais_school' 
AND TABLE_NAME LIKE 'attendance%' OR TABLE_NAME LIKE 'device_%' OR TABLE_NAME LIKE 'biometric%' OR TABLE_NAME LIKE 'daily_%'
ORDER BY TABLE_NAME;

-- Summary
SELECT CONCAT(
    'Attendance Management System integrated successfully!\n',
    'Total Attendance Tables: ', 
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES 
     WHERE TABLE_SCHEMA = 'drais_school' 
     AND (TABLE_NAME LIKE 'attendance%' OR TABLE_NAME LIKE 'device_%' OR TABLE_NAME = 'biometric_devices' OR TABLE_NAME LIKE 'daily_%')),
    '\nViews Created: v_today_arrivals, v_class_attendance_summary'
) as 'Integration Complete';
