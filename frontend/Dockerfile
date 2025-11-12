# === Stage 1: Build ===
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the source code and build the app
COPY . .
RUN npm run build

# === Stage 2: Production ===
FROM node:20-alpine AS runner

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# --- 1. Create a non-root user ---
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# --- 2. Copy files and set owner at the same time ---
COPY --from=builder --chown=appuser:appgroup /app/.next ./.next
COPY --from=builder --chown=appuser:appgroup /app/public ./public
COPY --from=builder --chown=appuser:appgroup /app/package.json ./package.json
COPY --from=builder --chown=appuser:appgroup /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/next.config.ts ./next.config.ts

# --- 4. Switch to the non-root user ---
USER appuser

# Expose the port Next.js runs on
EXPOSE 3000

# Command to start the app
CMD ["npm", "start"]