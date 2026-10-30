FROM node:22-bookworm-slim AS deps

WORKDIR /app
ENV npm_config_audit=false \
    npm_config_fund=false

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

# Public Sentry metadata can be build arguments. Private upload credentials are optional
# BuildKit secrets: docker build --secret id=SENTRY_AUTH_TOKEN,env=SENTRY_AUTH_TOKEN .
# Secret contents exist only during the build instruction and are not image configuration.
ARG PUBLIC_SENTRY_DSN=""
ARG PUBLIC_SENTRY_ENVIRONMENT="production"
ARG SENTRY_RELEASE=""

COPY . .
RUN --mount=type=secret,id=SENTRY_AUTH_TOKEN \
    SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN 2>/dev/null || true)" \
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
