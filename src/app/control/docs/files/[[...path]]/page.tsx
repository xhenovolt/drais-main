'use client';

import { useParams } from 'next/navigation';
import { FileView } from '../../routes/Explorer';

/** /control/docs/files/<repo path> — one source file, documented from its syntax tree. */
export default function Page() {
  const params = useParams<{ path?: string[] }>();
  const segs = (params?.path || []).map((s) => decodeURIComponent(s));
  return <FileView path={segs.join('/')} />;
}
