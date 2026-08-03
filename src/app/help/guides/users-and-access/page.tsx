'use client';

import React from 'react';
import Link from 'next/link';
import HelpDoc, { Callout, Steps, Step, GoTo, DefTable } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="users-and-access">
      <p>
        Everyone who signs in is a user, and what they can do comes from their role. Getting this right early
        is worth the twenty minutes, because taking access away later is harder than granting it.
      </p>

      <h2>Users, roles and permissions</h2>

      <DefTable
        rows={[
          ['User', <>One person with a sign-in.</>],
          ['Role', <>A named job — Teacher, Bursar, Director of Studies — carrying a set of permissions. You give people roles, not individual permissions.</>],
          ['Permission', <>One specific ability, such as viewing results or recording a payment.</>],
        ]}
      />

      <h2>Adding a staff member</h2>

      <Steps>
        <Step title="Create their staff record">
          <p>Name, job, contact details.</p>
          <p><GoTo href="/admin/staff">Staff</GoTo></p>
        </Step>
        <Step title="Create their user account">
          <p>They set their own password on first sign-in.</p>
          <p><GoTo href="/admin/users">Users</GoTo></p>
        </Step>
        <Step title="Assign a role">
          Pick the closest built-in role; adjust if their job does not fit neatly.
        </Step>
        <Step title="Have them sign in once while you are there">
          Ten seconds now prevents a support call in the middle of mark entry week.
        </Step>
      </Steps>

      <h2>The built-in roles</h2>

      <DefTable
        rows={[
          ['Super Admin', <>Everything, including managing users. <strong>Keep this to two people</strong> — one means being locked out when they are away.</>],
          ['Admin', <>Day-to-day administration, without user management.</>],
          ['Director of Studies', <>Academics: subjects, exams, marks, report cards.</>],
          ['Teacher', <>Their classes: marks, attendance, learner profiles.</>],
          ['Bursar', <>Finance: fee structures, payments, receipts, balances.</>],
          ['Receptionist', <>Admissions and front desk, without finance or results.</>],
        ]}
      />

      <p>All of these can be adjusted, and you can create your own.</p>

      <p><GoTo href="/admin/roles">Roles</GoTo></p>

      <h2>Building a role</h2>

      <p>
        Permissions are shown as a tree grouped by area. Most areas have a <strong>view</strong> and a
        <strong> manage</strong> permission — view lets someone look, manage lets them change.
      </p>

      <Callout kind="tip" title="Grant a whole area rather than ticking boxes">
        <p>
          Granting an entire area means the role automatically gains any new ability added to that area later —
          usually what you meant when you decided &quot;the bursar handles finance&quot;.
        </p>
      </Callout>

      <p>
        A genuinely useful custom role is one with <em>view</em> across several areas and <em>manage</em> in
        none, for a deputy who needs oversight rather than control.
      </p>

      <h2>Three rules that save trouble</h2>

      <h3>Start narrow</h3>
      <p>
        Give the minimum that lets someone do their job and widen when they ask. Start wide and nobody ever
        asks — you find out the scale of the access during an incident.
      </p>

      <h3>Separate money from marks</h3>
      <p>
        The person entering results and the person recording payments should rarely be the same login. Ordinary
        good practice, and easy here.
      </p>

      <h3>Never share an account</h3>
      <p>
        A shared staffroom login destroys the audit trail — every action becomes &quot;someone&quot;.
        Individual accounts cost nothing and are the difference between knowing who changed a mark and
        guessing.
      </p>

      <Callout kind="warning" title="When a staff member leaves">
        <p>
          Disable their account the same day. Everything they entered remains; only the ability to sign in
          ends. <strong>Do not delete the user</strong> — that would obscure the history of what they did.
        </p>
      </Callout>

      <h2>Modules — a separate control</h2>

      <p>Alongside permissions, DRAIS has optional modules such as Tahfiz, Payroll and Examinations.</p>

      <DefTable
        rows={[
          ['Permission', <>Is this person allowed to do it?</>],
          ['Module', <>Does this school have it at all?</>],
        ]}
      />

      <Callout kind="note">
        <p>
          A module that is not enabled is unavailable to <em>everyone</em>, Super Admins included. Modules
          reflect what the school has, not how senior the person is. If a member of staff cannot see something
          and their role looks correct, check the module.
        </p>
        <p><GoTo href="/settings/modules">Modules</GoTo></p>
      </Callout>

      <h2>The audit log</h2>

      <p>
        Who did what, when, and from where. Use it when a mark changed unexpectedly, a learner vanished from a
        list, or a payment does not look right.
      </p>

      <p><GoTo href="/admin/audit-logs">Audit log</GoTo></p>

      <p>
        Checking it first usually turns a mystery into an ordinary conversation with a colleague.
      </p>

      <h2>Active sessions</h2>

      <p>
        You can see who is currently signed in and end a session if you need to — useful when a device has been
        lost or a member of staff has left unexpectedly.
      </p>

      <p><GoTo href="/admin/user-sessions">User sessions</GoTo></p>
    </HelpDoc>
  );
}
