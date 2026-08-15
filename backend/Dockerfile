# Multi-stage build.
# Stage 1 installs production deps in a full toolchain image.
# Stage 2 is the runtime — only what's needed at runtime ships.
#
# Build context: repo root (needs migrations/ and fga/ dirs).
#   docker build -f backend/Dockerfile -t patient-records-backend .

# ---- Stage 1: install production dependencies --------------------------------
FROM node:22-alpine AS deps

WORKDIR /app/backend

# Copy manifests first so `npm ci` is cached unless deps change.
COPY backend/package.json backend/package-lock.json* ./

# --omit=dev drops nodemon and any other devDependencies.
# npm ci installs exact versions from the lockfile (reproducible).
RUN npm ci --omit=dev

# ---- Stage 2: runtime --------------------------------------------------------
FROM node:22-alpine AS runtime

WORKDIR /app

# node_modules from the deps stage (no build tools, no dev deps).
COPY --from=deps --chown=node:node /app/backend/node_modules ./backend/node_modules

# Source, scripts, and manifests.
COPY --chown=node:node backend/src      ./backend/src
COPY --chown=node:node backend/scripts  ./backend/scripts
COPY --chown=node:node backend/package.json ./backend/package.json

# Files the app reads from outside the backend dir.
# Migration runner reads ../../migrations; FGA bootstrap reads ../../fga.
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node fga        ./fga

USER node
WORKDIR /app/backend

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "src/index.js"]
