// src/components/ProtectedRoute.tsx
// HOC to protect routes and ensure user is authenticated

'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: string;
  requiredRole?: string;
  requiredSetup?: boolean;
}

/**
 * ProtectedRoute Component
 * Wraps pages to ensure:
 * 1. User is authenticated (has valid session)
 * 2. User has required permission (if specified)
 * 3. User has required role (if specified)
 * 4. School setup is complete (if required)
 *
 * Usage:
 * <ProtectedRoute requiredPermission="user.create">
 *   <UserManagementPage />
 * </ProtectedRoute>
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredRole,
  requiredSetup = true,
}) => {
  const { user, isLoading, isAuthenticated, hasPermission, hasRole, setupComplete } =
    useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) {
      return; // Still loading session
    }

    // Check if authenticated
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }

    // Check if setup is required and complete
    if (requiredSetup && !setupComplete) {
      router.push('/setup');
      return;
    }

    // Check if user has required permission
    if (requiredPermission && !hasPermission(requiredPermission)) {
      router.push('/forbidden');
      return;
    }

    // Check if user has required role
    if (requiredRole && !hasRole(requiredRole)) {
      router.push('/forbidden');
      return;
    }
  }, [isLoading, isAuthenticated, user, setupComplete, requiredPermission, requiredRole, hasPermission, hasRole, router, requiredSetup]);

  // Show loading state while checking session
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  // Check authorization
  if (!isAuthenticated) {
    return null; // Redirect in useEffect above
  }

  if (requiredSetup && !setupComplete) {
    return null; // Redirect in useEffect above
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return null; // Redirect in useEffect above
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return null; // Redirect in useEffect above
  }

  return <>{children}</>;
};

export default ProtectedRoute;
