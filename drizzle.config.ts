import { defineConfig } from 'drizzle-kit';

// Migrations always run through the direct (unpooled) connection — DDL
// through a connection pooler can hit unexpected behavior when a statement
// takes a lock. See docs/13-deployment-vercel.md §4.
const DATABASE_URL_UNPOOLED = process.env.DATABASE_URL_UNPOOLED;
if (!DATABASE_URL_UNPOOLED) {
  throw new Error('DATABASE_URL_UNPOOLED is required to generate or run migrations');
}

export default defineConfig({
  schema: './src/lib/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  casing: 'snake_case',
  dbCredentials: {
    url: DATABASE_URL_UNPOOLED,
  },
  // Never `drizzle-kit push` outside local dev — see
  // tasks/03-database-foundation/spec.md "Batasan" and
  // docs/04-database-schema.md §14.
  strict: true,
  verbose: true,
});
