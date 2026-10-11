# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------
# financial-backend: imagen de produccion (multi-stage)
#   docker build -t financial-backend .
#   targets:  api (por defecto)  |  tools (migraciones y seed)
# ---------------------------------------------------------------
ARG NODE_VERSION=22

# 1) Todas las dependencias + compilacion --------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV HUSKY=0 CI=true
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
COPY prisma.config.ts tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
# prisma.config.ts exige DATABASE_URL aunque generate no se conecte
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npx prisma generate \
 && npm run build

# 2) Solo dependencias de produccion --------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /app
ENV HUSKY=0 CI=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts \
 && npm cache clean --force

# 3) tools: migraciones y seed (lleva prisma CLI y tsx) -------------------
FROM build AS tools
ENV NODE_ENV=production
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

# 4) api: lo minimo para correr -------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS api
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/data/uploads
WORKDIR /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
# carpeta de adjuntos: debe ser un volumen persistente
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME ["/data/uploads"]
USER node
EXPOSE 3000
# Cualquier respuesta HTTP < 500 (incluso 401) significa que el proceso esta vivo
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main"]
