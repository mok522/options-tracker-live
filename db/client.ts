import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

declare global {
  // eslint-disable-next-line no-var
  var _db: ReturnType<typeof drizzle> | undefined;
}

function createDb() {
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });
  return drizzle(client, { schema });
}

export const db = globalThis._db ?? createDb();

if (process.env.NODE_ENV !== 'production') {
  globalThis._db = db;
}
