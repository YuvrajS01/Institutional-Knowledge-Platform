import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { z } from 'zod';

import { createAuthenticate } from '../../common/auth/authenticate.js';
import { AppError } from '../../common/errors.js';
import { AuthService } from './auth.service.js';
import type { TokenConfig } from './tokens.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1).max(1024),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(1).max(512),
});

const AUTH_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;

export interface AuthModuleOptions {
  pool: Pool;
  tokenConfig: TokenConfig;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  options: AuthModuleOptions,
): Promise<void> {
  const authService = new AuthService({ pool: options.pool, tokenConfig: options.tokenConfig });
  const authenticate = createAuthenticate(options.tokenConfig.secret);

  app.post('/auth/login', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'One or more fields are invalid.',
        422,
        parsed.error.flatten().fieldErrors,
      );
    }
    const data = await authService.login(parsed.data.email, parsed.data.password);
    return reply.status(200).send({ data });
  });

  app.post('/auth/refresh', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'One or more fields are invalid.',
        422,
        parsed.error.flatten().fieldErrors,
      );
    }
    const data = await authService.refresh(parsed.data.refresh_token);
    return reply.status(200).send({ data });
  });

  app.post('/auth/logout', { config: { rateLimit: AUTH_RATE_LIMIT } }, async (request, reply) => {
    const parsed = refreshSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(
        'VALIDATION_ERROR',
        'One or more fields are invalid.',
        422,
        parsed.error.flatten().fieldErrors,
      );
    }
    await authService.logout(parsed.data.refresh_token);
    return reply.status(204).send();
  });

  app.get(
    '/auth/me',
    { preHandler: authenticate, config: { rateLimit: AUTH_RATE_LIMIT } },
    async (request, reply) => {
      const data = await authService.me(request.user!.id);
      return reply.status(200).send({ data });
    },
  );
}
