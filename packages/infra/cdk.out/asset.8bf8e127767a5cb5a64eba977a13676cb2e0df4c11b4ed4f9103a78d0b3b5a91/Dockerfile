FROM node:20-alpine

# Install ffmpeg for video stitching
RUN apk add --no-cache ffmpeg

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.json ./

# Copy package.json files for all packages
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/

# Install dependencies
RUN pnpm install --frozen-lockfile --filter @argus/shared --filter @argus/server

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Build shared types first, then server
RUN pnpm --filter @argus/shared build
RUN pnpm --filter @argus/server build

# Expose ports
EXPOSE 3000 3443

# Start the server
CMD ["node", "packages/server/dist/index.js"]
