import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { DatesService } from '../dates/dates.service.js';
import { NotificationsService } from './notifications.service.js';
import { RelevanceRules } from './relevance-rules.js';

export interface DeadlineReminderOptions {
  daysAhead?: number;
  batchSize?: number;
}

export interface DeadlineReminderResult {
  checked: number;
  notified: number;
  skipped: number;
}

/**
 * Deadline reminder jobs (P7-006) — finds upcoming important dates
 * (within `daysAhead`) and creates notifications for relevant users.
 *
 * Intended to be run periodically (e.g., via BullMQ cron or daily worker).
 * For MVP, it is a simple service method that can be invoked via API or worker.
 */
export class DeadlineReminders {
  private readonly datesService: DatesService;
  private readonly notifications: NotificationsService;
  private readonly relevance: RelevanceRules;

  constructor(
    private readonly pool: DbPool,
    options: {
      datesService?: DatesService;
      notificationsService?: NotificationsService;
      relevanceRules?: RelevanceRules;
    } = {},
  ) {
    this.datesService = options.datesService ?? new DatesService(pool);
    this.notifications = options.notificationsService ?? new NotificationsService(pool);
    this.relevance = options.relevanceRules ?? new RelevanceRules(pool);
  }

  /**
   * Run reminder check for a given institution.
   * Finds dates in [now, now + daysAhead] and notifies relevant users.
   * Deduplicates by checking if a notification for the same entity already exists today.
   */
  async runForInstitution(
    institutionId: string,
    options: DeadlineReminderOptions = {},
  ): Promise<DeadlineReminderResult> {
    const daysAhead = options.daysAhead ?? 3;
    const now = new Date();
    const to = new Date(now);
    to.setDate(to.getDate() + daysAhead);

    const { data: upcoming } = await this.datesService.list(institutionId, {
      from: now.toISOString(),
      to: to.toISOString(),
      limit: 100,
    });

    let notified = 0;
    let skipped = 0;

    for (const entry of upcoming) {
      // Fetch document metadata for audience/department
      const docResult = await this.pool.query(
        `SELECT department_id, audience FROM documents d
         LEFT JOIN document_metadata m ON m.document_id = d.id
         WHERE d.id = $1 AND d.institution_id = $2`,
        [entry.source_document_id, institutionId],
      );
      const docRow = docResult.rows[0] as
        { department_id: string | null; audience: Record<string, unknown> | null } | undefined;
      const departmentId = docRow?.department_id ?? entry.department_id;
      const audience = (docRow?.audience as Record<string, unknown> | null) ?? null;

      const recipients = await this.relevance.resolveRecipients({
        institutionId,
        documentId: entry.source_document_id,
        departmentId,
        audience: audience as {
          roles?: string[];
          courses?: string[];
          semesters?: number[];
          departments?: string[];
        } | null,
      });

      for (const member of recipients) {
        // Deduplicate: skip if already notified today for this document+date
        const existing = await this.pool.query(
          `SELECT 1 FROM notifications
           WHERE user_id = $1 AND institution_id = $2 AND entity_id = $3 AND created_at::date = CURRENT_DATE
           LIMIT 1`,
          [member.userId, institutionId, entry.source_document_id],
        );
        if ((existing.rows as unknown[]).length > 0) {
          skipped++;
          continue;
        }

        const dateLabel = new Date(entry.date).toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        const title = `Reminder: ${entry.label ?? entry.title} — ${dateLabel}`;
        const body =
          `${entry.title} is on ${dateLabel}. Source: ${entry.source_document_title}. ${entry.context ?? entry.raw}`.slice(
            0,
            500,
          );

        await this.notifications.notify({
          institutionId,
          userId: member.userId,
          type: 'WARNING',
          title,
          body,
          entityType: 'document',
          entityId: entry.source_document_id,
        });
        notified++;
      }
    }

    return { checked: upcoming.length, notified, skipped };
  }
}
