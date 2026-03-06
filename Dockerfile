# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Stage: Development (for compose-dev with hot-reload)
FROM node:20-alpine AS development
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY package-lock.json* ./
COPY . .

EXPOSE 4000
ENV PORT=4000
CMD ["npm", "run", "start:dev"]

# Stage 2: Build
FROM node:20-alpine AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 -G nodejs

# Copy package files for production install
COPY package.json package-lock.json* ./

# Install production deps + ts-node/tsconfig-paths for seed script
RUN npm ci --omit=dev && \
    npm install ts-node tsconfig-paths --save

# Copy built application
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/tsconfig.json ./

# Ownership
RUN chown -R nestjs:nodejs /app

USER nestjs

EXPOSE 3000

# Health check - NestJS typically exposes /docs or / for health
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/docs || exit 1

CMD ["node", "dist/main"]
