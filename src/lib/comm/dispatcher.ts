/**
 * Communication dispatcher — the heart of the engine.
 *
 *   1. emit(eventType, payload)
 *   2. Load active rules for (schoolId, eventType).
 *   3. For each rule:
 *        - if rule.auto_send=false → log as 'queued' with source='auto'
 *          and stop (staff can review and manually send from the
 *          dispatch-log UI).
 *        - else → resolve recipients, render template, send via
 *          provider, write log row per recipient.
 *   4. Always return a summary so callers can audit what happened.
 *
 * The dispatcher catches every error per-recipient and writes a
 * 'failed' log row instead of throwing — one bad number can never
 * stop the rest of the broadcast.
 */
import { query } from '@/lib/db';
import type { CommEventPayloadMap, CommEventType, CommAudience, CommChannel } from './events';
import { getCommSettings, isQuietHours, type CommSettings } from './settings';
import { resolveTemplate, renderTemplate, applyPrefix } from './templates';
import { getProvider } from './providers';
import { resolveRecipients } from './recipients';

/**
 * Channel-specific settings selection. Added alongside the WhatsApp channel
 * (2026-08-19) — before this, every send() call site hardcoded the SMS
 * fields (settings.defaultProvider / settings.senderName / settings.smsEnabled)
 * regardless of rule.channel, which was harmless while SMS was the only real
 * channel but would have made a WhatsApp rule silently resolve to the SMS
 * provider (or fall through to the console stand-in) and ignore the WhatsApp
 * kill-switch entirely. For channel === 'sms' this resolves to exactly the
 * same fields as before — zero behavior change for existing SMS rules.
 */
function providerNameFor(settings: CommSettings, channel: CommChannel): string {
  return channel === 'whatsapp' ? settings.whatsappProvider : settings.defaultProvider;
}
function senderFor(settings: CommSettings, channel: CommChannel): string | undefined {
  return (channel === 'whatsapp' ? settings.whatsappSender : settings.senderName) ?? undefined;
}
function credsFor(settings: CommSettings, channel: CommChannel) {
  return channel === 'whatsapp'
    ? { apiKey: settings.whatsappProviderApiKey, baseUrl: settings.whatsappProviderBaseUrl }
    : { username: settings.providerUsername, apiKey: settings.providerApiKey };
}
function channelEnabled(settings: CommSettings, channel: CommChannel): boolean {
  return channel === 'whatsapp' ? settings.whatsappEnabled : settings.smsEnabled;
}

export interface DispatchSummary {
  schoolId:   number;
  eventType:  CommEventType;
  rulesEvaluated: number;
  sent:       number;
  failed:     number;
  skipped:    number;
  queued:     number;
}

interface CommRuleRow {
  id:          number;
  event_type:  string;
  channel:     CommChannel;
  audience:    CommAudience;
  custom_phones: string | null;
  auto_send:   number;
  is_active:   number;
}

async function loadActiveRules(
  schoolId: number,
  eventType: CommEventType,
): Promise<CommRuleRow[]> {
  return (await query(
    `SELECT id, event_type, channel, audience, custom_phones, auto_send, is_active
       FROM comm_rules
      WHERE school_id = ? AND event_type = ? AND is_active = 1`,
    [schoolId, eventType],
  )) as CommRuleRow[];
}

async function writeLog(args: {
  schoolId:           number;
  eventType:          CommEventType;
  channel:            CommChannel;
  templateId:         number | null;
  ruleId:             number | null;
  recipientPhone:     string | null;
  recipientName:      string | null;
  recipientStudentId: number | null;
  recipientStaffId:   number | null;
  body:               string;
  status:             'queued' | 'sent' | 'failed' | 'skipped';
  provider:           string | null;
  providerMessageId:  string | null;
  providerCost:       string | null;
  error:              string | null;
  triggeredByUserId:  number | null;
  source:             'auto' | 'manual';
  contextJson:        unknown;
}): Promise<number> {
  const r = (await query(
    `INSERT INTO comm_dispatch_log
       (school_id, event_type, channel, template_id, rule_id,
        recipient_phone, recipient_name, recipient_student_id, recipient_staff_id,
        message_body, status, provider, provider_message_id, provider_cost,
        error_message, triggered_by_user_id, source, context_json,
        sent_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
             CASE WHEN ? = 'sent' THEN NOW() ELSE NULL END)`,
    [
      args.schoolId, args.eventType, args.channel, args.templateId, args.ruleId,
      args.recipientPhone, args.recipientName, args.recipientStudentId, args.recipientStaffId,
      args.body, args.status, args.provider, args.providerMessageId, args.providerCost,
      args.error, args.triggeredByUserId, args.source,
      args.contextJson ? JSON.stringify(args.contextJson) : null,
      args.status,
    ],
  )) as { insertId?: number };
  return Number(r?.insertId ?? 0);
}

/**
 * Fire an event. The dispatcher swallows errors and reports a summary
 * so callers (attendance, finance, etc) never block on comm failures.
 */
export async function emit<T extends CommEventType>(
  eventType: T,
  payload: CommEventPayloadMap[T],
): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    schoolId:       payload.schoolId,
    eventType,
    rulesEvaluated: 0,
    sent:           0,
    failed:         0,
    skipped:        0,
    queued:         0,
  };

  try {
    const settings = await getCommSettings(payload.schoolId);
    const rules = await loadActiveRules(payload.schoolId, eventType);
    summary.rulesEvaluated = rules.length;

    if (rules.length === 0) {
      // No rule configured — write one 'skipped' row so admins can see
      // the event fired but nothing happened.
      await writeLog({
        schoolId:           payload.schoolId,
        eventType,
        channel:            'sms',
        templateId:         null,
        ruleId:             null,
        recipientPhone:     null,
        recipientName:      null,
        recipientStudentId: (payload as any).studentId ?? null,
        recipientStaffId:   (payload as any).staffId ?? null,
        body:               '',
        status:             'skipped',
        provider:           null,
        providerMessageId:  null,
        providerCost:       null,
        error:              'no active rule',
        triggeredByUserId:  payload.triggeredBy ?? null,
        source:             payload.source ?? 'auto',
        contextJson:        payload,
      });
      summary.skipped += 1;
      return summary;
    }

    const quiet = isQuietHours(settings);

    for (const rule of rules) {
      const tpl = await resolveTemplate({
        schoolId:  payload.schoolId,
        eventType,
        channel:   rule.channel,
      });
      if (!tpl) {
        await writeLog({
          schoolId:           payload.schoolId,
          eventType,
          channel:            rule.channel,
          templateId:         null,
          ruleId:             rule.id,
          recipientPhone:     null,
          recipientName:      null,
          recipientStudentId: (payload as any).studentId ?? null,
          recipientStaffId:   (payload as any).staffId ?? null,
          body:               '',
          status:             'skipped',
          provider:           null,
          providerMessageId:  null,
          providerCost:       null,
          error:              'no template',
          triggeredByUserId:  payload.triggeredBy ?? null,
          source:             payload.source ?? 'auto',
          contextJson:        payload,
        });
        summary.skipped += 1;
        continue;
      }

      const renderedBody = applyPrefix(renderTemplate(tpl.body, payload as any), settings.prefix);

      const customPhones = rule.custom_phones
        ? (() => { try { return JSON.parse(rule.custom_phones as unknown as string); } catch { return []; } })()
        : [];

      const recipients = await resolveRecipients({
        schoolId:     payload.schoolId,
        eventType,
        audience:     rule.audience,
        studentId:    (payload as any).studentId,
        staffId:      (payload as any).staffId,
        customPhones,
      });

      if (recipients.length === 0) {
        await writeLog({
          schoolId:           payload.schoolId,
          eventType,
          channel:            rule.channel,
          templateId:         tpl.id,
          ruleId:             rule.id,
          recipientPhone:     null,
          recipientName:      null,
          recipientStudentId: (payload as any).studentId ?? null,
          recipientStaffId:   (payload as any).staffId ?? null,
          body:               renderedBody,
          status:             'skipped',
          provider:           null,
          providerMessageId:  null,
          providerCost:       null,
          error:              'no recipients resolved',
          triggeredByUserId:  payload.triggeredBy ?? null,
          source:             payload.source ?? 'auto',
          contextJson:        payload,
        });
        summary.skipped += 1;
        continue;
      }

      // Decide if this rule actually transmits. Three reasons to queue:
      //   - rule.auto_send=0 (manual approval required)
      //   - settings.auto_mode=false AND rule.auto_send=1 (master off)
      //   - quiet hours active
      // The per-channel kill-switch (SMS: platform/Jeton controlled;
      // WhatsApp: per-school toggle) overrides everything — neither auto
      // nor manual sends go out when it's off for this rule's channel.
      const willSend = channelEnabled(settings, rule.channel) && (
        (rule.auto_send === 1 &&
         settings.autoMode &&
         !quiet &&
         (payload.source ?? 'auto') === 'auto')
        || payload.source === 'manual'
      );

      for (const rec of recipients) {
        if (!willSend) {
          await writeLog({
            schoolId:           payload.schoolId,
            eventType,
            channel:            rule.channel,
            templateId:         tpl.id,
            ruleId:             rule.id,
            recipientPhone:     rec.phone,
            recipientName:      rec.name,
            recipientStudentId: rec.studentId ?? (payload as any).studentId ?? null,
            recipientStaffId:   rec.staffId ?? (payload as any).staffId ?? null,
            body:               renderedBody,
            status:             'queued',
            provider:           null,
            providerMessageId:  null,
            providerCost:       null,
            error:              !channelEnabled(settings, rule.channel) ? `${rule.channel} disabled` : quiet ? 'quiet hours' : (settings.autoMode ? null : 'auto_mode off'),
            triggeredByUserId:  payload.triggeredBy ?? null,
            source:             payload.source ?? 'auto',
            contextJson:        payload,
          });
          summary.queued += 1;
          continue;
        }

        const provider = getProvider(providerNameFor(settings, rule.channel), rule.channel);
        let result;
        try {
          result = await provider.send({
            to:         rec.phone,
            body:       renderedBody,
            senderName: senderFor(settings, rule.channel),
            creds:      credsFor(settings, rule.channel),
          });
        } catch (e: any) {
          result = { success: false, providerMessageId: null, cost: null, error: e?.message || 'provider threw' };
        }

        await writeLog({
          schoolId:           payload.schoolId,
          eventType,
          channel:            rule.channel,
          templateId:         tpl.id,
          ruleId:             rule.id,
          recipientPhone:     rec.phone,
          recipientName:      rec.name,
          recipientStudentId: rec.studentId ?? (payload as any).studentId ?? null,
          recipientStaffId:   rec.staffId ?? (payload as any).staffId ?? null,
          body:               renderedBody,
          status:             result.success ? 'sent' : 'failed',
          provider:           provider.name,
          providerMessageId:  result.providerMessageId,
          providerCost:       result.cost,
          error:              result.error,
          triggeredByUserId:  payload.triggeredBy ?? null,
          source:             payload.source ?? 'auto',
          contextJson:        payload,
        });

        if (result.success) summary.sent += 1; else summary.failed += 1;
      }
    }
  } catch (e: any) {
    // Last-resort: log the event itself failed so we have a trace.
    try {
      await writeLog({
        schoolId:           payload.schoolId,
        eventType,
        channel:            'sms',
        templateId:         null,
        ruleId:             null,
        recipientPhone:     null,
        recipientName:      null,
        recipientStudentId: (payload as any).studentId ?? null,
        recipientStaffId:   (payload as any).staffId ?? null,
        body:               '',
        status:             'failed',
        provider:           null,
        providerMessageId:  null,
        providerCost:       null,
        error:              `dispatcher: ${e?.message || 'unknown error'}`,
        triggeredByUserId:  payload.triggeredBy ?? null,
        source:             payload.source ?? 'auto',
        contextJson:        payload,
      });
    } catch { /* nothing we can do */ }
    summary.failed += 1;
  }

  return summary;
}

/**
 * Manually re-send a previously queued log row. Used by the "Send Now"
 * button in the dispatch-log UI when auto_mode was off.
 */
export async function manualSendFromLog(args: {
  logId:     number;
  schoolId:  number;
  userId:    number;
}): Promise<{ success: boolean; error?: string }> {
  const rows = (await query(
    `SELECT * FROM comm_dispatch_log
      WHERE id = ? AND school_id = ? AND status = 'queued'`,
    [args.logId, args.schoolId],
  )) as Array<{
    id:                  number;
    channel:             CommChannel;
    recipient_phone:     string | null;
    message_body:        string;
  }>;
  if (!rows.length) return { success: false, error: 'Log entry not found or not queued' };

  const log = rows[0];
  if (!log.recipient_phone) return { success: false, error: 'No phone on file' };

  const settings = await getCommSettings(args.schoolId);
  if (!channelEnabled(settings, log.channel)) return { success: false, error: `${log.channel} is disabled for this school` };
  const provider = getProvider(providerNameFor(settings, log.channel), log.channel);

  let result;
  try {
    result = await provider.send({
      to:         log.recipient_phone,
      body:       log.message_body,
      senderName: senderFor(settings, log.channel),
      creds:      credsFor(settings, log.channel),
    });
  } catch (e: any) {
    result = { success: false, providerMessageId: null, cost: null, error: e?.message || 'provider threw' };
  }

  await query(
    `UPDATE comm_dispatch_log SET
       status              = ?,
       provider            = ?,
       provider_message_id = ?,
       provider_cost       = ?,
       error_message       = ?,
       retries             = retries + 1,
       triggered_by_user_id = ?,
       source              = 'manual',
       sent_at             = CASE WHEN ? = 'sent' THEN NOW() ELSE sent_at END
     WHERE id = ?`,
    [
      result.success ? 'sent' : 'failed',
      provider.name,
      result.providerMessageId,
      result.cost,
      result.error,
      args.userId,
      result.success ? 'sent' : 'failed',
      args.logId,
    ],
  );

  return { success: result.success, error: result.error ?? undefined };
}
