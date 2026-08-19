import type { Capability, DocumentType } from '@ikp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import type { JobQueue } from '@ikp/queue';
import type { AuditLogService } from '../audit/audit-log.service.js';
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

const listQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  department_id: z.string().uuid().optional(),
  document_type: z
    .enum(['NOTICE', 'CIRCULAR', 'POLICY', 'FORM', 'SCHEDULE', 'REPORT', 'OTHER'])
    .optional(),
  status: z
    .enum(['DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED', 'SUPERSEDED', 'ARCHIVED'])
    .optional(),
  academic_year: z.string().trim().max(50).optional(),
  course: z.string().trim().max(200).optional(),
  semester: z.coerce.number().int().positive().optional(),
  tag: z.string().trim().max(100).optional(),
  published_from: z.string().datetime().optional(),
  published_to: z.string().datetime().optional(),
  sort: z.enum(['recent', 'oldest']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    document_type: z
      .enum(['NOTICE', 'CIRCULAR', 'POLICY', 'FORM', 'SCHEDULE', 'REPORT', 'OTHER'])
      .optional(),
    academic_year: z.string().trim().max(50).nullable().optional(),
    course: z.string().trim().max(200).nullable().optional(),
    semester: z.coerce.number().int().positive().nullable().optional(),
    audience: z
      .object({
        roles: z.array(z.string()).max(20).optional(),
        courses: z.array(z.string()).max(50).optional(),
        semesters: z.array(z.number().int()).max(50).optional(),
      })
      .nullable()
      .optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'At least one field must be provided.',
  });

const READ_RATE_LIMIT = { max: 300, timeWindow: '1 minute' } as const;
const WRITE_RATE_LIMIT = { max: 30, timeWindow: '1 minute' } as const;

export interface DocumentsModuleOptions {
  pool: DbPool;
  storage: ObjectStorage;
  audit: AuditLogService;
  queue?: JobQueue;
  authorization: {
    guard: (capability: Capability) => FastifyPreHandler[];
    requireMember: FastifyPreHandler[];
  };
}

function actorFor(request: { institution?: { id: string; role: string }; user?: { id: string } }) {
  return {
    institutionId: request.institution!.id,
    userId: request.user!.id,
    role: request.institution!.role,
  };
}

export async function registerDocumentsRoutes(
  app: FastifyInstance,
  options: DocumentsModuleOptions,
): Promise<void> {
  const service = new DocumentsService(options.pool, options.storage, options.audit, options.queue);

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
      const data = await service.createUpload(actorFor(request), {
        title: parsed.data.title,
        document_type: parsed.data.document_type as DocumentType,
        department_id: parsed.data.department_id,
        mime_type: parsed.data.mime_type,
        academic_year: parsed.data.academic_year ?? null,
        course: parsed.data.course ?? null,
        semester: parsed.data.semester ?? null,
        audience: parsed.data.audience ?? null,
      });
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
      const data = await service.confirmUpload(actorFor(request), parsed.data.document_id);
      return reply.status(200).send({ data });
    },
  );

  app.get(
    '/documents',
    {
      preHandler: options.authorization.requireMember,
      config: { rateLimit: READ_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const { data, total } = await service.list(actorFor(request), {
        search: parsed.data.search,
        department_id: parsed.data.department_id,
        document_type: parsed.data.document_type as DocumentType | undefined,
        status: parsed.data.status,
        academic_year: parsed.data.academic_year,
        course: parsed.data.course,
        semester: parsed.data.semester,
        tag: parsed.data.tag,
        published_from: parsed.data.published_from,
        published_to: parsed.data.published_to,
        sort: parsed.data.sort,
        page: parsed.data.page,
        limit: parsed.data.limit,
      });
      return reply.status(200).send({
        data,
        meta: { page: parsed.data.page, limit: parsed.data.limit, total },
      });
    },
  );

  app.get(
    '/documents/:document_id',
    {
      preHandler: options.authorization.requireMember,
      config: { rateLimit: READ_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = documentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const data = await service.get(actorFor(request), parsed.data.document_id);
      if (!data) {
        throw AppError.notFound('Document not found.');
      }
      return reply.status(200).send({ data });
    },
  );

  app.patch(
    '/documents/:document_id',
    {
      preHandler: options.authorization.guard('document.edit_draft'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const params = documentParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }
      const data = await service.updateMetadata(actorFor(request), params.data.document_id, {
        title: parsed.data.title,
        tags: parsed.data.tags,
        document_type: parsed.data.document_type as DocumentType | undefined,
        academic_year:
          parsed.data.academic_year === undefined ? undefined : parsed.data.academic_year,
        course: parsed.data.course === undefined ? undefined : parsed.data.course,
        semester: parsed.data.semester === undefined ? undefined : parsed.data.semester,
        audience: parsed.data.audience === undefined ? undefined : parsed.data.audience,
      });
      if (!data) {
        throw AppError.notFound('Document not found.');
      }
      return reply.status(200).send({ data });
    },
  );

  app.post(
    '/documents/:document_id/submit-review',
    {
      preHandler: options.authorization.guard('document.edit_draft'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = documentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const data = await service.transition(
        actorFor(request),
        parsed.data.document_id,
        'IN_REVIEW',
      );
      if (!data) {
        throw AppError.notFound('Document not found.');
      }
      return reply.status(200).send({ data });
    },
  );

  app.post(
    '/documents/:document_id/approve',
    {
      preHandler: options.authorization.guard('document.approve'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = documentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const data = await service.transition(actorFor(request), parsed.data.document_id, 'APPROVED');
      if (!data) {
        throw AppError.notFound('Document not found.');
      }
      return reply.status(200).send({ data });
    },
  );

  app.post(
    '/documents/:document_id/publish',
    {
      preHandler: options.authorization.guard('document.publish'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = documentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const data = await service.transition(
        actorFor(request),
        parsed.data.document_id,
        'PUBLISHED',
      );
      if (!data) {
        throw AppError.notFound('Document not found.');
      }
      return reply.status(200).send({ data });
    },
  );

  app.post(
    '/documents/:document_id/archive',
    {
      preHandler: options.authorization.guard('document.publish'),
      config: { rateLimit: WRITE_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = documentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, {});
      }
      const data = await service.transition(actorFor(request), parsed.data.document_id, 'ARCHIVED');
      if (!data) {
        throw AppError.notFound('Document not found.');
      }
      return reply.status(200).send({ data });
    },
  );
}
