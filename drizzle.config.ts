import { defineConfig } from 'drizzle-kit';

// Este archivo se usa únicamente para generar migrations versionadas.
// Nunca usar `drizzle-kit push` contra la base del homelab.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
