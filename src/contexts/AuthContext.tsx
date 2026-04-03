"use client";
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { mutate as swrMutate } from 'swr';

// ============================================
// TYPE DEFINITIONS
// ============================================

interface Role {
  id: number;
  name: string;
  slug: string;
  isSuperAdmin: boolean;
}

interface School {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  schoolType?: string;
  logoUrl?: string;
  setupComplete: boolean;
}

interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
  phone?: string;
  avatarUrl?: string;
  schoolId: number | null;
  schoolName: string | null;
  school?: School | null;
  setupComplete: boolean;
  roles: Role[] | string[];
  permissions: string[];
  isSuperAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setupComplete: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string; setupComplete?: boolean }>;
  logout: () => Promise<void>;
  signup: (data: SignupData) => Promise<{ success: boolean; error?: string; pendingApproval?: boolean; redirectTo?: string }>;
  refreshUser: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  hasRole: (roleSlug: string) => boolean;
}

interface SignupData {
  firstName: string;
  lastName?: string;
  email: string;
  password: string;
  confirmPassword: string;
  schoolName?: string;
  schoolId?: number;
  phone?: string;
}

// ============================================
// CONTEXT
// ============================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// ============================================
// PROVIDER
// ============================================

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // ========================================
  // CHECK AUTHENTICATION
  // ========================================
  
  const checkAuth = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: {
          'Cache-Control': 'no-cache',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.user) {
          setUser(data.user);
          setSetupComplete(data.setupComplete ?? true);
          return data.user;
        }
      }
      
      // Clear user on auth failure
      setUser(null);
      setSetupComplete(true);
      return null;
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
      setSetupComplete(true);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // ========================================
  // CLIENT-SIDE ROUTE PROTECTION
  // ========================================
  
  useEffect(() => {
    // Skip route protection during initial load
    if (isLoading) return;

    // Define public routes that don't require authentication
    const publicRoutes = [
      '/',
      '/login',
      '/signup',
      '/auth/login',
      '/auth/signup',
      '/forgot-password',
      '/reset-password',
      '/unauthorized',
      '/forbidden',
      '/docs',
    ];

    // Check if current route is public
    const isPublicRoute = publicRoutes.some(route => 
      pathname === route || pathname.startsWith(route + '/')
    );

    // Check if it's a static asset
    const isStaticAsset = pathname.startsWith('/_next') || 
                         pathname.startsWith('/static') || 
                         pathname.includes('.');

    // If user is not authenticated and trying to access protected route
    if (!user && !isPublicRoute && !isStaticAsset) {
      console.log('🔒 Route protection: Redirecting to login from', pathname);
      router.push('/auth/login');
    }

    // If user is authenticated and trying to access login/signup, redirect to dashboard
    if (user && (pathname === '/login' || pathname === '/auth/login' || pathname === '/signup' || pathname === '/auth/signup')) {
      console.log('✅ Already authenticated: Redirecting to dashboard');
      router.push('/dashboard');
    }
  }, [user, isLoading, pathname, router]);

  // ========================================
  // LOGIN
  // ========================================
  
  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string; setupComplete?: boolean }> => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.success) {
        setUser(data.user);
        setSetupComplete(data.setupComplete ?? true);
        
        // Invalidate school-config cache so the new user's school data loads fresh
        await swrMutate('/api/school-config', undefined, { revalidate: true });
        
        // Redirect based on setup status
        if (!data.setupComplete) {
          router.push('/settings/school-setup');
        } else {
          router.push('/dashboard');
        }
        
        return { success: true, setupComplete: data.setupComplete };
      }

      return { 
        success: false, 
        error: data.error?.message || data.error || 'Login failed'
      };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error occurred. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  };

  // ========================================
  // SIGNUP
  // ========================================
  
  const signup = async (signupData: SignupData): Promise<{ success: boolean; error?: string; pendingApproval?: boolean; redirectTo?: string }> => {
    try {
      setIsLoading(true);
      
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(signupData)
      });

      const data = await response.json();

      if (data.success) {
        // If user was auto-logged in (first user creating school)
        if (data.user) {
          setUser(data.user);
          setSetupComplete(data.setupComplete ?? false);
          
          // Redirect to school setup
          if (data.redirectTo) {
            router.push(data.redirectTo);
          } else if (!data.setupComplete) {
            router.push('/settings/school-setup');
          } else {
            router.push('/dashboard');
          }
        }
        
        return { 
          success: true, 
          pendingApproval: data.pendingApproval,
          redirectTo: data.redirectTo
        };
      }

      return { 
        success: false, 
        error: data.error?.message || data.error || 'Signup failed'
      };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'Network error occurred. Please try again.' };
    } finally {
      setIsLoading(false);
    }
  };

  // ========================================
  // LOGOUT
  // ========================================
  
  const logout = async () => {
    try {
      // Clear user state immediately for instant UI update
      setUser(null);
      setSetupComplete(true);

      // Invalidate school-config SWR cache so next login loads fresh school data
      await swrMutate('/api/school-config', undefined, { revalidate: false });

      // Call logout API to invalidate session
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });

      // Redirect to login
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout error:', error);
      // Even if API fails, still clear state and redirect
      setUser(null);
      setSetupComplete(true);
      router.push('/auth/login');
    }
  };

  // ========================================
  // REFRESH USER
  // ========================================
  
  const refreshUser = async () => {
    await checkAuth();
  };

  // ========================================
  // PERMISSION HELPERS
  // ========================================
  
  const hasPermission = useCallback((permission: string): boolean => {
    if (!user) return false;
    
    // Super admin has all permissions
    if (user.isSuperAdmin || user.permissions.includes('*')) {
      return true;
    }
    
    return user.permissions.includes(permission);
  }, [user]);

  const hasRole = useCallback((roleSlug: string): boolean => {
    if (!user || !user.roles) return false;
    
    return user.roles.some((role) => {
      if (typeof role === 'string') {
        return role === roleSlug;
      }
      return role.slug === roleSlug;
    });
  }, [user]);

  // ========================================
  // RENDER
  // ========================================

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        setupComplete,
        login,
        logout,
        signup,
        refreshUser,
        hasPermission,
        hasRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
