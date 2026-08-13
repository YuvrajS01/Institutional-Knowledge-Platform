import { randomUUID } from 'node:crypto';

export function generateRequestId(): string {
  return `req_${randomUUID()}`;
}
