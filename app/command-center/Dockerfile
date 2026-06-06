FROM node:22-bookworm-slim AS deps

WORKDIR /app
ENV npm_config_audit=false \
    npm_config_fund=false

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

COPY . .
RUN npm run build

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
RUN chown -R node:node /app

EXPOSE 8080

USER node
CMD ["node", "dist/server/entry.mjs"]
