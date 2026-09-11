# The universal path: the Node build of the app in one image.
#   docker build -t openmuse .
#   docker run --env-file .env.local -p 3000:3000 -v openmuse-data:/data openmuse
# Configuration is environment-only (.env.example). The session map is a
# file under OPENMUSE_STATE_DIR (/data here; mount a volume).
# Published to ghcr.io/diggerhq/openmuse by .github/workflows/image.yml.

FROM node:22-alpine AS build
WORKDIR /app
# The dependency manifest first so the install layer is cached across source changes.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    OPENMUSE_STATE_DIR=/data
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
# Only the state directory is writable by the app user; chowning /app would copy the dependency layer.
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
# The cheap route every host polls; 503 with the reason when the configuration is unusable.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" || exit 1
# srvx in-process (no fork), PID 1 receives the host's SIGTERM.
CMD ["node", "node_modules/srvx/bin/srvx.mjs", "--prod", "--static", "../client", "dist/server/server.js"]
