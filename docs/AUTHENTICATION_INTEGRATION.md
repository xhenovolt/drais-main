# Excel Islamic School Authentication System Integration Guide

## Overview

The Excel Islamic School authentication system provides enterprise-grade security with support for:
- Password-based authentication
- Biometric authentication (WebAuthn)
- Session management
- Role-based access control (RBAC)
- Rate limiting and account lockout
- Comprehensive audit logging

## API Endpoints

### 1. Login
**POST** `/api/auth/login`

**Request Body:**
```json
{
  "identifier": "user@example.com", // email or username
  "password": "userpassword",
  "rememberMe": false // optional
}
```

**Success Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "email": "user@example.com",
    "username": "username",
    "role": "teacher",
    "schoolId": 1,
    "biometricEnabled": false,
    "twoFactorEnabled": false,
    "lastLogin": "2024-01-01T10:00:00Z"
  },
  "session": {
    "id": "session-uuid",
    "expiresAt": "2024-01-02T10:00:00Z"
  }
}
```

### 2. Register User (Admin Only)
**POST** `/api/auth/register`

**Headers:**
