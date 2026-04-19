# Build Stage
FROM node:20-bullseye AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Runtime Stage
FROM node:20-bullseye-slim

WORKDIR /app

# Install native burning tools
RUN apt-get update && apt-get install -y \
    wodim \
    cdrdao \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 48271

CMD ["node", "dist/app.js"]

