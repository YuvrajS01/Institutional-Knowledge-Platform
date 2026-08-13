import { closeTestPools } from './helpers/db.js';

export default async function globalTeardown(): Promise<void> {
  await closeTestPools();
}
