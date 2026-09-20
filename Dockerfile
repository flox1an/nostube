# Build: dist/ (web + embed) and compiled server
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
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
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist
EXPOSE 8080
CMD ["node", "server-dist/standalone.js"]
