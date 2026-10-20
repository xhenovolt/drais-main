'use client';

import { useParams } from 'next/navigation';
import { RouteView, ReferenceHomeView } from '../Explorer';

/** /control/docs/routes/<route url> — one route of the real app, documented from its source. */
export default function Page() {
  const params = useParams<{ route?: string[] }>();
  const segs = (params?.route || []).map((s) => decodeURIComponent(s));
  if (!segs.length) return <ReferenceHomeView />;
  return <RouteView url={'/' + segs.join('/')} />;
}
