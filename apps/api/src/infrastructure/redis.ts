import { Redis } from 'ioredis';

export function createRedisClient(connectionString: string): Redis {
  return new Redis(connectionString, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
}
