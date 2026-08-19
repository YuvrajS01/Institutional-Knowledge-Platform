import { describe, expect, it } from 'vitest';

import { buildJobData, JOB_NAMES } from './job-queue.js';

describe('job data contract', () => {
  it('builds the stable job payload shape', () => {
    const data = buildJobData({
      name: 'document.process',
      jobId: 'doc-1-v1-document.process',
      institutionId: 'inst-1',
      documentId: 'doc-1',
      versionId: 'ver-1',
      payload: { page_count: 3 },
    });

    expect(data).toEqual({
      job_id: 'doc-1-v1-document.process',
      institution_id: 'inst-1',
      document_id: 'doc-1',
      version_id: 'ver-1',
      attempt: 1,
      payload: { page_count: 3 },
    });
  });

  it('defaults payload to an empty object', () => {
    const data = buildJobData({
      name: 'document.ocr',
      jobId: 'job-1',
      institutionId: 'i',
      documentId: 'd',
      versionId: 'v',
    });
    expect(data.payload).toEqual({});
  });

  it('defines the processing job names', () => {
    expect(JOB_NAMES).toContain('document.process');
    expect(JOB_NAMES).toContain('document.embed');
    expect(JOB_NAMES).toContain('notification.dispatch');
  });
});
