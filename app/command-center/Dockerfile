FROM node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2 AS deps

WORKDIR /app
ENV npm_config_audit=false \
    npm_config_fund=false

COPY package.json package-lock.json ./
COPY vendor/ ./vendor/
RUN npm ci

FROM deps AS build

# Optional source-map upload uses a BuildKit secret, never a build argument/layer.
# Pass --secret id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN when activating uploads.
ARG PUBLIC_SENTRY_DSN=""
ARG PUBLIC_SENTRY_ENVIRONMENT="production"
ARG SENTRY_RELEASE=""
ARG CRM_SALES_MIRROR_ASSETS_PREFIX=""

COPY . .
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN 2>/dev/null || true)" \
    PUBLIC_SENTRY_DSN="$PUBLIC_SENTRY_DSN" \
    PUBLIC_SENTRY_ENVIRONMENT="$PUBLIC_SENTRY_ENVIRONMENT" \
    PUBLIC_SENTRY_RELEASE="$SENTRY_RELEASE" \
    SENTRY_RELEASE="$SENTRY_RELEASE" \
    CRM_SALES_MIRROR_ASSETS_PREFIX="$CRM_SALES_MIRROR_ASSETS_PREFIX" \
    npm run build

FROM node:22.23.0-bookworm-slim@sha256:d9f850096136edbc402debdd8729579a288aac64574ada0ff4db26b6ae58b0b2 AS runner

WORKDIR /app
ENV HOST=0.0.0.0 \
    NODE_ENV=production \
    PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY vendor/ ./vendor/
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/public ./public
COPY --from=build --chown=node:node /app/runtime ./runtime
# Dependencies remain read-only to the runtime; /app permits adapter session storage.
RUN chown node:node /app

EXPOSE 8080

USER node
CMD ["npm", "run", "start"]
