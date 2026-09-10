FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    RAFIQ_DATABASE_PATH=/data/rafiq.enc \
    RAFIQ_STATUS_PATH=/tmp/rafiq-status.json
RUN mkdir -p /data && chown node:node /data
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node src ./src
COPY --chown=node:node scripts/run.mjs scripts/healthcheck.mjs ./scripts/
COPY --chown=node:node assets/rafiq-banner-v3.webp ./assets/
COPY --chown=node:node assets/sounds ./assets/sounds
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 CMD ["node", "scripts/healthcheck.mjs"]
CMD ["node", "scripts/run.mjs"]
