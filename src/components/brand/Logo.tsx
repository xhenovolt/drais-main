'use client';

/**
 * Shared DRAIS product-logo components. Use these instead of hardcoding
 * logo paths so a brand refresh only touches draisBrand.ts + the generator.
 *
 *  - <BrandBadge>  : the square icon mark on a white rounded chip, so it reads
 *                    crisply on BOTH light and dark chrome (the mark is navy +
 *                    teal, which would sink into a dark sidebar without a chip).
 *  - <BrandLockup> : badge + "DRAIS" wordmark text (for sidebar/topbar).
 *  - <BrandWordmark>: the full vertical icon+DRAIS image (for splash/login).
 */
import Image from 'next/image';
import { draisBrand } from '@/lib/brand/draisBrand';

export function BrandBadge({ size = 32, className = '' }: { size?: number; className?: string }) {
  const inner = Math.round(size * 0.8);
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-white ring-1 ring-black/5 shadow-sm flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image src={draisBrand.icon} alt={draisBrand.appName} width={inner} height={inner} priority />
    </span>
  );
}

export function BrandLockup({
  size = 32,
  subtitle,
  className = '',
}: { size?: number; subtitle?: string | null; className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 min-w-0 ${className}`}>
      <BrandBadge size={size} />
      <span className="min-w-0">
        <span className="block font-bold text-foreground text-sm leading-tight">{draisBrand.appName}</span>
        {subtitle ? (
          <span className="block text-xs text-muted-foreground truncate leading-tight">{subtitle}</span>
        ) : null}
      </span>
    </span>
  );
}

export function BrandWordmark({
  width = 200,
  height = 200,
  className = '',
  priority = false,
}: { width?: number; height?: number; className?: string; priority?: boolean }) {
  return (
    <Image src={draisBrand.splash} alt={draisBrand.appName} width={width} height={height} className={className} priority={priority} />
  );
}
