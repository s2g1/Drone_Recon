FROM node:20-alpine

# Install ffmpeg for video stitching
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy shared package
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src/ packages/shared/src/
COPY packages/shared/tsconfig.json packages/shared/

# Copy server package
COPY packages/server/package.json packages/server/
COPY packages/server/src/ packages/server/src/
COPY packages/server/tsconfig.json packages/server/

# Copy root configs
COPY package.json pnpm-workspace.yaml tsconfig.json ./

# Install pnpm globally
RUN npm install -g pnpm@9

# Install all deps
RUN pnpm install --no-frozen-lockfile

# Build shared then server
RUN cd packages/shared && npx tsc --project tsconfig.json
RUN cd packages/server && npx tsc --project tsconfig.json

# Create uploads directory
RUN mkdir -p /app/uploads

WORKDIR /app/packages/server

EXPOSE 3000 3443

CMD ["node", "dist/index.js"]
