# FlowGuard Backend Dockerfile
FROM node:20-alpine AS base

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY src ./src

# Generate Prisma Client
RUN npx prisma generate

EXPOSE 4000

ENV NODE_ENV=production
ENV PORT=4000

CMD ["node", "src/server.js"]

