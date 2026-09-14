# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV DATABASE_PATH=/tmp/lolvault-build.db

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
RUN npm run build

# El runner no incluye tsx: se empaqueta el migrador como ESM y se dejan las
# migrations versionadas a su lado para que import.meta.url siga resolviendo.
RUN node_modules/.bin/esbuild src/db/migrate.ts \
      --bundle --platform=node --format=esm --target=node22 \
      --external:better-sqlite3 \
      --outfile=/app/migrate/migrate.mjs \
 && cp -r src/db/migrations /app/migrate/migrations

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_PATH=/data/lolvault.db

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# better-sqlite3 carga su binario desde una ruta dinámica que el file tracer
# no siempre descubre. Las demás se copian como defensa para el runtime.
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=builder /app/node_modules/jose ./node_modules/jose

COPY --from=builder /app/migrate ./migrate
COPY docker/entrypoint.sh docker/pre-migrate-backup.mjs ./docker/

RUN chmod +x docker/entrypoint.sh \
 && mkdir -p /data /app/.next/cache \
 && chown -R node:node /data /app/.next \
 && chmod 0777 /app/.next/cache

USER node
EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "server.js"]
