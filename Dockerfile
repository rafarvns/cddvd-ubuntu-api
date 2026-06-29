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
# - cdrdao: gravação de PS1 (CD, .cue)
# - dvd+rw-tools: fornece o growisofs, usado p/ PS2 (DVD, .iso) com -dvd-compat
# - wodim: utilitário auxiliar (scan / eject de fallback)
# - eject: ejeta a bandeja do drive
RUN apt-get update && apt-get install -y \
    wodim \
    cdrdao \
    dvd+rw-tools \
    eject \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

EXPOSE 48271

CMD ["node", "dist/app.js"]

