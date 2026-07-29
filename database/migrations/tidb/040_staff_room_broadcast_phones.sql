-- Phase 5 notification fanout's own architecture comment
-- (src/lib/notifications/fanout.ts) already documented where staff_room
-- broadcast recipients should come from: comm_settings.staff_room_phones.
-- The column never existed, so a notification_policies row with
-- target_role='staff_room' silently resolved to zero recipients — an
-- admin could configure it and see no error, no message ever sent.
-- Comma-separated phone numbers, nullable, purely additive.
ALTER TABLE comm_settings ADD COLUMN IF NOT EXISTS staff_room_phones TEXT DEFAULT NULL;
