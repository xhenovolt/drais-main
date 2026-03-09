/**
 * src/components/auth/ProtectedRoute.tsx
 * Wraps pages to enforce authentication and authorization
 * Redirects to login if not authenticated
 * Shows permission denied if user doesn't have required permission
 */

'use client';

import React, { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AlertCircle, Shield, Settings } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requiredPermission?: string | string[];
  requiredRole?: string | string[];
  onSetupIncomplete?: 'block' | 'allow' | 'redirect';
  fallback?: ReactNode;
}

/**
 * ProtectedRoute component
 * Usage: <ProtectedRoute requiredPermission="manage_students"><YourPage /></ProtectedRoute>
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requiredPermission,
  requiredRole,
  onSetupIncomplete = 'block',
  fallback,
}) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, isAuthenticated, setupComplete, hasPermission, hasRole } = useAuth();

  useEffect(() => {
    // Still loading session
    if (isLoading) {
      return;
    }

    // Not authenticated - redirect to login
    if (!isAuthenticated || !user) {
      const redirectPath = pathname !== '/' ? `?redirect=${encodeURIComponent(pathname)}` : '';
      router.push(`/auth/login${redirectPath}`);
      return;
    }

    // Check school setup if needed
    if (onSetupIncomplete === 'redirect' && !setupComplete) {
      router.push('/settings/school-setup');
      return;
    }
  }, [isLoading, isAuthenticated, user, router, setupComplete, onSetupIncomplete, pathname]);

  // Still loading
  if (isLoading) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Loading...</p>
          </div>
        </div>
      )
    );
  }

  // Not authenticated
  if (!isAuthenticated || !user) {
    return (
      fallback || (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-gray-500 text-sm">Redirecting to login...</p>
          </div>
        </div>
      )
    );
  }

  // School setup incomplete and blocking
  if (onSetupIncomplete === 'block' && !setupComplete) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-amber-50 to-orange-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-amber-100 rounded-full">
              <Settings className="w-10 h-10 text-amber-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Setup Required</h2>
          <p className="text-gray-600 mb-6">
            Your school setup is not complete. Please complete the setup process to access all features.
          </p>
          <a
            href="/settings/school-setup"
            className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Settings className="w-4 h-4 mr-2" />
            Complete Setup
          </a>
        </div>
      </div>
    );
  }

  // Check permission requirements
  const permissionArray = Array.isArray(requiredPermission) 
    ? requiredPermission 
    : requiredPermission 
      ? [requiredPermission] 
      : [];
  
  const hasRequiredPermission = permissionArray.length === 0 || 
    permissionArray.some(p => hasPermission(p));

  // Check role requirements
  const roleArray = Array.isArray(requiredRole) 
    ? requiredRole 
    : requiredRole 
      ? [requiredRole] 
      : [];
  
  const hasRequiredRole = roleArray.length === 0 || 
    roleArray.some(r => hasRole(r));

  // Permission or role denied
  if (!hasRequiredPermission || !hasRequiredRole) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-red-50 to-orange-50 px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-red-100 rounded-full">
              <Shield className="w-10 h-10 text-red-600" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Access Denied</h2>
          <p className="text-gray-600 mb-6">
            You do not have permission to access this resource. If you believe this is an error, please contact your administrator.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.back()}
              className="inline-flex items-center justify-center px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors"
            >
              Go Back
            </button>
            <a
              href="/dashboard"
              className="inline-flex items-center justify-center px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  // All checks passed - render children
  return <>{children}</>;
};

export default ProtectedRoute;
