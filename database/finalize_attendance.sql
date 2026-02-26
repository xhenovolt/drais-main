-- Attendance Feature Integration Fix
-- Create proper views using existing columns

DROP VIEW IF EXISTS `v_today_arrivals`;
DROP VIEW IF EXISTS `v_class_attendance_summary`;

-- View for real-time arrival tracking
CREATE VIEW `v_today_arrivals` AS
SELECT 
    da.school_id,
    da.person_id,
    s.admission_no as student_id_number,
    CONCAT(p.first_name, ' ', p.last_name) as student_name,
    cl.name as class_name,
    da.status,
    da.first_arrival_time,
    bd.location as device_location,
    CASE 
        WHEN da.is_late = TRUE THEN CONCAT(da.late_minutes, ' mins late')
        ELSE 'On time'
    END as arrival_status,
    da.arrival_device_id
FROM daily_attendance da
LEFT JOIN students s ON s.id = (
    SELECT id FROM students WHERE person_id = da.person_id AND person_type = 'student' LIMIT 1
)
LEFT JOIN people p ON da.person_id = p.id
LEFT JOIN classes cl ON s.class_id = cl.id
LEFT JOIN biometric_devices bd ON da.arrival_device_id = bd.id
WHERE DATE(da.attendance_date) = CURDATE() 
  AND da.person_type = 'student'
ORDER BY da.first_arrival_time DESC;

-- View for class attendance summary
CREATE VIEW `v_class_attendance_summary` AS
SELECT 
    c.school_id,
    c.id as class_id,
    c.name as class_name,
    COALESCE(DATE(da.attendance_date), CURDATE()) as attendance_date,
    COUNT(DISTINCT s.id) as total_students,
    SUM(CASE WHEN da.status IN ('present', 'late') THEN 1 ELSE 0 END) as present_count,
    SUM(CASE WHEN da.status = 'late' THEN 1 ELSE 0 END) as late_count,
    SUM(CASE WHEN da.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
    SUM(CASE WHEN da.status = 'excused' THEN 1 ELSE 0 END) as excused_count,
    ROUND(
        (SUM(CASE WHEN da.status IN ('present', 'late') THEN 1 ELSE 0 END) / 
         NULLIF(COUNT(DISTINCT s.id), 0)) * 100, 2
    ) as attendance_percentage,
    COUNT(DISTINCT CASE WHEN da.status IN ('present', 'late') THEN s.id END) as attending_today
FROM classes c
LEFT JOIN students s ON c.id = s.class_id 
LEFT JOIN daily_attendance da ON s.id = (
    SELECT person_id FROM daily_attendance 
    WHERE person_id = da.person_id 
    AND person_type = 'student' 
    AND attendance_date = CURDATE()
    LIMIT 1
)
WHERE c.school_id IS NOT NULL
GROUP BY c.school_id, c.id, c.name;

-- Ensure attendance_rules table has default rules
INSERT IGNORE INTO `attendance_rules` (
    `school_id`, 
    `rule_name`, 
    `rule_description`,
    `arrival_start_time`, 
    `arrival_end_time`, 
    `late_threshold_minutes`, 
    `absence_cutoff_time`, 
    `closing_time`, 
    `applies_to`, 
    `is_active`,
    `effective_date`
)
SELECT 
    s.id,
    'Default Student Rules',
    'Standard attendance rules for students',
    '06:00:00',
    '08:00:00',
    15,
    '09:00:00',
    '15:00:00',
    'students',
    TRUE,
    CURDATE()
FROM schools s
WHERE s.id NOT IN (
    SELECT DISTINCT school_id FROM attendance_rules 
    WHERE applies_to = 'students' AND is_active = TRUE
);

-- Add helpful comment to document the attendance feature
SELECT 'Attendance Management System Configuration Complete!' as status,
       'Available Views:' as info1,
       '  - v_today_arrivals: Real-time student arrivals' as info2,
       '  - v_class_attendance_summary: Class attendance summary' as info3,
       'Attendance Tables Active:' as info4,
       (SELECT COUNT(*) FROM attendance_logs) as total_attendance_logs,
       (SELECT COUNT(*) FROM daily_attendance WHERE DATE(attendance_date) = CURDATE()) as todays_records,
       (SELECT COUNT(*) FROM attendance_rules WHERE is_active = TRUE) as active_rules;
