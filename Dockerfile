FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run check:content && rm -rf dist/art/source

FROM node:24-bookworm-slim
ARG BUILD_ID=local
ENV APP_BUILD_ID=$BUILD_ID
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared
COPY src/locales ./src/locales
COPY content ./content
COPY scripts/backup.mjs scripts/verify-backup.mjs scripts/metrics.mjs scripts/publish-assets.mjs scripts/loadtest.mjs scripts/volume-probe.mjs ./scripts/
COPY --from=build /app/public/art/manifest.json ./public/art/manifest.json
EXPOSE 8080
CMD ["node","server/index.mjs"]
