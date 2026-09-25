'use client';

import React from 'react';
import HelpDoc, { Callout, GoTo, DefTable, Steps, Step } from '@/components/help/HelpDoc';

export default function Page() {
  return (
    <HelpDoc slug="buying-sms">
      <p>
        Your school sends attendance alerts and messages to parents by SMS. You can top up your SMS yourself, any time, with MTN or Airtel Mobile Money —
        there is no need to contact anyone first.
      </p>

      <h2>How to buy SMS</h2>
      <Steps>
        <Step title="Open Buy SMS">Use <b>Buy SMS</b> in the menu, or the <b>Buy SMS</b> link on the SMS balance card on the dashboard.</Step>
        <Step title="Choose an amount">Type an amount or tap a quick amount. The page shows exactly how many SMS you will get. For example, at UGX 30 per SMS, UGX 300,000 gives you 10,000 SMS.</Step>
        <Step title="Enter the phone to pay from">The Mobile Money number that will pay. You will get a prompt on that phone.</Step>
        <Step title="Approve on the phone">Enter your Mobile Money PIN. Keep the page open — it updates by itself and your SMS are added as soon as the payment is confirmed.</Step>
      </Steps>
      <p><GoTo href="/admin/sms/buy">Buy SMS</GoTo></p>

      <DefTable rows={[
        ['Price per SMS', 'Set for your school and shown on the Buy SMS page. It is fixed at the moment you pay, so a later price change never affects a purchase you already made.'],
        ['Long messages', 'A message longer than 160 characters (70 if it contains Arabic or emoji) counts as more than one SMS, as the phone networks charge.'],
        ['Your purchases', 'The Buy SMS page lists every purchase and whether it was added.'],
      ]} />

      <Callout kind="success" title="If you were charged but no SMS appeared">
        <p>
          Wait a few minutes — DRAIS re-checks the payment with the payment company automatically and adds the SMS when it is confirmed.
          If it still shows as &ldquo;Being checked by Xhenvolt&rdquo;, the payment was received but needs a quick look; it will be added once checked.
          You are never charged twice for one purchase.
        </p>
      </Callout>

      <Callout kind="note" title="Who can buy">
        <p>Only a school administrator can buy SMS. If you do not see Buy SMS in your menu, ask your administrator.</p>
      </Callout>
    </HelpDoc>
  );
}
