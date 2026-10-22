FROM node:22.22.2-bookworm-slim

ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
WORKDIR /app

# 仅复制运行所需文件；不安装 npm 依赖，不带源码历史、凭据或扫描器。
COPY --chown=node:node apps/ ./apps/
COPY --chown=node:node packages/ ./packages/
COPY --chown=node:node .gitleaks.toml package.json ./
COPY --chown=node:node scripts/tools.json ./scripts/tools.json

USER node
EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD ["node", "--input-type=module", "-e", "try { const r = await fetch('http://127.0.0.1:' + (process.env.PORT || '4173') + '/healthz', { signal: AbortSignal.timeout(3000) }); process.exit(r.status === 200 ? 0 : 1); } catch { process.exit(1); }"]

# 该精简镜像不支持真实扫描 live demo；请在完整 devcontainer 或本机运行。
# 无第三方 npm 依赖不代表 Node、Debian 系统库或镜像不存在漏洞。
CMD ["node", "apps/sample-service/server.mjs"]
