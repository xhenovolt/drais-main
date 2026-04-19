// src/components/drce/editor/DrawingToolbar.tsx
// Horizontal tool strip shown above the canvas. Lets the user switch between
// Select, Arrow, Line, Rectangle, Ellipse, and Text drawing tools.
'use client';

import React from 'react';
import type { DrawTool } from '../canvas/ShapeCanvas';
import {
  MousePointer2, MoveUpRight, Minus, Square, Circle, Type, Trash2,
} from 'lucide-react';

interface ToolDef {
  id: DrawTool;
  label: string;
  shortcut: string;
  icon: React.ReactNode;
}

const TOOLS: ToolDef[] = [
  { id: 'select',  label: 'Select',    shortcut: 'V', icon: <MousePointer2 size={15} /> },
  { id: 'arrow',   label: 'Arrow',     shortcut: 'A', icon: <MoveUpRight   size={15} /> },
  { id: 'line',    label: 'Line',      shortcut: 'L', icon: <Minus         size={15} /> },
  { id: 'rect',    label: 'Rectangle', shortcut: 'R', icon: <Square        size={15} /> },
  { id: 'ellipse', label: 'Ellipse',   shortcut: 'E', icon: <Circle        size={15} /> },
  { id: 'text',    label: 'Text',      shortcut: 'T', icon: <Type          size={15} /> },
];

interface Props {
  activeTool: DrawTool;
  selectedShapeId: string | null;
  onToolChange: (t: DrawTool) => void;
  onDeleteShape: () => void;
}

export function DrawingToolbar({ activeTool, selectedShapeId, onToolChange, onDeleteShape }: Props) {
  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b bg-white dark:bg-slate-900 flex-shrink-0 select-none">
      {TOOLS.map((t, i) => (
        <React.Fragment key={t.id}>
          {i === 1 && <div className="w-px h-4 bg-gray-200 dark:bg-slate-600 mx-0.5" />}
          <button
            type="button"
            title={`${t.label} (${t.shortcut})`}
            onClick={() => onToolChange(t.id)}
            className={[
              'flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors',
              activeTool === t.id
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700',
            ].join(' ')}
          >
            {t.icon}
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        </React.Fragment>
      ))}

      {selectedShapeId && (
        <>
          <div className="w-px h-4 bg-gray-200 dark:bg-slate-600 mx-0.5" />
          <button
            type="button"
            title="Delete shape (Delete)"
            onClick={onDeleteShape}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 size={13} />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </>
      )}

      <div className="flex-1" />
      <span className="text-[10px] text-gray-400 hidden lg:block">
        Click + drag to draw · Click shape to select · Double-click text to edit
      </span>
    </div>
  );
}
