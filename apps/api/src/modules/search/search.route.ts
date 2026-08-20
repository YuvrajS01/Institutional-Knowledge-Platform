import type { Capability } from '@ikp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { HybridSearchService } from './hybrid-search.service.js';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  query: z.string().trim().min(1).max(200).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  department_id: z.string().uuid().optional(),
  document_type: z
    .enum(['NOTICE', 'CIRCULAR', 'POLICY', 'FORM', 'SCHEDULE', 'REPORT', 'OTHER'])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

const SEARCH_RATE_LIMIT = { max: 60, timeWindow: '1 minute' } as const;

export interface SearchModuleOptions {
  pool: DbPool;
  authorization: {
    guard: (capability: Capability) => FastifyPreHandler[];
    requireMember: FastifyPreHandler[];
  };
}

function visibleStatusesForRole(role: string): string[] | undefined {
  if (role === 'STUDENT' || role === 'FACULTY') {
    return ['PUBLISHED'];
  }
  return undefined;
}

export async function registerSearchRoutes(
  app: FastifyInstance,
  options: SearchModuleOptions,
): Promise<void> {
  const hybrid = new HybridSearchService(options.pool);

  app.get(
    '/search',
    {
      preHandler: options.authorization.requireMember,
      config: { rateLimit: SEARCH_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = searchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }

      const queryText = parsed.data.q ?? parsed.data.query ?? parsed.data.search;
      if (!queryText || !queryText.trim()) {
        throw new AppError('VALIDATION_ERROR', 'Query parameter q is required.', 422, {
          q: ['Required'],
        });
      }

      const institution = (request as unknown as { institution?: { id: string; role: string } }).institution;
      const actorRole = institution?.role ?? 'STUDENT';
      const institutionId = institution?.id;
      if (!institutionId) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }

      const statuses = visibleStatusesForRole(actorRole) as unknown as
        | ('PUBLISHED' | 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED' | 'ARCHIVED')[]
        | undefined;

      const start = Date.now();
      const results = await hybrid.search(institutionId, queryText, {
        limit: parsed.data.limit,
        offset: (parsed.data.page - 1) * parsed.data.limit,
        statuses,
        departmentId: parsed.data.department_id,
        documentType: parsed.data.document_type as unknown as import('@ikp/shared').DocumentType | undefined,
      });
      const latencyMs = Date.now() - start;

      // Facets: simple department counts from results (for MVP, no separate agg query)
      const deptCounts = new Map<string, { id: string; name: string; count: number }>();
      for (const r of results) {
        if (r.department_id) {
          const existing = deptCounts.get(r.department_id);
          if (existing) existing.count++;
          else deptCounts.set(r.department_id, { id: r.department_id, name: '', count: 1 });
        }
      }

      return reply.status(200).send({
        data: {
          query: queryText,
          results: results.map((r) => ({
            document_id: r.document_id,
            title: r.title,
            score: Number(r.hybrid_score.toFixed(4)),
            summary: null,
            match_reasons: r.match_reasons,
            published_at: r.published_at ? r.published_at.toISOString() : null,
            is_current: r.status === 'PUBLISHED',
            lexical_score: Number(r.lexical_score.toFixed(4)),
            semantic_score: Number(r.semantic_score.toFixed(4)),
          })),
          facets: {
            departments: Array.from(deptCounts.values()),
          },
        },
        meta: {
          total: results.length,
          latency_ms: latencyMs,
        },
      });
    },
  );
}
