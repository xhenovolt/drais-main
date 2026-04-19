// src/components/drce/DRCEDocumentRenderer.tsx
// Renders a full DRCEDocument given data context + school info.
// Used for both live preview in the editor and final print output.
'use client';

import React from 'react';
import type { DRCEDocument, DRCEDataContext, DRCESection } from '@/lib/drce/schema';
import { resolvePageStyle } from '@/lib/drce/styleResolver';
import type { DRCERenderContext } from './types';

import { HeaderSection }      from './sections/HeaderSection';
import { BannerSection }      from './sections/BannerSection';
import { StudentInfoSection } from './sections/StudentInfoSection';
import { RibbonSection }      from './sections/RibbonSection';
import { ResultsTableSection } from './sections/ResultsTableSection';
import { AssessmentSection }  from './sections/AssessmentSection';
import { CommentsSection }    from './sections/CommentsSection';
import { GradeTableSection }  from './sections/GradeTableSection';
import { SpacerSection }      from './sections/SpacerSection';
import { DividerSection }     from './sections/DividerSection';

interface Props {
  document: DRCEDocument;
  dataCtx: DRCEDataContext;
  renderCtx: DRCERenderContext;
  /** Optional wrapper className for outer div */
  className?: string;
  /** Called when a section is clicked in editor mode */
  onSectionClick?: (sectionId: string) => void;
  /** ID of the currently selected section (highlights it) */
  selectedSectionId?: string | null;
}

function renderSection(
  section: DRCESection,
  doc: DRCEDocument,
  dataCtx: DRCEDataContext,
  renderCtx: DRCERenderContext,
) {
  const { theme } = doc;
  switch (section.type) {
    case 'header':       return <HeaderSection      key={section.id} section={section} theme={theme} ctx={renderCtx} />;
    case 'banner':       return <BannerSection      key={section.id} section={section} theme={theme} ctx={dataCtx} />;
    case 'student_info': return <StudentInfoSection key={section.id} section={section} theme={theme} ctx={dataCtx} />;
    case 'ribbon':       return <RibbonSection      key={section.id} section={section} theme={theme} ctx={dataCtx} />;
    case 'results_table':return <ResultsTableSection key={section.id} section={section} theme={theme} ctx={dataCtx} />;
    case 'assessment':   return <AssessmentSection  key={section.id} section={section} theme={theme} ctx={dataCtx} />;
    case 'comments':     return <CommentsSection    key={section.id} section={section} theme={theme} ctx={dataCtx} />;
    case 'grade_table':  return <GradeTableSection  key={section.id} section={section} theme={theme} />;
    case 'spacer':       return <SpacerSection      key={section.id} section={section} />;
    case 'divider':      return <DividerSection     key={section.id} section={section} />;
    default:             return null;
  }
}

export function DRCEDocumentRenderer({
  document,
  dataCtx,
  renderCtx,
  className,
  onSectionClick,
  selectedSectionId,
}: Props) {
  const { theme, watermark, sections } = document;
  const pageStyle = resolvePageStyle(theme);

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <div style={pageStyle} className={className}>
      {/* Watermark */}
      {watermark.enabled && (
        <div
          aria-hidden
          style={{
            position:  'absolute',
            inset:     0,
            display:   'flex',
            alignItems:    watermark.position === 'center' ? 'center' : 'flex-start',
            justifyContent: watermark.position === 'center' ? 'center' : 'flex-start',
            pointerEvents: 'none',
            zIndex: 0,
            overflow: 'hidden',
          }}
        >
          {watermark.type === 'text' ? (
            <span style={{
              color:       watermark.color,
              fontSize:    watermark.fontSize,
              opacity:     watermark.opacity,
              transform:   `rotate(${watermark.rotation}deg)`,
              fontWeight:  'bold',
              userSelect:  'none',
              whiteSpace:  'nowrap',
            }}>
              {watermark.content}
            </span>
          ) : watermark.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={watermark.imageUrl}
              alt={watermark.content}
              style={{
                opacity:   watermark.opacity,
                transform: `rotate(${watermark.rotation}deg)`,
                maxWidth:  '60%',
                maxHeight: '60%',
              }}
            />
          ) : null}
        </div>
      )}

      {/* Sections */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {sorted.map(section => {
          const rendered = renderSection(section, document, dataCtx, renderCtx);
          if (!rendered) return null;

          const isSelected = selectedSectionId === section.id;
          if (onSectionClick) {
            return (
              <div
                key={section.id}
                onClick={() => onSectionClick(section.id)}
                style={{
                  cursor: 'pointer',
                  outline: isSelected ? `2px solid #6366f1` : '2px solid transparent',
                  outlineOffset: 2,
                  borderRadius: 2,
                  transition: 'outline 0.1s',
                  marginTop: ((section as { style?: { spacingTop?: number } }).style?.spacingTop ?? 0) || undefined,
                  marginBottom: ((section as { style?: { spacingBottom?: number } }).style?.spacingBottom ?? 0) || undefined,
                }}
              >
                {rendered}
              </div>
            );
          }

          return <React.Fragment key={section.id}>{rendered}</React.Fragment>;
        })}
      </div>
    </div>
  );
}
