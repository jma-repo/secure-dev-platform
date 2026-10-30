FROM node:22.22.2-bookworm-slim

# Pull Debian security updates at build time. The base image tag is a snapshot,
# so a CVE patched in Debian after that snapshot is still present here. This
# trades a little build reproducibility for patches the tag has not picked up;
# the CI image job scans the result, so an unpatched build cannot merge.
RUN apt-get update \
 && apt-get upgrade -y \
 && rm -rf /var/lib/apt/lists/*

# The runtime never installs packages, so the package managers are pure attack
# surface: each carries its own dependency tree that gets scanned and patched on
# someone else's schedule. Remove npm, corepack and yarn together.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg

ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
WORKDIR /app

# Copy only the files needed at runtime. No npm dependencies are installed, and no source history, credentials, or scanners are included.
COPY --chown=node:node apps/ ./apps/
COPY --chown=node:node packages/ ./packages/
COPY --chown=node:node .gitleaks.toml package.json ./
COPY --chown=node:node scripts/tools.json ./scripts/tools.json

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "try { const r = await fetch('http://127.0.0.1:' + (process.env.PORT || '4173') + '/healthz', { signal: AbortSignal.timeout(3000) }); process.exit(r.status === 200 ? 0 : 1); } catch { process.exit(1); }"]

# This slim image does not support the real-scan live demo; run it in the full devcontainer or on the local machine.
# Having no third-party npm dependencies does not mean Node, the Debian system libraries, or the image are free of vulnerabilities.
CMD ["node", "apps/sample-service/server.mjs"]
