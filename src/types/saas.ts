// Multi-Tenant SaaS Type Definitions

// ============================================
// 1. SCHOOL/TENANT TYPES
// ============================================
export interface School {
  id: bigint;
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  logo_url?: string;
  website?: string;
  curriculum: string;
  country: string;
  timezone: string;
  setup_complete: boolean;
  setup_started_at?: Date;
  setup_completed_at?: Date;
  status: 'active' | 'inactive' | 'suspended';
  subscription_plan: string;
  subscription_status: 'active' | 'inactive' | 'trial' | 'expired';
  subscription_type: 'none' | 'trial' | 'monthly' | 'yearly';
  trial_ends_at?: Date;
  trial_start_date?: Date;
  trial_end_date?: Date;
  subscription_start_date?: Date;
  subscription_end_date?: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

// ============================================
// 2. USER TYPES
// ============================================
export interface User {
  id: bigint;
  school_id: bigint;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  avatar_url?: string;
  password_hash: string;
  is_active: boolean;
  is_verified: boolean;
  last_login_at?: Date;
  last_password_change?: Date;
  failed_login_attempts: number;
  locked_until?: Date;
  created_at: Date;
  updated_at: Date;
  deleted_at?: Date;
}

export interface UserWithRoles extends User {
  roles: Role[];
  permissions: Permission[];
}

// ============================================
// 3. ROLE TYPES
// ============================================
export interface Role {
  id: bigint;
  school_id: bigint;
  name: string;
  description?: string;
  role_type: 'system' | 'custom';
  is_super_admin: boolean;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

// ============================================
// 4. PERMISSION TYPES
// ============================================
export interface Permission {
  id: bigint;
  code: string;
  name: string;
  description?: string;
  category: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// ============================================
// 5. USER ROLE JUNCTION TYPES
// ============================================
export interface UserRole {
  id: bigint;
  user_id: bigint;
  role_id: bigint;
  is_active: boolean;
  assigned_by?: bigint;
  assigned_at: Date;
}

export interface RolePermission {
  id: bigint;
  role_id: bigint;
  permission_id: bigint;
  created_at: Date;
}

// ============================================
// 6. AUDIT LOG TYPES
// ============================================
export interface AuditLog {
  id: bigint;
  school_id: bigint;
  user_id?: bigint;
  action: string;
  entity_type: string;
  entity_id?: bigint;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  status: 'success' | 'failure';
  error_message?: string;
  created_at: Date;
}

// ============================================
// 7. AUTHENTICATION TYPES
// ============================================
export interface SignupRequest {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  school_name: string;
  phone?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: UserWithRoles;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

// ============================================
// 7.5 SESSION TYPES (Session-based auth)
// ============================================
export interface Session {
  id: bigint;
  user_id: bigint;
  school_id: bigint | null;
  session_token: string;
  expires_at: Date;
  ip_address?: string;
  user_agent?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface SessionContext {
  user: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    displayName: string;
    schoolId: number | null;
    isSuperAdmin: boolean;
  };
  schoolId: number;
  permissions: string[];
  roles: string[];
}

export interface TokenPayload {
  user_id: bigint | number;
  school_id: bigint | number | null;
  email: string;
  roles: string[];
  permissions: string[];
  iat: number;
  exp: number;
}

// ============================================
// 8. SETUP TYPES
// ============================================
export interface SchoolSetupData {
  school_id: bigint;
  name: string;
  address: string;
  phone: string;
  email: string;
  curriculum: string;
  country: string;
  timezone: string;
}

export interface SetupProgress {
  school_info: boolean;
  roles_created: boolean;
  first_class: boolean;
  first_student: boolean;
  setup_complete: boolean;
}

// ============================================
// 9. PERMISSION CHECK TYPES
// ============================================
export interface PermissionContext {
  user_id: bigint;
  school_id: bigint;
  roles: string[];
  permissions: string[];
  is_super_admin: boolean;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  required_permission?: string;
}

// ============================================
// 10. ERROR TYPES
// ============================================
export class AuthenticationError extends Error {
  constructor(message: string, public code: string = 'AUTH_ERROR') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error {
  constructor(
    message: string,
    public code: string = 'FORBIDDEN',
    public required_permission?: string
  ) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class TenantError extends Error {
  constructor(message: string, public code: string = 'TENANT_ERROR') {
    super(message);
    this.name = 'TenantError';
  }
}

// ============================================
// 11. API RESPONSE TYPES
// ============================================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    timestamp: string;
    request_id?: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
