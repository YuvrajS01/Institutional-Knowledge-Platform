import { z } from 'zod';

const s3CredentialsSchema = z.object({
  S3_ENDPOINT: z.string().url().default('http://localhost:9000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1).default('institutional-documents'),
  S3_ACCESS_KEY: z.string().min(1).default('minioadmin'),
  S3_SECRET_KEY: z.string().min(1).default('minioadmin'),
});

const loggingSchema = z.object({
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export const apiEnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: z.string().min(1).default('0.0.0.0'),
    API_PORT: z.coerce.number().int().positive().default(4000),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    ...s3CredentialsSchema.shape,
    ...loggingSchema.shape,
  })
  .superRefine((env, ctx) => {
    if (
      env.NODE_ENV === 'production' &&
      (env.S3_ACCESS_KEY === 'minioadmin' || env.S3_SECRET_KEY === 'minioadmin')
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['S3_ACCESS_KEY'],
        message: 'Default MinIO credentials are not allowed in production',
      });
    }
  });

export const workerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  WORKER_HOST: z.string().min(1).default('0.0.0.0'),
  WORKER_PORT: z.coerce.number().int().positive().default(4100),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
  ...loggingSchema.shape,
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;
