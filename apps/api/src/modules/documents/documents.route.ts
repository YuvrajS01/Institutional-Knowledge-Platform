import type { Capability, DocumentType } from '@ikp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import { DocumentsService } from './documents.service.js';

const createSchema = z.object({
  title: z.string().trim().min(1).max(500),
  document_type: z
    .enum(['NOTICE', 'CIRCULAR', 'POLICY', 'FORM', 'SCHEDULE', 'REPORT', 'OTHER'])
    .default('NOTICE'),
  department_id: z.string().uuid().optional(),
  mime_type: z.string().min(1).max(200),
  academic_year: z.string().trim().max(50).nullable().optional(),
  course: z.string().trim().max(200).nullable().optional(),
  semester: z.coerce.number().int().positive().nullable().optional(),
  audience: z
    .object({
      roles: z.array(z.string()).max(20).optional(),
      courses: z.array(z.string()).max(50).optional(),
      semesters: z.array(z.number().int()).max(50).optional(),
    })
    .optional(),
});

const documentParamsSchema = z.object({
  document_id: z.string().uuid(),
});

const WRITE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' } as const;

export interface DocumentsModuleOptions {
  pool: DbPool;
  storage: ObjectStorage;
  authorization: {
    guard: (capability: Capability) => FastifyPreHandler[];
  };
}

export async function registerDocumentsRoutes(
  app: FastifyInstance,
  options: DocumentsModuleOptions,
): Promise<void> {
  const service = new DocumentsService(options.pool, options.storage);

  app.post(
    '/documents',
    {
      preHandler: options.authorization.guard('document.create'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const data = await service.createUpload(
        { institutionId: request.institution!.id, userId: request.user!.id },
        {
          title: parsed.data.title,
          document_type: parsed.data.document_type as DocumentType,
          department_id: parsed.data.department_id,
          mime_type: parsed.data.mime_type,
          academic_year: parsed.data.academic_year ?? null,
          course: parsed.data.course ?? null,
          semester: parsed.data.semester ?? null,
          audience: parsed.data.audience ?? null,
        },
      );
      return reply.status(201).send({ data });
    },
  );

  app.post(
    '/documents/:document_id/upload-complete',
    {
      preHandler: options.authorization.guard('document.edit_draft'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = documentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const data = await service.confirmUpload(
        { institutionId: request.institution!.id, userId: request.user!.id },
        parsed.data.document_id,
      );
      return reply.status(200).send({ data });
    },
  );
}
