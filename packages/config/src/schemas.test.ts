import { afterEach, describe, expect, it } from 'vitest';

import { parseEnv } from './env.js';
import { apiEnvSchema, workerEnvSchema } from './schemas.js';

const originalEnv = process.env;

afterEach(() => {
  process.env = { ...originalEnv };
});

describe('parseEnv', () => {
  it('parses a valid api environment', () => {
    process.env = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/institutional_knowledge',
      REDIS_URL: 'redis://localhost:6379',
    };
    const env = parseEnv(apiEnvSchema);
    expect(env.NODE_ENV).toBe('test');
    expect(env.API_PORT).toBe(4000);
    expect(env.API_HOST).toBe('0.0.0.0');
    expect(env.S3_BUCKET).toBe('institutional-documents');
    expect(env.LOG_LEVEL).toBe('info');
  });

  it('applies explicit overrides', () => {
    process.env = {
      NODE_ENV: 'development',
      API_PORT: '8080',
      API_HOST: '127.0.0.1',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/institutional_knowledge',
      REDIS_URL: 'redis://localhost:6379',
    };
    const env = parseEnv(apiEnvSchema);
    expect(env.API_PORT).toBe(8080);
    expect(env.API_HOST).toBe('127.0.0.1');
    expect(env.LOG_LEVEL).toBe('debug');
  });

  it('throws when a required variable is missing', () => {
    process.env = {
      NODE_ENV: 'test',
      REDIS_URL: 'redis://localhost:6379',
    };
    expect(() => parseEnv(apiEnvSchema)).toThrow(/Environment validation failed/);
  });

  it('throws when a numeric variable is invalid', () => {
    process.env = {
      NODE_ENV: 'test',
      API_PORT: 'not-a-number',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/institutional_knowledge',
      REDIS_URL: 'redis://localhost:6379',
    };
    expect(() => parseEnv(apiEnvSchema)).toThrow(/API_PORT/);
  });

  it('throws on unknown NODE_ENV values', () => {
    process.env = {
      NODE_ENV: 'staging',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/institutional_knowledge',
      REDIS_URL: 'redis://localhost:6379',
    };
    expect(() => parseEnv(apiEnvSchema)).toThrow(/NODE_ENV/);
  });

  it('rejects default MinIO credentials in production', () => {
    process.env = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/institutional_knowledge',
      REDIS_URL: 'redis://localhost:6379',
    };
    expect(() => parseEnv(apiEnvSchema)).toThrow(/not allowed in production/);
  });

  it('parses a valid worker environment', () => {
    process.env = {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/institutional_knowledge',
      REDIS_URL: 'redis://localhost:6379',
    };
    const env = parseEnv(workerEnvSchema);
    expect(env.WORKER_PORT).toBe(4100);
    expect(env.S3_BUCKET).toBe('institutional-documents');
  });

  it('requires database and redis for the worker', () => {
    process.env = { NODE_ENV: 'test' };
    expect(() => parseEnv(workerEnvSchema)).toThrow(/DATABASE_URL|REDIS_URL/);
  });
});
