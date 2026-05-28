"use client";
/**
 * Renders a single DRCEShape as a section. The wrapping div lets the section
 * pick up the standard wrapper style (position/left/top/width/height/zIndex),
 * so inside an `absolute` container the shape can be freely positioned, and
 * inside a `stack` / `row` container it flows like any other section.
 */
import React from 'react';
import type { DRCEShapeSection as Section } from '@/lib/drce/schema';
import { ShapePrimitive, shapeBounds } from '@/components/drce/canvas/ShapePrimitive';

export function ShapeSection({ section }: { section: Section }) {
  const b = shapeBounds(section.shape);
  // The wrapper sizes the SVG box; the section's own style.left/top (applied
  // by the renderer's getSectionWrapperStyle) handles positioning inside an
  // `absolute` container.
  return (
    <div style={{ width: b.w, height: b.h, display: 'inline-block' }} data-drce-shape={section.shape.id}>
      <ShapePrimitive shape={section.shape} fitContent />
    </div>
  );
}

import type { DRCESection } from '@/lib/drce/schema';
export function defaultShapeSection(): Omit<DRCESection, 'id' | 'order'> {
  return {
    type: 'shape', visible: true,
    shape: {
      id: `sh-${Date.now()}`, type: 'rect',
      x: 0, y: 0, w: 120, h: 60,
      fill: '#e0f2fe', stroke: '#0284c7', strokeWidth: 1,
      opacity: 1, radius: 6, rotation: 0,
    },
    style: {},
  } as Omit<DRCESection, 'id' | 'order'>;
}
