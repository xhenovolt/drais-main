'use client';
/**
 * P2 — Visual rule builder for per-section visibility.
 *
 * No-code editor that produces a VisibilityRule tree compatible with
 * src/lib/drce/visibility.ts. Renders the rule as a nested group/leaf
 * panel:
 *
 *   [AND ▾]  [NOT □]
 *     ├ student.custom.religion == "Islam"      [×]
 *     ├ student.gender != "M"                   [×]
 *     └ + add condition  |  + add group
 *
 * Bindings on the left side come from useAvailableBindings (static
 * catalogue + live custom-fields). Right side is either a literal or a
 * second binding path. Operators are filtered to those that make sense
 * given the chosen field's type when known.
 *
 * Saves on every change via onChange (controlled component). The editor
 * never mutates the rule in place — every change returns a fresh tree.
 */
import React from 'react';
import { Plus, Trash2, ChevronDown } from 'lucide-react';
import {
  type VisibilityRule, type RuleLeaf, type RuleGroup, type CompareOp,
  type RuleLiteral, blankLeaf, emptyRule, describeRule,
} from '@/lib/drce/visibility';
import { useAvailableBindings } from '@/components/drce/hooks/useAvailableBindings';

const OPS: { value: CompareOp; label: string; unary?: boolean }[] = [
  { value: '==',           label: 'equals' },
  { value: '!=',           label: 'not equal' },
  { value: '>',            label: 'greater than' },
  { value: '>=',           label: '≥' },
  { value: '<',            label: 'less than' },
  { value: '<=',           label: '≤' },
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'starts_with',  label: 'starts with' },
  { value: 'ends_with',    label: 'ends with' },
  { value: 'in',           label: 'in list' },
  { value: 'not_in',       label: 'not in list' },
  { value: 'between',      label: 'between' },
  { value: 'empty',        label: 'is empty', unary: true },
  { value: 'not_empty',    label: 'is not empty', unary: true },
];

interface Props {
  value:    VisibilityRule | null | undefined;
  onChange: (next: VisibilityRule | null) => void;
  /** Override the binding catalogue offered in the field dropdown. Omit to
   *  use the live DRCEDataContext catalogue (useAvailableBindings) — the
   *  original, section-visibility use case. Callers with a different, flatter
   *  binding root (e.g. the Intelligent Comment Engine's academic-summary
   *  context) pass their own list so the SAME nested AND/OR/NOT editor works
   *  against a different set of fields. */
  bindings?: ReturnType<typeof useAvailableBindings>;
}

export function VisibilityRuleEditor({ value, onChange, bindings: bindingsOverride }: Props) {
  // Hook must run unconditionally (Rules of Hooks); the override, when given,
  // simply wins over its result.
  const liveBindings = useAvailableBindings();
  const bindings = bindingsOverride ?? liveBindings;

  if (!value) {
    return (
      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-2">
        <p>This section is always visible. Add a rule to render it only for matching learners.</p>
        <button
          type="button"
          onClick={() => onChange(emptyRule())}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500"
        >
          <Plus size={12} /> Add visibility rule
        </button>
      </div>
    );
  }

  // Normalise: even a single leaf is wrapped in a top-level group for editing.
  const tree: RuleGroup = value.kind === 'group'
    ? value
    : { kind: 'group', op: 'AND', children: [value] };

  return (
    <div className="space-y-2">
      <div className="rounded border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/40 dark:bg-indigo-900/10 p-2">
        <GroupEditor node={tree} bindings={bindings} onChange={onChange} />
      </div>
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <span>Preview: <span className="font-mono">{describeRule(tree)}</span></span>
        <button type="button" onClick={() => onChange(null)} className="text-rose-500 hover:underline">
          Remove rule
        </button>
      </div>
    </div>
  );
}

// ─── Group node ─────────────────────────────────────────────────────────────

function GroupEditor({
  node, bindings, onChange,
}: {
  node:     RuleGroup;
  bindings: ReturnType<typeof useAvailableBindings>;
  onChange: (next: RuleGroup) => void;
}) {
  function patch(p: Partial<RuleGroup>) { onChange({ ...node, ...p }); }
  function patchChild(idx: number, next: VisibilityRule | null) {
    if (next === null) onChange({ ...node, children: node.children.filter((_, i) => i !== idx) });
    else               onChange({ ...node, children: node.children.map((c, i) => i === idx ? next : c) });
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <select
          value={node.op}
          onChange={e => patch({ op: e.target.value as 'AND' | 'OR' })}
          className="text-[11px] px-1.5 py-0.5 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
        >
          <option value="AND">ALL of (AND)</option>
          <option value="OR">ANY of (OR)</option>
        </select>
        <label className="inline-flex items-center gap-1 text-[11px] text-gray-500">
          <input
            type="checkbox" checked={Boolean(node.negate)}
            onChange={e => patch({ negate: e.target.checked })}
          /> NOT
        </label>
        <span className="text-[10px] text-gray-400 italic">{node.children.length} condition{node.children.length === 1 ? '' : 's'}</span>
      </div>

      <ul className="space-y-1.5 ml-1">
        {node.children.map((child, i) => (
          <li key={i} className="border-l-2 border-indigo-300 pl-2">
            {child.kind === 'compare' ? (
              <LeafEditor
                node={child} bindings={bindings}
                onChange={n => patchChild(i, n)}
              />
            ) : (
              <GroupEditor
                node={child} bindings={bindings}
                onChange={n => patchChild(i, n)}
              />
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={() => patch({ children: [...node.children, blankLeaf()] })}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-500"
        >
          <Plus size={11} /> condition
        </button>
        <button
          type="button"
          onClick={() => patch({ children: [...node.children, emptyRule()] })}
          className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 border border-indigo-300 text-indigo-600 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
        >
          <Plus size={11} /> group
        </button>
      </div>
    </div>
  );
}

// ─── Leaf node ──────────────────────────────────────────────────────────────

function LeafEditor({
  node, bindings, onChange,
}: {
  node:     RuleLeaf;
  bindings: ReturnType<typeof useAvailableBindings>;
  onChange: (next: VisibilityRule | null) => void;
}) {
  const opMeta = OPS.find(o => o.value === node.op) ?? OPS[0];
  const isUnary = Boolean(opMeta.unary);

  function patch(p: Partial<RuleLeaf>) { onChange({ ...node, ...p }); }
  function setRight(value: RuleLiteral) {
    patch({ right: { kind: 'literal', value } });
  }
  function setRightFromBinding(path: string) {
    patch({ right: { kind: 'binding', path } });
  }
  function switchOp(op: CompareOp) {
    const meta = OPS.find(o => o.value === op);
    if (meta?.unary) {
      patch({ op, right: undefined });
    } else if (!node.right) {
      patch({ op, right: { kind: 'literal', value: '' } });
    } else {
      patch({ op });
    }
  }

  const right = node.right;
  const rightIsBinding = right?.kind === 'binding';

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Left binding */}
      <select
        value={node.left}
        onChange={e => patch({ left: e.target.value })}
        className="text-[11px] px-1.5 py-0.5 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 max-w-[160px]"
      >
        <option value="">— pick field —</option>
        {bindings.map(b => (
          <option key={b.binding} value={b.binding}>{b.group}: {b.label}</option>
        ))}
      </select>

      {/* Operator */}
      <select
        value={node.op}
        onChange={e => switchOp(e.target.value as CompareOp)}
        className="text-[11px] px-1.5 py-0.5 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
      >
        {OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {/* Right operand (skipped for unary ops) */}
      {!isUnary && (
        <>
          <select
            value={rightIsBinding ? '__binding__' : '__literal__'}
            onChange={e => {
              if (e.target.value === '__binding__') setRightFromBinding('');
              else setRight('');
            }}
            className="text-[10px] px-1 py-0.5 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
            title="literal value or another binding"
          >
            <option value="__literal__">value</option>
            <option value="__binding__">binding</option>
          </select>
          {rightIsBinding ? (
            <select
              value={right!.kind === 'binding' ? right!.path : ''}
              onChange={e => setRightFromBinding(e.target.value)}
              className="text-[11px] px-1.5 py-0.5 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 max-w-[160px]"
            >
              <option value="">— pick field —</option>
              {bindings.map(b => (
                <option key={b.binding} value={b.binding}>{b.group}: {b.label}</option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={literalToInput(right?.kind === 'literal' ? right.value : '')}
              onChange={e => setRight(parseInputLiteral(e.target.value, node.op))}
              placeholder={
                node.op === 'in' || node.op === 'not_in' ? 'a, b, c'
                : node.op === 'between' ? 'min, max'
                : 'value'
              }
              className="text-[11px] px-1.5 py-0.5 border border-gray-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 w-[110px]"
            />
          )}
        </>
      )}

      {/* Remove leaf */}
      <button
        type="button" onClick={() => onChange(null)}
        className="p-0.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
        title="Remove condition"
      >
        <Trash2 size={11} />
      </button>
    </div>
  );
}

function literalToInput(v: RuleLiteral | undefined): string {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

function parseInputLiteral(raw: string, op: CompareOp): RuleLiteral {
  if (op === 'in' || op === 'not_in') {
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  if (op === 'between') {
    const parts = raw.split(',').map(s => Number(s.trim()));
    return [parts[0] ?? 0, parts[1] ?? 0];
  }
  const trimmed = raw.trim();
  if (trimmed === 'true')  return true;
  if (trimmed === 'false') return false;
  if (trimmed === '')      return '';
  // Don't auto-convert to number for `==` / `!=` so "S6" stays "S6".
  // Numeric ops will coerce on evaluation regardless.
  return raw;
}
