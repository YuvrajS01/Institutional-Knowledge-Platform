/**
 * Object storage contract (S3-compatible).
 *
 * The platform never hands out public buckets: all objects are private and
 * only reachable through short-lived signed URLs (see
 * `.agent/quality/SECURITY_CHECKLIST.md` — private by default, signed URLs).
 */
export interface StorageObject {
  key: string;
  sizeBytes: number;
  etag: string | null;
}

export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StoredObject {
  body: Buffer;
  contentType: string;
  sizeBytes: number;
}

export type StorageErrorCode = 'NOT_FOUND' | 'UNAVAILABLE';

export class StorageError extends Error {
  constructor(
    readonly code: StorageErrorCode,
    message: string,
    readonly causeError?: unknown,
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export interface ObjectStorage {
  put(input: PutObjectInput): Promise<StorageObject>;
  /** Returns null when the key does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Returns null when the key does not exist. */
  head(key: string): Promise<StorageObject | null>;
  delete(key: string): Promise<void>;
  presignPut(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  presignGet(key: string, expiresInSeconds?: number): Promise<string>;
}
