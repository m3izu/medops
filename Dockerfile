# Stage 1: Build client React static files
FROM node:20-alpine AS client-builder
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Install server dependencies and build backend
FROM node:20-alpine
WORKDIR /app

# Install build dependencies for compiling better-sqlite3 native binaries
RUN apk add --no-cache python3 make g++

COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm ci

# Copy server code
COPY server/ ./

# Generate Prisma client
RUN npx prisma generate

# Copy compiled frontend from client-builder stage
COPY --from=client-builder /app/client/dist /app/client/dist

# Expose port and configure production env
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Command to generate Prisma client and run seed/start script on boot
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run seed && node index.js"]
