FROM node:22-alpine as builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/dist ./dist

# Add cloud run health check
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:\${PORT:-8080}/health || exit 1

CMD ["node", "dist/index.js"]