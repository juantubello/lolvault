# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# better-sqlite3 es nativo: si no hay binario precompilado para esta versión de Node y
# arquitectura, npm lo compila con node-gyp (python3 + make + g++). Solo en esta etapa:
# el runner copia el .node ya compilado y no lleva el toolchain.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

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

# El sync de Draft se corre con `docker exec` desde el cron del host, asi que tiene que existir
# adentro de la imagen: el runner no lleva tsx ni src/. Mismo empaquetado que el migrador, con las
# migrations al lado porque el CLI llama a runMigrations() y esa carpeta se resuelve relativa a
# import.meta.url.
RUN node_modules/.bin/esbuild src/features/draft/sync-cli.ts \
      --bundle --platform=node --format=esm --target=node22 \
      --external:better-sqlite3 \
      --outfile=/app/draft-sync/draft-sync.mjs \
 && cp -r src/db/migrations /app/draft-sync/migrations

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
COPY --from=builder /app/draft-sync ./draft-sync
COPY docker/entrypoint.sh docker/pre-migrate-backup.mjs ./docker/

RUN chmod +x docker/entrypoint.sh \
 && mkdir -p /data /app/.next/cache \
 && chown -R node:node /data /app/.next \
 && chmod 0777 /app/.next/cache

# Etiqueta para que el `docker image prune` del deploy pueda apuntar SOLO a las
# imagenes huerfanas de LolVault y no a las de los otros stacks del homelab.
LABEL app="lolvault"

USER node
EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]
CMD ["node", "server.js"]
