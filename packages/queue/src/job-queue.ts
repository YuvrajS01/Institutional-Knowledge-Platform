/**
 * Background job queue abstraction.
 *
 * The document processing pipeline runs as asynchronous, retryable,
 * observable jobs (`.agent/AGENTS.md` §10, `.agent/architecture/TECHNICAL_SPEC.md`
 * §20, ADR-002). This package defines the queue contract used by both the API
 * (enqueue) and the worker (consume) so implementations can be swapped
 * (BullMQ/Redis now; managed queues later) without touching business logic.
 */

export const JOB_NAMES = [
  'document.process',
  'document.ocr',
  'document.extract_metadata',
  'document.embed',
  'document.index',
  'notification.dispatch',
  'analytics.aggregate',
] as const;

export type JobName = (typeof JOB_NAMES)[number];

/**
 * Stable job payload, per `.agent/engineering/IMPLEMENTATION_GUIDE.md` §4.
 * The queue is tenant-aware: processors must verify tenant context from
 * `institution_id` on every job.
 */
export interface JobData {
  job_id: string;
  institution_id: string;
  document_id: string;
  version_id: string;
  attempt: number;
  payload: Record<string, unknown>;
}

export interface EnqueueJobInput {
  name: string;
  /**
   * Deterministic id for idempotency: re-enqueuing the same id does not
   * create a duplicate job (BullMQ dedupes within a queue).
   */
  jobId: string;
  institutionId: string;
  documentId: string;
  versionId: string;
  payload?: Record<string, unknown>;
  attempts?: number;
}

export interface JobQueue {
  enqueue(input: EnqueueJobInput): Promise<void>;
  close(): Promise<void>;
}

export type JobHandler = (data: JobData) => Promise<void>;

/**
 * Builds the stable job payload (IMPLEMENTATION_GUIDE §4) from an enqueue
 * input. Pure and unit-testable.
 */
export function buildJobData(input: EnqueueJobInput): JobData {
  return {
    job_id: input.jobId,
    institution_id: input.institutionId,
    document_id: input.documentId,
    version_id: input.versionId,
    attempt: 1,
    payload: input.payload ?? {},
  };
}
