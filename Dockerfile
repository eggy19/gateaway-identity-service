# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build \
 && npm prune --omit=dev

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# node_modules disalin dari stage build (sudah di-prune) agar native module
# argon2 tidak perlu di-install ulang; kedua stage memakai base image yang sama.
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# certs/private.pem tidak ada di image — di-mount saat runtime.
USER node
EXPOSE 3000

CMD ["node", "dist/main.js"]
