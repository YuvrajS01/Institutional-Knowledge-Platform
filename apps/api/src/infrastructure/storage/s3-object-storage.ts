import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type {
  ObjectStorage,
  PutObjectInput,
  StorageObject,
  StoredObject,
} from './object-storage.js';
import { StorageError } from './object-storage.js';

export interface S3ObjectStorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
}

const DEFAULT_PRESIGN_TTL_SECONDS = 60 * 15;

function isNoSuchKey(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ((error as { name?: string }).name === 'NoSuchKey' ||
      (error as { name?: string }).name === 'NotFound')
  );
}

export function createS3ObjectStorage(config: S3ObjectStorageConfig): ObjectStorage {
  const clientConfig: S3ClientConfig = {
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  };
  const client = new S3Client(clientConfig);

  return {
    async put(input: PutObjectInput): Promise<StorageObject> {
      try {
        const response = await client.send(
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: input.key,
            Body: input.body,
            ContentType: input.contentType,
          }),
        );
        return {
          key: input.key,
          sizeBytes: input.body.byteLength,
          etag: response.ETag ?? null,
        };
      } catch (error) {
        throw new StorageError('UNAVAILABLE', 'Object storage is unavailable.', error);
      }
    },

    async get(key: string): Promise<StoredObject | null> {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        const body = await streamToBuffer(response.Body);
        return {
          body,
          contentType: response.ContentType ?? 'application/octet-stream',
          sizeBytes: body.byteLength,
        };
      } catch (error) {
        if (isNoSuchKey(error)) {
          return null;
        }
        throw new StorageError('UNAVAILABLE', 'Object storage is unavailable.', error);
      }
    },

    async head(key: string): Promise<StorageObject | null> {
      try {
        const response = await client.send(
          new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
        );
        return {
          key,
          sizeBytes: response.ContentLength ?? 0,
          etag: response.ETag ?? null,
        };
      } catch (error) {
        if (isNoSuchKey(error)) {
          return null;
        }
        throw new StorageError('UNAVAILABLE', 'Object storage is unavailable.', error);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
      } catch (error) {
        throw new StorageError('UNAVAILABLE', 'Object storage is unavailable.', error);
      }
    },

    async presignPut(
      key: string,
      contentType: string,
      expiresInSeconds = DEFAULT_PRESIGN_TTL_SECONDS,
    ): Promise<string> {
      try {
        return await getSignedUrl(
          client,
          new PutObjectCommand({
            Bucket: config.bucket,
            Key: key,
            ContentType: contentType,
          }),
          { expiresIn: expiresInSeconds },
        );
      } catch (error) {
        throw new StorageError('UNAVAILABLE', 'Object storage is unavailable.', error);
      }
    },

    async presignGet(key: string, expiresInSeconds = DEFAULT_PRESIGN_TTL_SECONDS): Promise<string> {
      try {
        return await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: config.bucket, Key: key }),
          { expiresIn: expiresInSeconds },
        );
      } catch (error) {
        throw new StorageError('UNAVAILABLE', 'Object storage is unavailable.', error);
      }
    },
  };
}

/** Creates the configured bucket if it does not exist (idempotent). */
export async function ensureStorageBucket(config: S3ObjectStorageConfig): Promise<void> {
  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle ?? true,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  try {
    await client.send(new CreateBucketCommand({ Bucket: config.bucket }));
  } catch (error) {
    // BucketAlreadyExists / BucketAlreadyOwnedByYou
    if (!(error instanceof Error && error.name?.includes('BucketAlready'))) {
      throw error;
    }
  }
}

async function streamToBuffer(stream: unknown): Promise<Buffer> {
  if (stream instanceof Buffer) {
    return stream;
  }
  if (typeof stream === 'string') {
    return Buffer.from(stream);
  }
  if (stream && typeof (stream as { pipe?: unknown }).pipe === 'function') {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      const nodeStream = stream as NodeJS.ReadableStream;
      nodeStream.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      nodeStream.on('end', () => resolve(Buffer.concat(chunks)));
      nodeStream.on('error', reject);
    });
  }
  throw new StorageError('UNAVAILABLE', 'Unexpected object body from storage.');
}
