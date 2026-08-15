# Three-stage build for a Next.js standalone image.
#   deps    — install every dep needed to build (includes devDependencies)
#   builder — run `next build` to produce .next/standalone
#   runtime — copy only the standalone output; tiny final image
#
# Build context: ./frontend
#   docker build -f frontend/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
#     -t patient-records-frontend ./frontend

# ---- Stage 1: install all dependencies ---------------------------------------
FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

# npm ci installs everything from the lockfile — including devDeps needed
# to build (tailwind, postcss, etc). This stage is discarded after builder.
RUN npm ci

# ---- Stage 2: build ----------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# NEXT_PUBLIC_* vars are BAKED IN at build time — must be present now.
# Pass via --build-arg (compose sets it under `build.args`).
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Produces .next/standalone/ with a minimal server + trimmed node_modules.
RUN npm run build

# ---- Stage 3: runtime --------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Standalone server binds to localhost by default — must be 0.0.0.0 in a container.
ENV HOSTNAME=0.0.0.0

# Standalone bundle: minimal server.js + trimmed node_modules.
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Static assets (CSS, JS chunks) are NOT copied into standalone by default.
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
# Public assets (favicon, images) also not auto-copied.
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]
