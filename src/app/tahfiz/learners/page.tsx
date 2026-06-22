'use client';

/**
 * DEPRECATED page — the Tahfiz learner surface is now /tahfiz/participants
 * (enrollment-based, safe). This old page relied on /api/tahfiz/learners, which
 * hard-deleted student records. Redirect to the canonical page.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedTahfizLearnersPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/tahfiz/participants'); }, [router]);
  return (
    <div className="min-h-[40vh] flex items-center justify-center text-slate-400 text-sm">
      Redirecting to Tahfiz Participants…
    </div>
  );
}
