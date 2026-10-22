# SENTINEL PoC — 交接与下次启动指南

最后更新：2026-10-21（本机时区 MDT）
仓库：https://github.com/jma-repo/secure-dev-platform （私有）
分支：`main`，最新提交以 `git log -1` 为准

---

## 1. 一句话现状

一个本地可运行、零云资源的「安全统一开发环境」PoC：monorepo + 统一开发容器 + 真实密钥门禁 + CI 安全流水线配置 + 无云资源 Terraform 契约 + 受限运行容器 + 数据不出内网的本地 RAG。
**核心卖点：演示里的拦截、放行、问答都是真的执行结果，不是前端动画；未验证的项目在界面上明确标为 blocked / not run。**

---

## 2. 客户诉求对照

客户原话大致是：*安全的统一开发环境，所有 developer 在同一个 repo、同一套环境里开发；Copilot 是从头 deploy、看内部 data、然后 train model。*

| 客户诉求 | 翻译成工程语言 | 当前状态 | 证据 / 缺口 |
| --- | --- | --- | --- |
| 统一 repo | 一个 monorepo 放应用、共享模块、环境定义、流水线、基础设施 | ✅ 已完成 | `apps/`、`packages/`、`.devcontainer/`、`.github/`、`infra/` 同仓；已推 GitHub |
| 统一开发环境 | 新人一条命令进入同版本工具链 | 🟡 配置完成，容器镜像已实跑 | `.devcontainer/` + `.nvmrc` 固定 Node 22.22.2；运行镜像构建并健康运行；**Dev Container 本身未在 VS Code 里完整构建过** |
| 很多开发者一起开发 | 分支保护、评审、代码归属 | 🟡 只有骨架 | `CODEOWNERS` 是注释模板，`branch-protection.template.json` 是 REST body；**未接真实组织、未启用保护** |
| 安全 | merge 前自动卡住密钥、漏洞、危险配置 | 🟢 密钥门禁真跑通；其余部分完成 | Gitleaks 真实拦截/放行、暂存区防绕过已实测；CodeQL / Trivy / Terraform 校验只有配置，未在远端跑过 |
| 基础设施即代码 | 可评审、可校验，不手动点控制台 | 🟡 契约示例 | 仅 `terraform_data`，无云 provider、无 backend、不 apply；`fmt` 已过，`init/validate` 本机被环境阻断 |
| 容器化运行 | 在哪儿跑都一样，且受限 | ✅ 已实跑 | 非 root、只读根文件系统、cap-drop ALL、256MB / 128 pids、健康检查通过；**镜像漏洞扫描被 Trivy 环境问题阻断** |
| Copilot / 内部数据问答 | 接内部资料做检索，不是训练模型 | 🟢 本地替代方案已完成 | 本地 Qwen + nomic embedding，7 篇文档 / 64 片段（混合检索），回答带来源，资料没有会说没有；**不是 Copilot Studio 替代品** |
| 客户对 Copilot 的误解 | “从头 deploy 再 train model” | ✅ 已澄清 | Copilot Studio 是低代码 agent 平台，接数据源做检索/流程，不训练基础模型，需要微软许可 |

**一句话对客户的说法：**
> 统一仓库、统一环境、安全门禁的技术路径我已经跑通，其中密钥门禁和容器加固是真实执行验证过的；多人协作规则和远端 CI 需要接到你们的真实仓库和许可证后再启用；AI 部分我先用本机模型验证了“资料不出内网也能问答”，它和 Copilot Studio 不是一回事。

---

## 3. 已实际验证 / 未验证（不要混）

### 已验证（可现场演示）

- Node 22.22.2 固定运行时；**23 项测试全部通过**
- 合成密钥被真实 Gitleaks 拦截（退出码 42），修复后放行（退出码 0）
- 暂存区防绕过：密钥已 `git add`，只在工作区删掉、不重新 add，仍然拦截
- 当前源码扫描通过（47 个文件，不含 `.tools`、`.rag`、`outputs`）
- `terraform fmt -check` 通过（3 个文件，经 stdin）
- `docker compose config` 通过
- 运行镜像构建成功；容器只读、非 root、cap-drop ALL、资源受限、健康检查通过
- 本地 RAG：混合检索（向量 + 关键词）+ 生成，4 条来源，约 12–25 秒；问知识库外的问题会明确说“现有资料没有写”
- 浏览器端到端：拦截、放行、证据页、复制、Local AI、移动端无横向溢出、无 JS 异常、无 CSP 违规

### 未验证（界面与文档均已标注，不要宣称完成）

- Dev Container 在 VS Code 中的完整构建（只验证了运行镜像）
- Terraform `init` / `validate`：本机 Go 工具读项目目录报 `winapi error #5`
- Trivy 配置扫描与镜像漏洞扫描：同一原因，读 `~/.docker/config.json` 失败
- GitHub Actions / CodeQL 实际运行（未推送触发、未开 PR）
- 分支保护 / CODEOWNERS 实际生效（需管理员在 GitHub 设置）
- 没有 Kubernetes、没有云资源、没有 SSO / RBAC / 审计

---

## 4. 下次客户要 demo，怎么跑

### 前置条件

- Node.js **22.22.2**
- Python 3（仅用于下载固定版本工具）
- Docker Desktop（只有演示容器时才需要）
- LM Studio（只有演示 Local AI 时才需要）

### 第 1 步：启动本地模型（演示 AI 才需要）

```powershell
& "$env:USERPROFILE\.cache\lm-studio\bin\lms.exe" server start --port 1234
& "$env:USERPROFILE\.cache\lm-studio\bin\lms.exe" ps
```

需要两个模型：
- 聊天：**`qwen2.5-3b-instruct`**（约 1.93GB，演示用，一问 8–30 秒）
- 聊天（备选）：`qwen/qwen3.8-27b`（17.7GB，质量更好但 CPU 上约 4 token/秒，一问要几分钟，不适合现场）
- 嵌入：`text-embedding-nomic-embed-text-v1.5`

代码默认优先选 3B 模型；要用 27B 就设环境变量 `LOCAL_CHAT_MODEL=qwen/qwen3.8-27b`。

> 27B 是推理模型，LM Studio 会忽略 `chat_template_kwargs.enable_thinking` 和 `/no_think`，推理 token 会吃掉 `max_tokens`。所以代码走 `/chat/completions`（推理在独立字段），预算按"推理 + 答案"一起算。改 `max_tokens` 前先读 `packages/local-rag/index.mjs` 那段注释。

确认接口：

```powershell
curl http://127.0.0.1:1234/v1/models
```

也可以直接开 LM Studio → Developer → Start Server。

### 第 2 步：启动 demo

```powershell
cd C:\Users\jma92\OneDrive\Documents\claude_projects\secure-dev-platform
.\start-demo.cmd
```

首次会自动下载并校验 Gitleaks。打开 **http://127.0.0.1:4173**。

手动等价命令：

```powershell
python scripts/bootstrap-tools.py gitleaks
node apps/sample-service/server.mjs
```

### 第 3 步：演示顺序（约 7 分钟）

> **界面语言为英文**（客户主要语言是 English）。六个页签：Overview / Live demo / Security report / Local AI / Evidence / Handoff。

1. **Overview**：讲 monorepo 与四段路径，强调“图是设计路径，通过什么看证据”。
2. **Live demo**：点「Demo leak → blocked」→ 看 Blocked / exit 42；点「Demo repair → passed」→ 看 Passed / exit 0。
3. **Security report**：这是 Snyk / SonarQube 那一类页面。顶部是 **quality gate**（当前 `Incomplete`），下面是每个扫描器一行、以及“什么会挡住合并”的阈值表。重点讲那句 `Not provable yet` —— 不是失败，是“这台机器上没能验证”。
4. **Local AI**：徽标 Ready，点示例问题，看回答的 `[1]` 来源、Sources 列表、`Egress: Loopback only`。
5. **Evidence**：逐条看真实记录，主动指出 blocked / not run 的项。
6. **Handoff**：打开 `scripts/pre-commit.mjs`、`ci.yml`、`terraform/main.tf`，讲“本地 hook 可绕过，所以需要远端 required checks”。

### 第 4 步：可选加分演示

**断网测试**：关掉 WiFi 再问一次 Local AI，仍然能回答 → 证明数据不出内网。

**绕过测试**：

```powershell
git add docs/knowledge/security-policy.md
# 在工作区随便加一个假密钥，但不要 git add
node scripts/pre-commit.mjs   # 仍会扫描暂存区版本
```

**容器演示**：

```powershell
docker build -t secure-dev-poc:ci .
docker run -d --name sentinel-poc --read-only --tmpfs /tmp `
  --cap-drop ALL --security-opt no-new-privileges:true `
  --memory 256m --cpus 1 --pids-limit 128 `
  -p 127.0.0.1:4180:4173 secure-dev-poc:ci
docker ps --filter name=sentinel-poc
```

访问 http://127.0.0.1:4180 。注意：容器里访问不到宿主 LM Studio，Local AI 会显示不可用，这是隔离的预期结果。

### 第 5 步：一键验收

```powershell
node --test                  # 26 项测试
node scripts/rag-smoke.mjs   # RAG 四项检查
node scripts/verify.mjs      # 生成本地证据 outputs/evidence.json
```

> **可选**：`$env:GITHUB_TOKEN = "<PAT>"` 后再跑 `verify.mjs`，它会去 GitHub API 读 HEAD 上真实那次 CI run，把 job 清单和 run 链接写进证据里的 `ci` 一项。
> 不设 token 就如实记 `not_run` 并说明原因——两种情况都不会凭空断言 CI 通过。

---

## 5. 知识库怎么加资料

1. 把 `.md` 放进 `docs/knowledge/`（按 `##` 标题切块，单块上限 760 字）。
2. 重建索引：

```powershell
curl -X POST http://127.0.0.1:4173/api/rag/reindex
```

3. 刷新 `#local-ai`，徽标应显示新的文档数 / 片段数。

当前：**7 篇文档 / 64 个片段**（密钥规范、入职指南、AI 使用边界、平台边界、伊甸之东概要、Canlus 官网信息、README）。

**注意：**
- `docs/knowledge/east-of-eden.md` 是版权作品的**概要**，不是原文；不要上传受版权保护的全书。
- 不要写“泛泛的要点总结”段落，会稀释检索排序（实测过：加了一段通用要点，安全问题的首条来源被挤到书的那一段）。
- 中文提问里带品牌名（例如“Canlus 怎么收费”）会偏向反复出现品牌名的片段，这是 embedding 模型英文优先导致的。已用混合检索（向量 0.55 + BM25 关键词 0.45）修复；如果仍答偏，把问题写成关键词式（“固定月费”“vCISO 月费”）立刻命中。
- 索引文件 `.rag/index.json` 不入 Git，换机器会自动重建。

---

## 6. 已知坑

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `gitleaks` 报 `winapi error #5` | 本机沙箱限制 Go 工具读文件 | 已改为 stdin + 环境变量传配置，正常路径可用 |
| `terraform init` / `trivy` 报同样错误 | 同上 | 在普通终端或 Dev Container 里补跑；证据标 blocked，不伪报 |
| reindex 后数量没变 | 旧版本缓存 bug | 已修复（`buildIndex` 同步更新 `cached`），并有回归测试 |
| Local AI 徽标不是 Ready | LM Studio server 没开 / 没加载 embedding 模型 | 启动 server，确认两个模型都在 |
| Local AI 一问要几分钟或超时 | 加载的是 27B 模型 | 改加载 `qwen2.5-3b-instruct`；或设 `LOCAL_CHAT_MODEL` 明确指定 |
| 回答很慢（10–25 秒） | 27B 模型本机推理 | 演示前先问一次预热；或换更小模型 |
| 容器里 Local AI 不可用 | 容器内 127.0.0.1 是自己 | 预期隔离，不是 bug |
| PowerShell 传中文 JSON 变问号 | Windows PowerShell 默认编码 | 用 Node 或 `-ContentType "application/json; charset=utf-8"` |

---

## 7. 下次优先做什么

按客户价值排序：

1. **接真实 GitHub 组织**：填 CODEOWNERS、开分支保护、跑一次 CI 和 CodeQL（需要确认许可证）。
2. **补完 Trivy**：在正常终端或 CI 里跑镜像漏洞扫描，按真实结果升级基础镜像。
3. **Dev Container 实跑**：在目标机器用 VS Code 打开，确认一键进入。
4. **替换知识库**：用客户脱敏后的真实文档替换 `docs/knowledge/`，观察检索质量。
5. **可选**：加身份认证（OIDC / SSO）与审计日志，这是从 PoC 走向可交付的必经一步。

---

## 8. 给客户的三个问题（决定架构）

1. 开发环境主要在 Azure/AWS、现有机房，还是开发者本机？
2. 代码和依赖能不能访问外网？如果完全不能，Copilot Studio 云方案可能不适用，应走内网自建检索。
3. 目前用什么代码平台、SSO、安全扫描许可？私有仓库的 CodeQL 需要相应授权。

---

## 9. 关键文件索引

```text
apps/sample-service/          页面 + API + 测试（26 项）
packages/security-policy/     真实 Gitleaks 调用、暂存区检查
packages/local-rag/           切块、本地 embedding、检索、生成
docs/knowledge/               7 篇知识库文档
scripts/pre-commit.mjs        读 Git index + 暂存策略
scripts/verify.mjs            生成本地证据
scripts/rag-smoke.mjs         RAG 一键验收
scripts/browser-check.cjs     浏览器端到端 + 截图
scripts/dependency-inventory.py  先说清依赖扫描能读到什么，再扫
.github/workflows/            ci.yml / codeql.yml（CodeQL 私有库需许可，跳过）
infra/terraform/              零云资源契约（未 apply）
outputs/                      证据、截图、zip（不入 Git）
DEMO_GUIDE.md                 客户现场话术
```

---

## 10. 下次 session 怎么快速接上

对 AI 说：

> 读 `HANDOFF.md`，然后检查 `git log -1`、`outputs/evidence.json` 和 `node --test` 的结果，告诉我当前哪些是已验证、哪些还没验证。

如果要继续做，先跑：

```powershell
git status
node --test
node scripts/rag-smoke.mjs
```

确认基线是绿的，再改东西。
