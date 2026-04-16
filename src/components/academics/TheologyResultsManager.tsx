"use client";
/**
 * TheologyResultsManager
 *
 * Zero-duplication wrapper. All logic lives in ClassResultsManager.
 * academicType="theology" isolates DB queries to theology records only.
 * UI is pixel-identical to the secular stream — only data differs.
 */
import ClassResultsManager from './ClassResultsManager';

export default function TheologyResultsManager() {
  return <ClassResultsManager academicType="theology" />;
}
