// ============================================================================
// src/lib/drce/styleResolver.ts
// Resolves DRCE theme + section style + node style into React inline CSS
// Cascade: theme defaults → section.style → node.style (most specific wins)
// ============================================================================

import type {
  DRCETheme,
  DRCEBannerStyle,
  DRCERibbonStyle,
  DRCEStudentInfoStyle,
  DRCEResultsTableStyle,
  DRCECommentsStyle,
  DRCEGradeTableStyle,
  DRCEHeaderStyle,
  DRCEColumnStyle,
} from './schema';
import type React from 'react';

// ─── Page ────────────────────────────────────────────────────────────────────

export function resolvePageStyle(theme: DRCETheme): React.CSSProperties {
  const { pageBorder: pb } = theme;
  return {
    fontFamily:  theme.fontFamily,
    fontSize:    theme.baseFontSize,
    background:  theme.pageBackground,
    padding:     theme.pagePadding,
    position:    'relative',
    ...(pb.enabled ? {
      border:       `${pb.width}px ${pb.style} ${pb.color}`,
      borderRadius: pb.radius,
    } : {}),
  };
}

// ─── Header ──────────────────────────────────────────────────────────────────

export function resolveHeaderStyle(style: DRCEHeaderStyle): React.CSSProperties {
  return {
    display:       'flex',
    alignItems:    'center',
    paddingBottom: style.paddingBottom,
    borderBottom:  style.borderBottom,
    opacity:       style.opacity,
    marginBottom:  8,
  };
}

// ─── Banner ──────────────────────────────────────────────────────────────────

export function resolveBannerStyle(
  theme: DRCETheme,
  style: DRCEBannerStyle,
): React.CSSProperties {
  return {
    backgroundColor: style.backgroundColor  ?? theme.primaryColor,
    color:           style.color            ?? '#ffffff',
    fontSize:        style.fontSize         ?? theme.baseFontSize + 4,
    fontWeight:      style.fontWeight       ?? 'bold',
    textAlign:       style.textAlign        ?? 'center',
    padding:         style.padding          ?? '8px',
    letterSpacing:   style.letterSpacing    ?? '0.1em',
    textTransform:   style.textTransform    ?? 'uppercase',
    borderRadius:    style.borderRadius     ?? 0,
    fontFamily:      theme.fontFamily,
  };
}

// ─── Ribbon ──────────────────────────────────────────────────────────────────

export function resolveRibbonContainerStyle(
  theme: DRCETheme,
  style: DRCERibbonStyle,
): React.CSSProperties {
  return {
    textAlign: style.textAlign ?? 'center',
    margin:    '8px 0',
  };
}

// ─── Student Info Box ─────────────────────────────────────────────────────────

export function resolveStudentInfoBoxStyle(style: DRCEStudentInfoStyle): React.CSSProperties {
  return {
    border:       style.border       ?? '1px dashed #999',
    borderRadius: style.borderRadius ?? 0,
    padding:      style.padding      ?? '8px',
    background:   style.background   ?? '#ffffff',
    marginBottom: 8,
  };
}

export function resolveStudentInfoLabelStyle(style: DRCEStudentInfoStyle): React.CSSProperties {
  return {
    color:      style.labelColor ?? '#555555',
    fontSize:   '0.85em',
    marginRight: 4,
  };
}

export function resolveStudentInfoValueStyle(style: DRCEStudentInfoStyle): React.CSSProperties {
  return {
    color:      style.valueColor       ?? '#B22222',
    fontWeight: style.valueFontWeight  ?? 'bold',
    fontSize:   style.valueFontSize    ?? 14,
  };
}

// ─── Results Table ────────────────────────────────────────────────────────────

export function resolveTableStyle(style: DRCEResultsTableStyle): React.CSSProperties {
  return {
    width:           '100%',
    borderCollapse:  'collapse',
    fontSize:        style.rowFontSize ?? 11,
    tableLayout:     'fixed',
  };
}

export function resolveTableHeaderCellStyle(
  style: DRCEResultsTableStyle,
  align: 'left' | 'center' | 'right' = 'center',
  colStyle?: DRCEColumnStyle,
): React.CSSProperties {
  return {
    background:    colStyle?.background ?? style.headerBackground ?? '#f2f2f2',
    border:        style.headerBorder   ?? '1px solid #333',
    padding:       style.padding        ?? 4,
    textAlign:     colStyle?.textAlign  ?? align,
    fontSize:      style.headerFontSize ?? 11,
    textTransform: style.headerTextTransform ?? 'uppercase',
    color:         colStyle?.color      ?? '#000000',
    fontWeight:    colStyle?.fontWeight ?? 'bold',
  };
}

export function resolveTableDataCellStyle(
  style: DRCEResultsTableStyle,
  align: 'left' | 'center' | 'right' = 'center',
  colStyle?: DRCEColumnStyle,
): React.CSSProperties {
  return {
    border:    style.rowBorder    ?? '1px solid #333',
    padding:   style.padding      ?? 4,
    textAlign: colStyle?.textAlign ?? align,
    fontSize:  style.rowFontSize  ?? 11,
    color:     colStyle?.color    ?? 'inherit',
    fontWeight: colStyle?.fontWeight ?? 'normal',
    fontStyle:  colStyle?.fontStyle  ?? 'normal',
    background: colStyle?.background,
  };
}

// ─── Comments ─────────────────────────────────────────────────────────────────

export function resolveCommentRibbonStyle(style: DRCECommentsStyle): React.CSSProperties {
  return {
    display:     'flex',
    alignItems:  'center',
    marginBottom: 4,
  };
}

export function resolveCommentTextStyle(style: DRCECommentsStyle): React.CSSProperties {
  return {
    color:     style.textColor     ?? '#0000FF',
    fontStyle: style.textFontStyle ?? 'italic',
    marginLeft: 8,
    flex:       1,
  };
}

// ─── Grade Table ──────────────────────────────────────────────────────────────

export function resolveGradeTableHeaderCellStyle(style: DRCEGradeTableStyle): React.CSSProperties {
  return {
    background:  style.headerBackground ?? '#f2f2f2',
    border:      style.border           ?? '1px solid #000',
    textAlign:   'center',
    padding:     3,
    fontSize:    10,
    fontWeight:  'bold',
  };
}

export function resolveGradeTableDataCellStyle(style: DRCEGradeTableStyle): React.CSSProperties {
  return {
    border:    style.border ?? '1px solid #000',
    textAlign: 'center',
    padding:   3,
    fontSize:  10,
  };
}
