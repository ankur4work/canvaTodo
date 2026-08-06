# Backend image for the Canva app.
#
# Only the backend is containerised. The frontend is uploaded to Canva as a
# `dist/` bundle and served by Canva, so nothing in this image serves the UI.
#
# The build bundles the backend and every dependency into one file with
# esbuild, which is why the runtime stage installs nothing at all. That is
# worth the extra stage: this repo declares npm workspaces (`./examples/*/*`)
# that a production `npm ci` would try to resolve, and the runtime deps would
# otherwise have to be duplicated somewhere and kept in sync by hand. One
# bundled file has neither problem, boots faster, and gives a much smaller
# attack surface than a node_modules tree.

# ---- build ----
FROM node:22-alpine AS builder

WORKDIR /app

# The full source is copied before installing because the workspace globs in
# package.json must resolve for `npm ci` to succeed.
COPY . .

RUN npm ci --ignore-scripts && npm run build:backend

# ---- runtime ----
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV CANVA_BACKEND_PORT=3001

WORKDIR /app

# Brand kits live here. Mount a Coolify persistent volume at /data or every
# redeploy silently discards what your users have saved — the container
# filesystem does not survive a deploy.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

COPY --from=builder /app/dist-server/server.js ./server.js

# Drop root. Nothing here needs to write outside /data.
USER node

EXPOSE 3001

# Hits the public health endpoint from `utils/backend/base_backend/create.ts`.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.CANVA_BACKEND_PORT||3001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
