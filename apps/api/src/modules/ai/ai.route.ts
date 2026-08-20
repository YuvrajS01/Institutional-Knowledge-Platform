import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { FastifyPreHandler } from '../../common/auth/authorize.js';
import { AppError } from '../../common/errors.js';
import type { DbPool } from '../../infrastructure/db/db-pool.js';

import { toApiCitation } from './citation.js';
import { RagAnswerService } from './rag-answer.service.js';

const askBodySchema = z.object({
  question: z.string().trim().min(1, 'question is required').max(500),
  filters: z
    .object({
      department_id: z.string().uuid().optional(),
      document_type: z
        .enum(['NOTICE', 'CIRCULAR', 'POLICY', 'FORM', 'SCHEDULE', 'REPORT', 'OTHER'])
        .optional(),
    })
    .optional(),
});

const AI_ASK_RATE_LIMIT = { max: 30, timeWindow: '1 minute' } as const;

export interface AiModuleOptions {
  pool: DbPool;
  authorization: {
    requireMember: FastifyPreHandler[];
  };
  ragAnswerService?: RagAnswerService;
}

export async function registerAiRoutes(
  app: FastifyInstance,
  options: AiModuleOptions,
): Promise<void> {
  const rag = options.ragAnswerService ?? new RagAnswerService(options.pool);

  app.post(
    '/ai/ask',
    {
      preHandler: options.authorization.requireMember,
      config: { rateLimit: AI_ASK_RATE_LIMIT },
    },
    async (request, reply) => {
      const parsed = askBodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          'VALIDATION_ERROR',
          'One or more fields are invalid.',
          422,
          parsed.error.flatten().fieldErrors,
        );
      }

      const institution = (request as unknown as { institution?: { id: string; role: string } })
        .institution;
      const user = (request as unknown as { user?: { id: string } }).user;
      if (!institution?.id || !user?.id) {
        throw new AppError('VALIDATION_ERROR', 'Institution context is required.', 400);
      }

      const { question, filters } = parsed.data;

      const result = await rag.answer(
        {
          institutionId: institution.id,
          userId: user.id,
          role: institution.role,
        },
        question,
        {
          limit: 5,
          departmentId: filters?.department_id,
          documentType: filters?.document_type,
        },
      );

      const apiCitations = result.citations.map(toApiCitation);

      return reply.status(200).send({
        data: {
          answer: result.answer,
          grounded: result.grounded,
          confidence: result.confidence,
          citations: apiCitations,
        },
      });
    },
  );
}
