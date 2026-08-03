'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, GoTo, DefTable } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="recover-data">
      <p>
        Something has gone missing, or someone deleted the wrong thing. This is usually a two-minute fix, and
        this guide is the order to work through.
      </p>

      <h2>First: look in Trash</h2>

      <p>
        <strong>Almost nothing in DRAIS is deleted immediately.</strong> Removing a learner, class, subject,
        staff member or payment moves it to Trash, where an administrator can put it back.
      </p>

      <p><GoTo href="/admin/trash">Trash</GoTo></p>

      <DefTable
        rows={[
          ['Find it', <>Pick the type of thing that went missing and search by name.</>],
          ['Check it', <>Trash shows what was deleted, when, and by whom.</>],
          ['Restore it', <>The record returns with its history intact.</>],
        ]}
      />

      <Callout kind="tip" title="Check here before anything else">
        <p>
          When someone reports that a learner &quot;disappeared&quot;, this is the answer far more often than
          any other single cause — and it takes seconds to rule in or out.
        </p>
      </Callout>

      <h3>Permanent deletion</h3>

      <p>
        Emptying something permanently requires an administrator and an explicit confirmation, and DRAIS first
        shows what else would be affected — the reports, attendance and payments attached to it.
      </p>

      <Callout kind="warning">
        <p>
          Permanent deletion cannot be undone from within DRAIS. Unless you are clearing an obvious mistake —
          a duplicate, a test record — leave things in Trash. Trash costs you nothing.
        </p>
      </Callout>

      <h2>Second: check the audit log</h2>

      <p>
        If something changed rather than disappeared, the audit log tells you who changed it and when.
      </p>

      <p><GoTo href="/admin/audit-logs">Audit log</GoTo></p>

      <p>
        This is not only for investigating problems. It is what lets you answer a parent&apos;s question about
        a changed mark with a fact rather than an assurance.
      </p>

      <h2>Taking your own backup</h2>

      <p>
        The platform is backed up automatically. A backup you hold is different — it is your independent copy,
        for your own peace of mind, for a board that wants assurance, or for a handover.
      </p>

      <p><GoTo href="/backup">Backup</GoTo></p>

      <ul>
        <li>It covers your school only — never any other school&apos;s records.</li>
        <li>It is a standard database file, not a proprietary format.</li>
        <li>Large schools receive it in several parts, recombined before use.</li>
      </ul>

      <Callout kind="note" title="Keep the page open while it runs">
        <p>
          A backup is generated in steps. Closing the tab part-way leaves it unfinished — it will be visible
          and diagnosable, but nothing resumes it automatically, so start it when you can leave it alone for a
          few minutes.
        </p>
      </Callout>

      <h3>How often</h3>

      <p>
        Once a term is enough for most schools, taken at a natural boundary — after results are finalised, or
        at the end of term. Keep the file somewhere that is not the same laptop as everything else.
      </p>

      <Callout kind="warning" title="A backup contains real learner data">
        <p>
          Treat the file the way you would treat a filing cabinet of learner records. Do not email it, do not
          leave it on a shared machine, and do not upload it anywhere the school does not control.
        </p>
      </Callout>

      <h3>Restoring one</h3>

      <p>
        Restoring is a support operation rather than a button here. Contact DRAIS if you ever need to use a
        backup — and if you are considering it, do not make further changes in the meantime.
      </p>

      <h2>Corrections keep their history</h2>

      <p>Across DRAIS, a correction adds to the record rather than replacing it:</p>

      <ul>
        <li>A fingerprint credited to the wrong learner is re-pointed; the original scans are untouched.</li>
        <li>A payment entered wrongly is reversed with a correcting entry; both stay visible.</li>
        <li>Merging duplicate learners archives the record you did not keep rather than destroying it.</li>
        <li>Report cards already generated stay exactly as printed.</li>
      </ul>

      <Callout kind="success">
        <p>
          The point of all of this is simple: when someone asks your school to prove something — a parent, a
          board, an inspector — you can.
        </p>
      </Callout>

      <h2>What stays your responsibility</h2>

      <ul>
        <li><strong>Individual accounts.</strong> Shared logins destroy the audit trail.</li>
        <li><strong>Disable leavers the same day.</strong></li>
        <li><strong>Keep Super Admins to two.</strong></li>
        <li><strong>Take a termly backup</strong> and store it sensibly.</li>
        <li><strong>Look at the audit log occasionally</strong>, not only when something has gone wrong.</li>
      </ul>

      <p>
        See also <Link href="/help/guides/users-and-access">Staff accounts and access</Link>.
      </p>
    </HelpDoc>
  );
}
