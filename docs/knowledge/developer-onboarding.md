# 新开发者入职指南

## 第一天要做什么

1. 安装 Docker Desktop 与 VS Code，并安装 Dev Containers 扩展。
2. 克隆统一的 monorepo，不要在本地另建项目目录。
3. 在 VS Code 中选择 Reopen in Container，进入统一开发环境。
4. 等待初始化完成，它会安装 Gitleaks、Trivy、Terraform 并接入提交前检查。
5. 运行 `node --test` 确认环境正常，再运行 `node apps/sample-service/server.mjs` 打开本地演示。

## 统一环境包含什么

Node.js 固定为 22.22.2，运行时只用标准库，没有 npm 第三方运行依赖。开发容器使用非 root 的 `node` 用户，移除全部 Linux capabilities，禁止提权，不挂载 Docker socket，只把 4173 端口转发到本机。

镜像 tag 与系统包仓库不是不可变的。生产化时应固定镜像 digest、建立补丁节奏，并使用受控的软件源。

## 代码归属与协作

`CODEOWNERS` 用来声明谁负责哪些目录，但它本身不会阻止合并。仓库管理员还需要配置分支保护或 ruleset：要求 Pull Request、至少一名评审、Code Owner 批准、必需状态检查通过，并禁止强制推送和删除分支。

提交信息应说明改动目的。涉及安全规则、CI 流水线、开发容器和基础设施目录的改动，必须由对应负责人评审。

## 本地常用命令

- `node --test`：运行测试
- `node scripts/verify.mjs`：生成本地验证证据
- `python scripts/bootstrap-tools.py gitleaks terraform trivy`：准备固定版本工具
- `docker compose up --build`：以受限方式运行示例服务
