# syntax=docker/dockerfile:1

# ---- Base stage ----
FROM node:22-alpine AS base
WORKDIR /app

# ---- Dependencies stage ----
# Install only production dependencies from package-lock.json for reproducibility.
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Runtime stage ----
FROM base AS runtime

# Copy installed node_modules from the deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy only the files the server needs to run:
#   - package.json  (for module type resolution)
#   - src/          (game.js, uno-bot.js, and server/server.js)
COPY package.json ./
COPY src/ ./src/

# Environment defaults (can be overridden at runtime)
ENV NODE_ENV=production

# Expose the boardgame.io server port and the debug endpoint port
EXPOSE 8001 8002

# Run the multiplayer server
CMD ["node", "src/server/server.js"]