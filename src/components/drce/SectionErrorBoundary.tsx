'use client';
/**
 * Phase 0 fix — error boundary used around every memoised section and
 * around the renderer as a whole. Before this, a single throw from any
 * section component (bad binding, malformed shape, undefined cell ref,
 * formula explosion) would white-screen the entire editor and 500 the
 * print route. Now the bad section renders a small inline fallback and
 * the rest of the document keeps working.
 *
 * The boundary is intentionally minimal: no logging stack, no toast, no
 * dependency on the editor state. It must be safe to render under
 * renderToStaticMarkup for the print path.
 */
import React from 'react';

interface Props {
  /** Optional label shown in the inline fallback so the user can identify
   *  which section failed without opening devtools. */
  label?: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class SectionErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep the log lightweight — verbose stacks during print-render spam logs.
    // eslint-disable-next-line no-console
    console.error('[DRCE] section render failed:', this.props.label ?? '', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          style={{
            border:     '1px dashed #f59e0b',
            background: '#fef3c7',
            color:      '#92400e',
            padding:    '8px 10px',
            fontSize:   11,
            lineHeight: 1.4,
            borderRadius: 4,
            margin:     '4px 0',
          }}
        >
          <strong>Section failed to render{this.props.label ? ` (${this.props.label})` : ''}.</strong>{' '}
          <span style={{ opacity: 0.8 }}>{this.state.error.message}</span>
        </div>
      );
    }
    return this.props.children;
  }
}
