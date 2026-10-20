'use client';
/**
 * <MediaImg> — an <img> whose src is a DB image reference (people.photo_url, schools.logo_url …).
 *
 * Use it instead of <img> wherever the src comes from the database. It resolves the reference
 * through the shared media resolver (src/lib/media/client.ts), so the same page shows Cloudinary
 * images online and this machine's local copies offline — no page decides that itself.
 * Placeholders ('/default-avatar.png'), blob: previews and data: URIs pass through unchanged.
 */
import React from 'react';
import { useMediaSrc } from '@/lib/media/client';

export const MediaImg = React.forwardRef<HTMLImageElement, React.ImgHTMLAttributes<HTMLImageElement>>(
  function MediaImg({ src, ...rest }, ref) {
    const resolve = useMediaSrc();
    const resolved = typeof src === 'string' ? resolve(src) : src;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img ref={ref} src={resolved || undefined} {...rest} />;
  },
);
