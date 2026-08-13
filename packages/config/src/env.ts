import { existsSync } from 'node:fs';
import path from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { z, type ZodTypeAny } from 'zod';

const DEV_ENV_CANDIDATES = [
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), '.env'),
];

/**
 * Loads a `.env` file into `process.env` for local development.
 *
 * - Only runs outside `NODE_ENV=production`.
 * - Never overrides variables that are already set in the environment.
 * - In production, configuration must come from the deployment environment.
 */
export function loadEnvFile(envPath?: string): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const candidates = envPath ? [envPath] : DEV_ENV_CANDIDATES;
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate });
      return;
    }
  }
}

/**
 * Validates `process.env` against a Zod schema and returns the parsed value.
 * Throws with a stable, human-readable message when validation fails so that
 * misconfigured services fail fast at boot instead of at first request.
 *
 * The return type is derived from the schema's *output* type (`z.output<S>`)
 * rather than its input type, so `.default()`-ed fields are typed as their
 * parsed value, not as optional.
 */
export function parseEnv<S extends ZodTypeAny>(
  schema: S,
  source: NodeJS.ProcessEnv = process.env,
): z.output<S> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const pathText = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${pathText}: ${issue.message}`;
    });
    throw new Error(`Environment validation failed:\n${issues.join('\n')}`);
  }
  return result.data;
}
