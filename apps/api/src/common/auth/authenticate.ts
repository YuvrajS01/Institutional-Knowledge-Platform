import type { FastifyRequest } from 'fastify';

import { AppError } from '../errors.js';
import { verifyAccessToken } from '../../modules/auth/tokens.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string };
  }
}

const BEARER_PREFIX = 'Bearer ';

export function createAuthenticate(jwtSecret: string) {
  return async function authenticate(request: FastifyRequest): Promise<void> {
    const header = request.headers.authorization;
    if (!header || !header.startsWith(BEARER_PREFIX)) {
      throw AppError.unauthorized('A valid bearer token is required.');
    }

    const token = header.slice(BEARER_PREFIX.length);
    try {
      const { userId } = await verifyAccessToken(token, jwtSecret);
      request.user = { id: userId };
    } catch {
      throw AppError.unauthorized('Invalid or expired access token.');
    }
  };
}
