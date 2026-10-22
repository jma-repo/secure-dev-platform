FROM node:22.22.2-bookworm

# 仅构建时使用 root 安装开发工具；进入开发环境后使用 node。
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends git python3 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV HOST=0.0.0.0 PORT=4173
WORKDIR /workspaces/secure-dev-platform
USER node

# 扫描器由 postCreateCommand 下载并校验，不依赖 npm 包或 Docker socket。
# 本配置用于本机 Dev Containers，端口转发仅绑定 localhost，不启用云环境。
# 若迁移到 Codespaces，必须另用组织策略禁止 public；devcontainer.json 无法强制该策略。
CMD ["sleep", "infinity"]
