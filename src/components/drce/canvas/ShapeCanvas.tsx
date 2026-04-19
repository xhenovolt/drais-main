// src/components/drce/canvas/ShapeCanvas.tsx
// SVG canvas overlay for DRCE shape drawing. Positioned absolutely over the
// document renderer so shapes float above the report content.
'use client';

import React, { useRef, useState, useEffect } from 'react';
import type {
  DRCEShape, DRCERectShape, DRCEEllipseShape, DRCELineShape, DRCETextShape,
} from '@/lib/drce/schema';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DrawTool = 'select' | 'rect' | 'ellipse' | 'arrow' | 'line' | 'text';

type RectHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
type LineHandle = 'p1' | 'p2';
type HandleId = RectHandle | LineHandle;

type DragState =
  | null
  | { kind: 'drawing'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'moving';   id: string; orig: DRCEShape; sx: number; sy: number; cx: number; cy: number }
  | { kind: 'resizing'; id: string; orig: DRCEShape; handle: HandleId; sx: number; sy: number; cx: number; cy: number };

interface Props {
  shapes: DRCEShape[];
  activeTool: DrawTool;
  selectedShapeId: string | null;
  onAddShape: (s: DRCEShape) => void;
  onUpdateShape: (id: string, u: Partial<DRCEShape>) => void;
  onSelectShape: (id: string | null) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return 'sh_' + Math.random().toString(36).slice(2, 9); }

function getSVGPoint(e: React.MouseEvent | MouseEvent, svg: SVGSVGElement) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const t = pt.matrixTransform(ctm.inverse());
  return { x: t.x, y: t.y };
}

function getHandles(s: DRCEShape): { id: HandleId; cx: number; cy: number }[] {
  if (s.type === 'line' || s.type === 'arrow') {
    return [
      { id: 'p1', cx: (s as DRCELineShape).x1, cy: (s as DRCELineShape).y1 },
      { id: 'p2', cx: (s as DRCELineShape).x2, cy: (s as DRCELineShape).y2 },
    ];
  }
  const { x, y, w, h } = s as DRCERectShape | DRCEEllipseShape | DRCETextShape;
  return [
    { id: 'nw', cx: x,       cy: y       }, { id: 'n',  cx: x+w/2, cy: y       },
    { id: 'ne', cx: x+w,     cy: y       }, { id: 'e',  cx: x+w,   cy: y+h/2   },
    { id: 'se', cx: x+w,     cy: y+h     }, { id: 's',  cx: x+w/2, cy: y+h     },
    { id: 'sw', cx: x,       cy: y+h     }, { id: 'w',  cx: x,     cy: y+h/2   },
  ];
}

function handleCursor(h: HandleId) {
  switch (h) {
    case 'nw': case 'se': return 'nwse-resize';
    case 'ne': case 'sw': return 'nesw-resize';
    case 'n':  case 's':  return 'ns-resize';
    case 'e':  case 'w':  return 'ew-resize';
    default: return 'crosshair';
  }
}

/** Return the shape with drag delta visually applied (without mutating the store). */
function applyDrag(s: DRCEShape, drag: DragState): DRCEShape {
  if (!drag || drag.kind === 'drawing' || drag.id !== s.id) return s;
  const dx = drag.cx - drag.sx;
  const dy = drag.cy - drag.sy;

  if (drag.kind === 'moving') {
    if (s.type === 'line' || s.type === 'arrow') {
      const l = drag.orig as DRCELineShape;
      return { ...s, x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy } as DRCEShape;
    }
    const b = drag.orig as DRCERectShape;
    return { ...s, x: b.x + dx, y: b.y + dy } as DRCEShape;
  }

  if (drag.kind === 'resizing') {
    if (s.type === 'line' || s.type === 'arrow') {
      const l = drag.orig as DRCELineShape;
      if (drag.handle === 'p1') return { ...s, x1: l.x1 + dx, y1: l.y1 + dy } as DRCEShape;
      return { ...s, x2: l.x2 + dx, y2: l.y2 + dy } as DRCEShape;
    }
    const { x, y, w, h } = drag.orig as DRCERectShape;
    let [nx, ny, nw, nh] = [x, y, w, h];
    switch (drag.handle as RectHandle) {
      case 'nw': nx += dx; ny += dy; nw -= dx; nh -= dy; break;
      case 'n':             ny += dy;           nh -= dy; break;
      case 'ne':            ny += dy; nw += dx; nh -= dy; break;
      case 'e':                       nw += dx;           break;
      case 'se':                      nw += dx; nh += dy; break;
      case 's':                                 nh += dy; break;
      case 'sw': nx += dx;            nw -= dx; nh += dy; break;
      case 'w':  nx += dx;            nw -= dx;           break;
    }
    return { ...s, x: nx, y: ny, w: Math.max(nw, 10), h: Math.max(nh, 10) } as DRCEShape;
  }
  return s;
}

/** Build a ghost shape from the current draw drag state. */
function makeDraft(tool: DrawTool, x1: number, y1: number, x2: number, y2: number): DRCEShape | null {
  const mx = Math.min(x1, x2), my = Math.min(y1, y2);
  const w = Math.max(Math.abs(x2 - x1), 4), h = Math.max(Math.abs(y2 - y1), 4);
  switch (tool) {
    case 'rect':
      return { id: '__d', type: 'rect', x: mx, y: my, w, h, fill: 'rgba(79,70,229,0.08)', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, radius: 0, rotation: 0 };
    case 'ellipse':
      return { id: '__d', type: 'ellipse', x: mx, y: my, w, h, fill: 'rgba(79,70,229,0.08)', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, rotation: 0 };
    case 'arrow':
      return { id: '__d', type: 'arrow', x1, y1, x2, y2, stroke: '#ef4444', strokeWidth: 2, opacity: 1, dashed: false, endArrow: true, startArrow: false, arrowSize: 8 };
    case 'line':
      return { id: '__d', type: 'line', x1, y1, x2, y2, stroke: '#374151', strokeWidth: 2, opacity: 1, dashed: false, endArrow: false, startArrow: false, arrowSize: 8 };
    case 'text':
      return { id: '__d', type: 'text', x: mx, y: my, w: Math.max(w, 80), h: Math.max(h, 28), content: 'Text', fontSize: 14, color: '#1f2937', background: 'transparent', bold: false, italic: false, align: 'left', rotation: 0 };
    default: return null;
  }
}

// ─── Shape Renderer ───────────────────────────────────────────────────────────

function renderShapeEl(
  s: DRCEShape,
  isSelected: boolean,
  isDraft: boolean,
  onMouseDown: ((e: React.MouseEvent) => void) | undefined,
) {
  const selStroke = '#4f46e5';
  const moveCursor = isDraft ? 'crosshair' : 'move';

  if (s.type === 'rect') {
    return (
      <rect
        x={s.x} y={s.y} width={s.w} height={s.h}
        fill={s.fill} stroke={isSelected ? selStroke : s.stroke}
        strokeWidth={isSelected ? Math.max(s.strokeWidth, 1.5) : s.strokeWidth}
        strokeDasharray={isSelected ? '5 3' : undefined}
        rx={s.radius}
        opacity={s.opacity}
        style={{ cursor: moveCursor }}
        onMouseDown={onMouseDown}
      />
    );
  }
  if (s.type === 'ellipse') {
    return (
      <ellipse
        cx={s.x + s.w / 2} cy={s.y + s.h / 2}
        rx={s.w / 2} ry={s.h / 2}
        fill={s.fill} stroke={isSelected ? selStroke : s.stroke}
        strokeWidth={isSelected ? Math.max(s.strokeWidth, 1.5) : s.strokeWidth}
        strokeDasharray={isSelected ? '5 3' : undefined}
        opacity={s.opacity}
        style={{ cursor: moveCursor }}
        onMouseDown={onMouseDown}
      />
    );
  }
  if (s.type === 'line' || s.type === 'arrow') {
    const markId = `mkr_${s.id}`;
    const markStartId = `mkrs_${s.id}`;
    return (
      <g style={{ cursor: moveCursor }} onMouseDown={onMouseDown}>
        <defs>
          {s.endArrow && (
            <marker id={markId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={isSelected ? selStroke : s.stroke} />
            </marker>
          )}
          {s.startArrow && (
            <marker id={markStartId} markerWidth="10" markerHeight="7" refX="1" refY="3.5" orient="auto-start-reverse">
              <polygon points="0 0, 10 3.5, 0 7" fill={isSelected ? selStroke : s.stroke} />
            </marker>
          )}
        </defs>
        {/* Wide transparent hit area */}
        <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="transparent" strokeWidth={Math.max(s.strokeWidth + 8, 12)} />
        <line
          x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2}
          stroke={isSelected ? selStroke : s.stroke}
          strokeWidth={s.strokeWidth}
          strokeDasharray={s.dashed ? '6 3' : undefined}
          strokeLinecap="round"
          markerEnd={s.endArrow ? `url(#${markId})` : undefined}
          markerStart={s.startArrow ? `url(#${markStartId})` : undefined}
          opacity={s.opacity}
        />
      </g>
    );
  }
  if (s.type === 'text') {
    return (
      <g style={{ cursor: moveCursor }} onMouseDown={onMouseDown}>
        {s.background !== 'transparent' && s.background && (
          <rect x={s.x} y={s.y} width={s.w} height={s.h} fill={s.background} />
        )}
        {isSelected && (
          <rect x={s.x} y={s.y} width={s.w} height={s.h}
            fill="none" stroke={selStroke} strokeWidth={1.5} strokeDasharray="5 3" />
        )}
        <foreignObject x={s.x} y={s.y} width={s.w} height={s.h}>
          {/* @ts-expect-error xmlns needed for SVG foreignObject */}
          <div xmlns="http://www.w3.org/1999/xhtml"
            style={{
              width: '100%', height: '100%', padding: '2px 4px', boxSizing: 'border-box',
              fontSize: s.fontSize, color: s.color,
              fontWeight: s.bold ? 'bold' : 'normal',
              fontStyle: s.italic ? 'italic' : 'normal',
              textAlign: s.align,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              pointerEvents: 'none', userSelect: 'none',
            }}
          >
            {s.content || 'Text'}
          </div>
        </foreignObject>
      </g>
    );
  }
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ShapeCanvas({ shapes, activeTool, selectedShapeId, onAddShape, onUpdateShape, onSelectShape }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [textEditId, setTextEditId] = useState<string | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when entering text edit mode
  useEffect(() => {
    if (textEditId && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [textEditId]);

  function pt(e: React.MouseEvent) {
    return svgRef.current ? getSVGPoint(e, svgRef.current) : { x: 0, y: 0 };
  }

  function onSVGMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (activeTool === 'select') {
      // Clicking blank canvas deselects
      if ((e.target as SVGElement).hasAttribute('data-canvas-bg')) {
        onSelectShape(null);
      }
      return;
    }
    e.stopPropagation();
    const { x, y } = pt(e);
    setDrag({ kind: 'drawing', x1: x, y1: y, x2: x, y2: y });
  }

  function onSVGMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!drag) return;
    const { x, y } = pt(e);
    if (drag.kind === 'drawing') {
      setDrag({ ...drag, x2: x, y2: y });
    } else if (drag.kind === 'moving' || drag.kind === 'resizing') {
      setDrag({ ...drag, cx: x, cy: y });
    }
  }

  function onSVGMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    if (!drag) return;
    const { x, y } = pt(e);
    if (drag.kind === 'drawing') {
      commitDraw(drag.x1, drag.y1, x, y);
    } else if (drag.kind === 'moving') {
      const dx = x - drag.sx, dy = y - drag.sy;
      const orig = drag.orig;
      if (orig.type === 'line' || orig.type === 'arrow') {
        const l = orig as DRCELineShape;
        onUpdateShape(orig.id, { x1: l.x1 + dx, y1: l.y1 + dy, x2: l.x2 + dx, y2: l.y2 + dy } as Partial<DRCEShape>);
      } else {
        const b = orig as DRCERectShape;
        onUpdateShape(orig.id, { x: b.x + dx, y: b.y + dy } as Partial<DRCEShape>);
      }
    } else if (drag.kind === 'resizing') {
      const dx = x - drag.sx, dy = y - drag.sy;
      const orig = drag.orig;
      if (orig.type === 'line' || orig.type === 'arrow') {
        const l = orig as DRCELineShape;
        if (drag.handle === 'p1') onUpdateShape(orig.id, { x1: l.x1 + dx, y1: l.y1 + dy } as Partial<DRCEShape>);
        else onUpdateShape(orig.id, { x2: l.x2 + dx, y2: l.y2 + dy } as Partial<DRCEShape>);
      } else {
        const { x: bx, y: by, w: bw, h: bh } = orig as DRCERectShape;
        let [nx, ny, nw, nh] = [bx, by, bw, bh];
        switch (drag.handle as RectHandle) {
          case 'nw': nx += dx; ny += dy; nw -= dx; nh -= dy; break;
          case 'n':             ny += dy;           nh -= dy; break;
          case 'ne':            ny += dy; nw += dx; nh -= dy; break;
          case 'e':                       nw += dx;           break;
          case 'se':                      nw += dx; nh += dy; break;
          case 's':                                 nh += dy; break;
          case 'sw': nx += dx;            nw -= dx; nh += dy; break;
          case 'w':  nx += dx;            nw -= dx;           break;
        }
        onUpdateShape(orig.id, { x: nx, y: ny, w: Math.max(nw, 10), h: Math.max(nh, 10) } as Partial<DRCEShape>);
      }
    }
    setDrag(null);
  }

  function commitDraw(x1: number, y1: number, x2: number, y2: number) {
    const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1);
    if (dx < 5 && dy < 5) return; // accidental click

    const id = uid();
    const mx = Math.min(x1, x2), my = Math.min(y1, y2);
    const w = Math.max(Math.abs(x2 - x1), 10), h = Math.max(Math.abs(y2 - y1), 10);

    switch (activeTool) {
      case 'rect':
        onAddShape({ id, type: 'rect', x: mx, y: my, w, h, fill: 'transparent', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, radius: 0, rotation: 0 });
        break;
      case 'ellipse':
        onAddShape({ id, type: 'ellipse', x: mx, y: my, w, h, fill: 'transparent', stroke: '#4f46e5', strokeWidth: 2, opacity: 1, rotation: 0 });
        break;
      case 'arrow':
        onAddShape({ id, type: 'arrow', x1, y1, x2, y2, stroke: '#ef4444', strokeWidth: 2, opacity: 1, dashed: false, endArrow: true, startArrow: false, arrowSize: 8 });
        break;
      case 'line':
        onAddShape({ id, type: 'line', x1, y1, x2, y2, stroke: '#374151', strokeWidth: 2, opacity: 1, dashed: false, endArrow: false, startArrow: false, arrowSize: 8 });
        break;
      case 'text': {
        const shape: DRCETextShape = { id, type: 'text', x: mx, y: my, w: Math.max(w, 90), h: Math.max(h, 30), content: '', fontSize: 14, color: '#1f2937', background: 'transparent', bold: false, italic: false, align: 'left', rotation: 0 };
        onAddShape(shape);
        setTextEditId(id);
        setTextDraft('');
        break;
      }
    }
    onSelectShape(id);
  }

  function onShapeMouseDown(e: React.MouseEvent, shape: DRCEShape) {
    if (activeTool !== 'select') return;
    e.stopPropagation();
    if (textEditId && textEditId !== shape.id) commitTextEdit();
    onSelectShape(shape.id);
    const { x, y } = pt(e);
    setDrag({ kind: 'moving', id: shape.id, orig: structuredClone(shape), sx: x, sy: y, cx: x, cy: y });
  }

  function onHandleMouseDown(e: React.MouseEvent, shape: DRCEShape, handle: HandleId) {
    e.stopPropagation();
    const { x, y } = pt(e);
    setDrag({ kind: 'resizing', id: shape.id, orig: structuredClone(shape), handle, sx: x, sy: y, cx: x, cy: y });
  }

  function onShapeDblClick(shape: DRCEShape) {
    if (shape.type === 'text') {
      setTextEditId(shape.id);
      setTextDraft((shape as DRCETextShape).content);
    }
  }

  function commitTextEdit() {
    if (!textEditId) return;
    onUpdateShape(textEditId, { content: textDraft } as Partial<DRCEShape>);
    setTextEditId(null);
  }

  // Find the text shape being edited (for positioning the textarea)
  const editShape = textEditId ? shapes.find(s => s.id === textEditId) as DRCETextShape | undefined : undefined;

  const cursor = activeTool !== 'select' ? 'crosshair' : 'default';
  const draftShape = drag?.kind === 'drawing' ? makeDraft(activeTool, drag.x1, drag.y1, drag.x2, drag.y2) : null;
  const allShapes = shapes.map(s => applyDrag(s, drag));

  // SVG should receive pointer events in draw mode, or when shapes exist (for selection)
  const svgPointerEvents = activeTool !== 'select' || shapes.length > 0 ? 'all' : 'none';

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* SVG layer */}
      <svg
        ref={svgRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', cursor, pointerEvents: svgPointerEvents }}
        onMouseDown={onSVGMouseDown}
        onMouseMove={onSVGMouseMove}
        onMouseUp={onSVGMouseUp}
      >
        {/* Transparent background rect for click-to-deselect in select mode */}
        <rect
          data-canvas-bg="1"
          x={-9999} y={-9999} width={99999} height={99999}
          fill="transparent"
          style={{ pointerEvents: activeTool === 'select' ? 'all' : 'none' }}
          onClick={() => { if (activeTool === 'select') onSelectShape(null); }}
        />

        {/* Committed shapes */}
        {allShapes.map(s => {
          const isSelected = s.id === selectedShapeId && s.id !== '__d';
          const handles = isSelected ? getHandles(s) : [];
          return (
            <g key={s.id}>
              {renderShapeEl(s, isSelected, false,
                (e) => onShapeMouseDown(e, s),
              )}
              {/* Double-click for text edit */}
              {s.type === 'text' && (
                <rect
                  x={(s as DRCETextShape).x} y={(s as DRCETextShape).y}
                  width={(s as DRCETextShape).w} height={(s as DRCETextShape).h}
                  fill="transparent" style={{ cursor: 'text', pointerEvents: 'all' }}
                  onMouseDown={(e) => onShapeMouseDown(e, s)}
                  onDoubleClick={() => onShapeDblClick(s)}
                />
              )}
              {/* Resize handles */}
              {handles.map(h => (
                <circle
                  key={h.id}
                  cx={h.cx} cy={h.cy} r={5}
                  fill="white" stroke="#4f46e5" strokeWidth={1.5}
                  style={{ cursor: handleCursor(h.id), pointerEvents: 'all' }}
                  onMouseDown={(e) => { e.stopPropagation(); onHandleMouseDown(e, s, h.id); }}
                />
              ))}
            </g>
          );
        })}

        {/* Draft shape while drawing */}
        {draftShape && renderShapeEl(draftShape, false, true, undefined)}
      </svg>

      {/* Floating textarea for text shape editing */}
      {editShape && (
        <textarea
          ref={textareaRef}
          value={textDraft}
          onChange={e => setTextDraft(e.target.value)}
          onBlur={commitTextEdit}
          onKeyDown={e => { if (e.key === 'Escape') { setTextEditId(null); } }}
          style={{
            position: 'absolute',
            left: editShape.x,
            top: editShape.y,
            width: editShape.w,
            minHeight: editShape.h,
            padding: '2px 4px',
            fontSize: editShape.fontSize,
            color: editShape.color,
            fontWeight: editShape.bold ? 'bold' : 'normal',
            fontStyle: editShape.italic ? 'italic' : 'normal',
            textAlign: editShape.align,
            background: editShape.background === 'transparent' ? 'rgba(255,255,255,0.9)' : editShape.background,
            border: '2px solid #4f46e5',
            borderRadius: 2,
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            pointerEvents: 'all',
            zIndex: 20,
          }}
        />
      )}
    </div>
  );
}
