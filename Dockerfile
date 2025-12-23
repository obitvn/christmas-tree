  FROM node:20-alpine AS builder

  WORKDIR /app

  # Copy package files
  COPY package.json package-lock.json ./

  # Install dependencies
  RUN npm ci

  # Copy source code
  COPY . .

  # Build with error handling
  RUN npm run build || echo "Build failed, checking..." && exit 1

  FROM node:20-alpine

  WORKDIR /app

  # Copy package files
  COPY package.json package-lock.json ./

  # Install only production dependencies
  RUN npm ci --only=production

  # Copy built files from builder stage
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/public ./public

  # Expose port
  EXPOSE 8080

  # Set environment to production
  ENV NODE_ENV=production

  # Run with Vite preview server
  CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "8123"]
