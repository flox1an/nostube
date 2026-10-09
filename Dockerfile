# Build: dist/ (web + embed) and compiled server
FROM node:24-alpine AS build
WORKDIR /app
# Build context is the repository root (npm workspaces).
# NSFW safety (18+ confirmation, embed gate); only `off` disables it. Self-hosters only.
ARG VITE_NSFW_SAFETY=on
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/site/package.json apps/site/
COPY packages/core/package.json packages/core/
COPY packages/widgets/package.json packages/widgets/
RUN npm ci --ignore-scripts
COPY packages packages
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npx vite build \
 && npx vite build --config vite.embed.config.ts \
 && cp dist/index.html dist/404.html \
 && npx tsc server/standalone.ts --outDir server-dist \
      --module nodenext --moduleResolution nodenext \
      --target es2022 --skipLibCheck

# Runtime: prod deps + dist + compiled server only
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/site/package.json apps/site/
COPY packages/core/package.json packages/core/
COPY packages/widgets/package.json packages/widgets/
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
WORKDIR /app/apps/web
COPY --from=build /app/apps/web/dist ./dist
COPY --from=build /app/apps/web/server-dist ./server-dist
EXPOSE 8080
CMD ["node", "server-dist/standalone.js"]
