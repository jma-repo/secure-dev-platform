FROM node:22.22.2-bookworm

# Dev tools are installed as root at build time only; the dev environment then runs as node.
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV HOST=0.0.0.0 PORT=4173
WORKDIR /workspaces/secure-dev-platform
USER node

# Scanners are downloaded and verified by postCreateCommand. They do not depend on npm packages or the Docker socket.
# This configuration is for local Dev Containers. Port forwarding binds to localhost only; no cloud environment is enabled.
# If this moves to Codespaces, an organization policy must separately block public ports; devcontainer.json cannot enforce that policy.
CMD ["sleep", "infinity"]
