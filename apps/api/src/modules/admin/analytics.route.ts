import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { Capability } from '@ikp/shared';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';
import { SearchAnalyticsRepository } from '../search/search-analytics.repository.js';

const analyticsQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(10),
});

export interface AnalyticsModuleOptions {
  pool: DbPool;
  authorization: {
    guard: (capability: Capability) => FastifyPreHandler[];
  };
}

export async function registerAnalyticsRoutes(app: FastifyInstance, options: AnalyticsModuleOptions): Promise<void> {
  const analytics = new SearchAnalyticsRepository(options.pool);

  app.get(
    '/admin/analytics/searches',
    { preHandler: options.authorization.guard('analytics.read') },
    async (request, reply) => {
      const parsed = analyticsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsed.error.flatten().fieldErrors);
      }
      const institution = (request as unknown as { institution?: { id: string } }).institution;
      if (!institution?.id) throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      const data = await analytics.popularQueries(institution.id, {
        from: parsed.data.from ? new Date(parsed.data.from) : undefined,
        to: parsed.data.to ? new Date(parsed.data.to) : undefined,
        limit: parsed.data.limit,
      });
      return reply.status(200).send({ data });
    },
  );

  app.get(
    '/admin/analytics/popular-documents',
    { preHandler: options.authorization.guard('analytics.read') },
    async (request, reply) => {
      // For MVP, popular documents is derived from search analytics popular queries
      // In future, this would join with document views/bookmarks
      const parsed = analyticsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsed.error.flatten().fieldErrors);
      }
      const institution = (request as unknown as { institution?: { id: string } }).institution;
      if (!institution?.id) throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      const data = await analytics.popularQueries(institution.id, {
        from: parsed.data.from ? new Date(parsed.data.from) : undefined,
        to: parsed.data.to ? new Date(parsed.data.to) : undefined,
        limit: parsed.data.limit,
      });
      return reply.status(200).send({ data });
    },
  );

  app.get(
    '/admin/analytics/unresolved-searches',
    { preHandler: options.authorization.guard('analytics.read') },
    async (request, reply) => {
      const parsed = analyticsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw new AppError('VALIDATION_ERROR', 'One or more fields are invalid.', 422, parsed.error.flatten().fieldErrors);
      }
      const institution = (request as unknown as { institution?: { id: string } }).institution;
      if (!institution?.id) throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      const data = await analytics.unresolvedQueries(institution.id, { limit: parsed.data.limit });
      return reply.status(200).send({ data });
    },
  );

  app.get(
    '/admin/analytics/overview',
    { preHandler: options.authorization.guard('analytics.read') },
    async (request, reply) => {
      const institution = (request as unknown as { institution?: { id: string } }).institution;
      if (!institution?.id) throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      const [popular, unresolved] = await Promise.all([
        analytics.popularQueries(institution.id, { limit: 5 }),
        analytics.unresolvedQueries(institution.id, { limit: 5 }),
      ]);
      // For MVP, overview is just popular + unresolved + counts from other tables would be added
      const overview = {
        popular_queries: popular,
        unresolved_queries: unresolved,
      };
      return reply.status(200).send({ data: overview });
    },
  );
}
