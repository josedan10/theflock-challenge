# syntax=docker/dockerfile:1.7
FROM node:26-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g corepack@0.36.0 \
  && corepack enable \
  && corepack prepare pnpm@10.33.0 --activate
WORKDIR /workspace

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY patches patches
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/contracts/package.json packages/contracts/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
EXPOSE 4000
# The Compose node_modules volume hides the image install, so a dependency
# added after that volume was created is missing until install runs there.
CMD pnpm install --frozen-lockfile && pnpm --filter @twitter-clone/api dev

FROM dependencies AS build
COPY . .
RUN pnpm --filter @twitter-clone/api build \
  && pnpm --filter @twitter-clone/api deploy --prod --legacy /opt/api

FROM node:26-bookworm-slim AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /opt/api/node_modules ./node_modules
COPY --from=build --chown=node:node /workspace/apps/api/dist ./dist
COPY --from=build --chown=node:node /workspace/apps/api/package.json ./package.json
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
