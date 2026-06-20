FROM node:22-bookworm-slim AS deps

WORKDIR /app
ENV npm_config_audit=false \
    npm_config_fund=false

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

# Sentry build-time inputs (passed as Coolify build args). SENTRY_AUTH_TOKEN lets the Sentry Vite
# plugin upload source maps during `astro build`; PUBLIC_SENTRY_DSN is baked into the client bundle.
# These live ONLY in this build stage — the runner stage below is a separate FROM and never sees
# the token. (Upgrade path: BuildKit `--mount=type=secret` for stricter secret hygiene.)
ARG SENTRY_AUTH_TOKEN=""
ARG PUBLIC_SENTRY_DSN=""
ARG PUBLIC_SENTRY_ENVIRONMENT="production"
ARG SENTRY_RELEASE=""

COPY . .
RUN SENTRY_AUTH_TOKEN="$SENTRY_AUTH_TOKEN" \
    PUBLIC_SENTRY_DSN="$PUBLIC_SENTRY_DSN" \
    PUBLIC_SENTRY_ENVIRONMENT="$PUBLIC_SENTRY_ENVIRONMENT" \
    PUBLIC_SENTRY_RELEASE="$SENTRY_RELEASE" \
    SENTRY_RELEASE="$SENTRY_RELEASE" \
    npm run build

FROM node:22-bookworm-slim AS runner

WORKDIR /app
ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/runtime ./runtime
RUN chown -R node:node /app

EXPOSE 8080

USER node
CMD ["npm", "run", "start"]
