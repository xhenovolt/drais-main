'use client';
/**
 * What the signed-in Control Center operator may do, for any page to read:
 *
 *   const { can } = useControlAccess();
 *   {can('schools.edit') && <button …>}
 *
 * Hiding a control is a courtesy — every API route enforces the same
 * permission server-side (lib/control/guard), so a hidden button that someone
 * re-creates still gets a 403.
 */
import React, { createContext, useContext } from 'react';

export interface ControlAccessUser {
  id?: number; name?: string; email?: string; role?: string;
  permissions?: string[]; school_scope?: number[] | null; access_expires_at?: string | null;
}

interface ControlAccessValue {
  user: ControlAccessUser | null;
  can: (permission: string) => boolean;
  isSuperAdmin: boolean;
}

const Ctx = createContext<ControlAccessValue>({ user: null, can: () => false, isSuperAdmin: false });

export function ControlAccessProvider({ user, children }: { user: ControlAccessUser | null; children: React.ReactNode }) {
  const isSuperAdmin = user?.role === 'XHENVOLT_SUPER_ADMIN';
  const set = new Set(user?.permissions ?? []);
  const can = (p: string) => isSuperAdmin || set.has(p);
  return <Ctx.Provider value={{ user, can, isSuperAdmin }}>{children}</Ctx.Provider>;
}

export const useControlAccess = () => useContext(Ctx);

/** Renders children only when the operator holds the permission. */
export function Can({ permission, children, fallback = null }: { permission: string; children: React.ReactNode; fallback?: React.ReactNode }) {
  const { can } = useControlAccess();
  return <>{can(permission) ? children : fallback}</>;
}
