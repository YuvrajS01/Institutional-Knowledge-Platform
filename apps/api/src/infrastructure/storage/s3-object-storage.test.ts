import { randomUUID } from 'node:crypto';

import { beforeAll, describe, expect, it } from 'vitest';

import type { ObjectStorage } from './object-storage.js';
import {
  createS3ObjectStorage,
  ensureStorageBucket,
  type S3ObjectStorageConfig,
} from './s3-object-storage.js';

const CONFIG: S3ObjectStorageConfig = {
  endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
  region: process.env.S3_REGION ?? 'us-east-1',
  bucket: process.env.S3_BUCKET ?? 'institutional-documents',
  accessKeyId: process.env.S3_ACCESS_KEY ?? 'minioadmin',
  secretAccessKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
};

let storage: ObjectStorage;
const keys: string[] = [];

function track(key: string): string {
  keys.push(key);
  return key;
}

beforeAll(async () => {
  await ensureStorageBucket(CONFIG);
  storage = createS3ObjectStorage(CONFIG);
});

describe('S3 object storage (integration)', () => {
  it('puts an object and reads it back', async () => {
    const key = track(`test/${randomUUID()}/hello.txt`);
    const content = Buffer.from('hello storage');

    const stored = await storage.put({ key, body: content, contentType: 'text/plain' });
    expect(stored.key).toBe(key);
    expect(stored.sizeBytes).toBe(content.byteLength);

    const fetched = await storage.get(key);
    expect(fetched).not.toBeNull();
    expect(fetched!.body.equals(content)).toBe(true);
    expect(fetched!.contentType).toBe('text/plain');
  });

  it('head reports size and etag', async () => {
    const key = track(`test/${randomUUID()}/head.txt`);
    const content = Buffer.from('head me');

    await storage.put({ key, body: content, contentType: 'text/plain' });
    const head = await storage.head(key);

    expect(head).not.toBeNull();
    expect(head!.sizeBytes).toBe(content.byteLength);
    expect(head!.etag).toBeTruthy();
  });

  it('get and head return null for a missing key', async () => {
    const missing = `test/${randomUUID()}/missing.txt`;
    expect(await storage.get(missing)).toBeNull();
    expect(await storage.head(missing)).toBeNull();
  });

  it('presigned GET URL can download the object', async () => {
    const key = track(`test/${randomUUID()}/presigned-get.txt`);
    const content = Buffer.from('via presigned get');
    await storage.put({ key, body: content, contentType: 'text/plain' });

    const url = await storage.presignGet(key, 60);
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).equals(content)).toBe(true);
  });

  it('presigned PUT URL can upload the object', async () => {
    const key = track(`test/${randomUUID()}/presigned-put.txt`);
    const content = 'uploaded via presigned put';

    const url = await storage.presignPut(key, 'text/plain', 60);
    const response = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: content,
    });

    expect(response.status).toBe(200);
    const fetched = await storage.get(key);
    expect(fetched!.body.toString()).toBe(content);
  });

  it('delete removes the object', async () => {
    const key = track(`test/${randomUUID()}/delete.txt`);
    await storage.put({ key, body: Buffer.from('bye'), contentType: 'text/plain' });

    await storage.delete(key);
    expect(await storage.get(key)).toBeNull();
  });
});
