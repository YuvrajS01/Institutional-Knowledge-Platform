import type { Capability } from '@ikp/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { HybridSearchService } from './hybrid-search.service.js';
import { SearchAnalyticsRepository } from './search-analytics.repository.js';

const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  query: z.string().trim().min(1).max(200).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  department_id: z.string().uuid().optional(),
  document_type: z
    .enum(['NOTICE', 'CIRCULAR', 'POLICY', 'FORM', 'SCHEDULE', 'REPORT', 'OTHER'])
    .optional(),
  academic_year: z.string().trim().max(50).optional(),
  course: z.string().trim().max(200).optional(),
  semester: z.coerce.number().int().positive().max(12).optional(),
  tag: z.string().trim().max(100).optional(),
  published_from: z.string().datetime().optional(),
  published_to: z.string().datetime().optional(),
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
  const analytics = new SearchAnalyticsRepository(options.pool);

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
        academicYear: parsed.data.academic_year,
        course: parsed.data.course,
        semester: parsed.data.semester,
        tag: parsed.data.tag,
        publishedFrom: parsed.data.published_from ? new Date(parsed.data.published_from) : undefined,
        publishedTo: parsed.data.published_to ? new Date(parsed.data.published_to) : undefined,
      });
      const latencyMs = Date.now() - start;

      // Analytics: log search for admin analytics (await to ensure test determinism, best-effort)
      const actorUser = (request as unknown as { user?: { id: string } }).user;
      if (actorUser?.id) {
        try {
          await analytics.log(institutionId, actorUser.id, queryText, results.length, latencyMs, {
            department_id: parsed.data.department_id,
            document_type: parsed.data.document_type,
            academic_year: parsed.data.academic_year,
            course: parsed.data.course,
            semester: parsed.data.semester,
            tag: parsed.data.tag,
          });
        } catch {
          // do not fail search on analytics error
        }
      }

      // Facets: department + document_type counts from results (MVP, no separate agg)
      const deptCounts = new Map<string, { id: string; name: string; count: number }>();
      const typeCounts = new Map<string, number>();
      for (const r of results) {
        if (r.department_id) {
          const existing = deptCounts.get(r.department_id);
          if (existing) existing.count++;
          else deptCounts.set(r.department_id, { id: r.department_id, name: '', count: 1 });
        }
        const t = r.document_type;
        typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
      }
      const typeFacets = Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count }));

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
            document_types: typeFacets,
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
