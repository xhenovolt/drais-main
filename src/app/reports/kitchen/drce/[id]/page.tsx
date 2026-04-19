// src/app/reports/kitchen/drce/[id]/page.tsx
// DRCE Editor Page — loads document by id and renders the 3-panel editor.
'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { DRCEDocument } from '@/lib/drce/schema';
import { DRCEEditor } from '@/components/drce/editor/DRCEEditor';
import { DRAIS_DEFAULT_DOCUMENT } from '@/lib/drce/defaults';

export default function DRCEEditorPage() {
  const params   = useParams();
  const router   = useRouter();
  const docId    = params.id as string;
  const isNew    = docId === 'new';

  const [doc, setDoc]       = useState<DRCEDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (isNew) {
      // Clone the default as a starting point
      setDoc(structuredClone(DRAIS_DEFAULT_DOCUMENT));
      setLoading(false);
      return;
    }

    fetch(`/api/dvcf/documents/${docId}`)
      .then(r => r.json())
      .then(data => {
        if (data.document) {
          setDoc(data.document as DRCEDocument);
        } else {
          setError('Document not found');
        }
      })
      .catch(() => setError('Failed to load document'))
      .finally(() => setLoading(false));
  }, [docId, isNew]);

  async function handleSave(updated: DRCEDocument): Promise<void> {
    const payload = {
      name:        updated.meta.name,
      description: '',
      schema_json: JSON.stringify(updated),
    };

    if (isNew) {
      const res = await fetch('/api/dvcf/documents', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...payload, document_type: updated.meta.report_type }),
      });
      const data = await res.json();
      if (data.id) {
        router.replace(`/reports/kitchen/drce/${data.id}`);
      }
    } else {
      await fetch(`/api/dvcf/documents/${docId}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 size={28} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <p className="text-red-500">{error ?? 'Unknown error'}</p>
        <Link href="/reports/kitchen" className="flex items-center gap-1 text-indigo-600 hover:underline text-sm">
          <ArrowLeft size={14} /> Back to Kitchen
        </Link>
      </div>
    );
  }

  return <DRCEEditor initial={doc} onSave={handleSave} />;
}
