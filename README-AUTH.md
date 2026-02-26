# Excel Islamic School Authentication System

## Overview

The Excel Islamic School Authentication System provides a secure and flexible way to manage user identities, roles, and permissions. It is designed to support various authentication methods, including password-based and biometric authentication, and to integrate seamlessly with the Excel Islamic School platform.

## Features

- **Multi-Tenant Support**: Isolates data between different schools or organizations.
- **Role-Based Access Control**: Supports admin and user roles with customizable permissions.
- **Biometric Authentication**: Allows users to log in using biometric data (e.g., fingerprint, facial recognition).
- **Audit Logging**: Tracks user activities and admin actions for security and compliance.
- **Rate Limiting**: Protects against brute-force attacks and abuse of the authentication system.

## Database Schema

The authentication system requires the following database tables:

- `users`: Stores user information, including credentials, roles, and biometric data.
- `auth_logs`: (Optional) Stores logs of authentication attempts and other security-related events.

### Users Table

| Column Name        | Data Type | Description |
|--------------------|-----------|-------------|
| id                 | INT       | Primary key, auto-increment |
| full_name          | VARCHAR   | User's full name |
| email              | VARCHAR   | User's email address, unique |
| username            | VARCHAR   | User's username, unique |
| password_hash      | VARCHAR   | Hashed password |
| role               | ENUM      | User role (e.g., admin, teacher) |
| school_id          | INT       | Foreign key to schools table |
| biometric_key      | TEXT      | Encrypted biometric key data |
| biometric_enabled  | BOOLEAN   | Flag indicating if biometric login is enabled |
| passcode_hash      | TEXT      | Hashed passcode for additional security |
| two_factor_enabled | BOOLEAN   | Flag indicating if two-factor authentication is enabled |
| last_login         | DATETIME  | Timestamp of the last login |
| created_at         | DATETIME  | Timestamp of account creation |
| updated_at         | DATETIME  | Timestamp of last account update |

### Auth Logs Table (Optional)

| Column Name        | Data Type | Description |
|--------------------|-----------|-------------|
| id                 | BIGINT    | Primary key, auto-increment |
| user_id            | INT       | Foreign key to users table |
| action             | VARCHAR   | Action performed (e.g., login, logout, password_change) |
| ip_address         | VARCHAR   | IP address of the user |
| user_agent         | TEXT      | User agent string (browser, OS, etc.) |
| status             | ENUM      | Status of the action (e.g., success, failed) |
| additional_data    | JSON      | Any additional data related to the action |
| created_at         | DATETIME  | Timestamp of when the log was created |

## API Endpoints

### Authentication

- `POST /api/auth/register`: Register a new user (admin only).
- `POST /api/auth/login`: Log in a user and return access and refresh tokens.
- `POST /api/auth/logout`: Log out a user and invalidate tokens.
- `POST /api/auth/refresh`: Refresh access token using a valid refresh token.
- `POST /api/auth/setup-passcode`: Set up a passcode for the user.
- `POST /api/auth/enable-biometric`: Enable biometric authentication for the user.

### User Management (Admin)

- `GET /api/users`: Get a list of users (admin only).
- `GET /api/users/:id`: Get details of a specific user (admin only).
- `PUT /api/users/:id`: Update a user's information (admin only).
- `DELETE /api/users/:id`: Delete a user (admin only).

## Security

The Excel Islamic School Authentication System implements several security measures:

- **Password Security**: Passwords are hashed using bcryptjs with a cost factor of 10. Passwords must be at least 8 characters long.
- **JWT Security**: JSON Web Tokens (JWTs) are used for access and refresh tokens. Secrets for signing tokens should be long and random.
- **Rate Limiting**: Limits the number of login attempts from a single IP address to prevent brute-force attacks.
- **CORS**: Cross-Origin Resource Sharing (CORS) is configured to allow requests from trusted origins only.
- **HTTPS**: The system must be accessed over HTTPS to protect data in transit.

## Multi-Tenant Security

The system is designed to support multiple schools or organizations (tenants) using a single instance of the application. Key features include:

- **School-level data isolation**: Each school's data is stored separately and is not accessible to other schools.
- **Admin actions logged with school context**: Admin actions are logged with the associated school ID for accountability.

## Testing

### Manual Testing Plan

1. **User Registration & Login Flow**
```bash
# 1. Bootstrap first admin
curl -X PUT http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: your-admin-secret" \
  -d '{"full_name":"Admin User","email":"admin@test.com","username":"admin","password":"password123","school_id":1}'

# 2. Login as admin
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"admin@test.com","password":"password123"}'

# 3. Create regular user (use token from login)
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"full_name":"Test Teacher","email":"teacher@test.com","username":"teacher","password":"password123","role":"teacher","school_id":1}'
```

2. **Token Refresh Flow**
```bash
# Refresh token (uses HTTP-only cookie automatically)
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Cookie: refreshToken=YOUR_REFRESH_TOKEN"
```

3. **Security Features**
```bash
# Setup PIN
curl -X POST http://localhost:3000/api/auth/setup-passcode \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"passcode":"123456"}'

# Enable biometric
curl -X POST http://localhost:3000/api/auth/enable-biometric \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"biometric_key":"encrypted_key_data","device_name":"iPhone 14"}'
```

4. **Rate Limiting Test**
```bash
# Make 6+ failed login attempts to test rate limiting
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"identifier":"wrong@email.com","password":"wrongpass"}'
done
```

### Unit Test Structure

```javascript
// tests/auth.test.js
describe('Authentication System', () => {
  test('should create admin user with bootstrap secret', async () => {
    // Test admin creation
  });
  
  test('should login with valid credentials', async () => {
    // Test login flow
  });
  
  test('should refresh tokens correctly', async () => {
    // Test token refresh
  });
  
  test('should rate limit failed attempts', async () => {
    // Test rate limiting
  });
  
  test('should require admin role for user management', async () => {
    // Test role-based access
  });
});
```

## Troubleshooting

### Common Issues

1. **"Users table not found"**
   - Run the database migration to create required tables
   - Ensure your database connection is working

2. **"Missing JWT_SECRET"**
   - Add JWT_SECRET and REFRESH_SECRET to your .env.local file
   - Restart your development server

3. **"Biometric authentication not available"**
   - Add the biometric_key column: `ALTER TABLE users ADD COLUMN biometric_key TEXT NULL;`

4. **"Auth logs not working"**
   - Create the auth_logs table (optional but recommended)
   - Check file permissions for logs/ directory

5. Token refresh failing
   - Ensure cookies are enabled in your client
   - Check that HTTPS is enabled in production
   - Verify cookie domain/path settings

### Database Migration Script

```sql
-- Run this if you need to add missing columns
-- Check what exists first: DESCRIBE users;

-- Add missing auth columns if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS biometric_key TEXT NULL,
ADD COLUMN IF NOT EXISTS passcode_hash TEXT NULL,
ADD COLUMN IF NOT EXISTS last_login DATETIME NULL;

-- Create auth_logs table
CREATE TABLE IF NOT EXISTS auth_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT DEFAULT NULL,
  action VARCHAR(50) NOT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  user_agent TEXT DEFAULT NULL,
  status ENUM('success','failed','blocked','pending') DEFAULT 'success',
  additional_data JSON DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at)
);
```

## Production Deployment

### Environment Setup

```bash
# Production environment variables
NODE_ENV=production
JWT_SECRET=very-long-random-string-production
REFRESH_SECRET=another-very-long-random-string
ADMIN_SECRET=super-secure-admin-secret

# Database
DB_HOST=your-prod-db-host
DB_USER=your-db-user
DB_PASSWORD=secure-db-password
DB_NAME=drais_production

# Optional services
REDIS_URL=redis://your-redis-server:6379
SENDGRID_API_KEY=your-sendgrid-key
```

### Security Checklist

- [ ] Use HTTPS in production
- [ ] Set secure environment variables
- [ ] Enable Redis for rate limiting
- [ ] Configure proper CORS settings
- [ ] Set up database backups
- [ ] Monitor auth_logs for suspicious activity
- [ ] Implement proper session cleanup
- [ ] Configure firewall rules
- [ ] Set up log rotation for auth.log files

### Performance Recommendations

1. **Database Indexes**
   - Add indexes on frequently queried columns
   - Monitor slow query logs

2. **Caching**
   - Use Redis for rate limiting in production
   - Cache user permissions for better performance

3. **Monitoring**
   - Set up alerts for failed login spikes
   - Monitor token refresh rates
   - Track API response times

## Support

For issues with the authentication system:

1. Check the browser console for detailed error messages
2. Review server logs in the logs/ directory
3. Verify database table structure matches requirements
4. Test API endpoints directly with curl/Postman
5. Check environment variables are properly set

## Changelog

### v1.0.0
- Initial authentication system implementation
- JWT-based access and refresh tokens
- Role-based access control
- Biometric authentication support
- Comprehensive audit logging
- Rate limiting protection
- Multi-tenant school isolation