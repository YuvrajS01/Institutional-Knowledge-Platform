export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string };
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
  institutionId?: string;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }
  if (options.institutionId) {
    headers['x-institution-id'] = options.institutionId;
  }

  const response = await fetch(`${API_BASE}/api/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const envelope = (await response.json()) as ErrorEnvelope;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      envelope.error?.code ?? 'UNKNOWN_ERROR',
      envelope.error?.message ?? 'Request failed.',
    );
  }
  return (envelope as { data: T }).data;
}
