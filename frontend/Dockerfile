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

# Copy built app from the 'builder' stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# --- ADD THESE TWO LINES ---
# Copy the lock file and the installed dependencies
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules

# This file is optional, but we'll keep the line
# If it fails, you can safely remove it
COPY --from=builder /app/next.config.ts ./next.config.ts

# Expose the port Next.js runs on
EXPOSE 3000

# Command to start the app
CMD ["npm", "start"]