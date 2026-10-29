# API only. Build public compatibility metadata, but ship no frontend/media files.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:api

FROM node:24-bookworm-slim
ARG BUILD_ID=local
ENV APP_BUILD_ID=$BUILD_ID NODE_ENV=production HOST=0.0.0.0 PORT=8080
WORKDIR /app
COPY --from=build /app/dist-api/ ./
RUN npm ci --omit=dev && npm cache clean --force
EXPOSE 8080
CMD ["node","server/index.mjs"]
