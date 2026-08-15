import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Resolves modules from `apps/api` regardless of the current working
 * directory, because pnpm keeps dependencies in the consuming package's
 * `node_modules` rather than hoisting them to the repository root.
 */
export function apiRequire(): NodeRequire {
  return createRequire(path.resolve(process.cwd(), 'apps/api/package.json'));
}
