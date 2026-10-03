import pg from 'pg';

function sslFor(connectionString: string): { rejectUnauthorized: boolean } {
  // Timescale cloud presents a chain Node cannot verify against the system
  // CA store; enforce verification only on explicit verify-full.
  // (pg >= 8.23 forces verify-full semantics for sslmode=require, so the
  // mode is read here instead of being left to the driver.)
  const verify = /(?:[?&])sslmode=verify-full(?:&|$)/u.test(connectionString);
  return { rejectUnauthorized: verify };
}

function sanitized(connectionString: string): string {
  return connectionString.replace(/[?&]sslmode=[^&]*/u, '').replace(/[?&]$/u, '');
}

/** Shared pool. Reads DATABASE_URL; never logs it. */
export function createPool(connectionString = process.env.DATABASE_URL): pg.Pool {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  return new pg.Pool({ connectionString: sanitized(connectionString), ssl: sslFor(connectionString) });
}
