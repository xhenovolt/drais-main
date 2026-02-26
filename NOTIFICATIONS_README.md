# Excel Islamic School Notifications System

A comprehensive real-time notifications system for Excel Islamic School with support for multiple channels, templates, and conversational triggers.

## Features

- ✅ Real-time in-app notifications via Socket.IO
- ✅ Multi-channel support (in-app, email, SMS, webhook)
- ✅ Template-based notifications with placeholders
- ✅ User preferences and do-not-disturb modes
- ✅ Notification queue with retry logic
- ✅ Conversational triggers (welcome, inactivity reminders)
- ✅ Full CRUD API with cursor pagination
- ✅ Responsive UI with animations
- ✅ Accessibility compliant

## Installation

### 1. Run Database Migration

```bash
mysql -u username -p password drais_school < database/migrations/001_create_notifications_system.sql
```

### 2. Install Dependencies

```bash
npm install socket.io socket.io-client date-fns
```

### 3. Configure Environment

```bash
# Add to .env
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
JWT_SECRET=your-secret-key
```

### 4. Start Socket Server

```bash
node server.js
```

### 5. Setup Cron Jobs

```bash
# Add to crontab
*/5 * * * * cd /path/to/drais && node workers/processNotifications.js
0 9 * * * cd /path/to/drais && node workers/conversationalTriggers.js
```

## Usage

### Creating Notifications

```typescript
import { NotificationService } from '@/lib/NotificationService';

const notificationService = NotificationService.getInstance();

// Direct notification
await notificationService.create({
  school_id: 1,
  actor_user_id: 123,
  action: 'exam_created',
  entity_type: 'exam',
  entity_id: 456,
  title: 'New Exam Scheduled',
  message: 'Midterm exam has been scheduled for next week',
  recipients: [1, 2, 3],
  priority: 'normal'
});

// Template-based notification
await notificationService.createFromTemplate(
  'student_enrolled',
  { student_name: 'John Doe', class_name: 'Grade 5' },
  [1, 2, 3],
  { school_id: 1 }
);
```

### Middleware Integration

```typescript
import { NotificationMiddleware } from '@/lib/middleware/notificationMiddleware';

// In your API endpoints
await NotificationMiddleware.notifyOnAction(req, {
  action: 'student_enrolled',
  entity_type: 'student',
  entity_id: studentId,
  school_id: schoolId,
  recipients: adminIds,
  metadata: { student_name: 'John Doe' }
});
```

## API Endpoints

- `GET /api/notifications/unread-count` - Get unread count
- `GET /api/notifications/list` - List notifications with pagination
- `POST /api/notifications/mark-read` - Mark notifications as read
- `POST /api/notifications/archive` - Archive notifications
- `POST /api/notifications/test` - Send test notification

## Troubleshooting

### Socket Connection Issues

1. Check that socket server is running on port 3001
2. Verify JWT token is being sent correctly
3. Check firewall/proxy settings

### Notifications Not Appearing

1. Verify database tables exist and have data
2. Check browser console for JavaScript errors
3. Ensure user has proper permissions

### Queue Not Processing

1. Check cron jobs are configured correctly
2. Verify database connection in worker scripts
3. Check log files for errors

## Performance Notes

- Notifications are paginated with cursor-based pagination
- Real-time updates use Socket.IO for efficiency
- Database indexes optimize query performance
- Queue processing handles rate limiting

## Security

- All notifications require proper authentication
- Multi-tenant isolation via school_id
- SQL injection protection via prepared statements
- XSS protection in frontend components
