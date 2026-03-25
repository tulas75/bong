# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production
FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm pkg delete scripts.prepare && npm ci --omit=dev --legacy-peer-deps

COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate

COPY --from=builder /app/dist ./dist
COPY public ./public

RUN ln -s /app/dist/cli.js /usr/local/bin/bong && chmod +x /app/dist/cli.js

EXPOSE 3000

CMD ["npm", "start"]
