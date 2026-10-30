# SENTINEL PoC — Handoff and Next-Startup Guide

Last updated: 2026-10-21 (local time, MDT)
Repository: https://github.com/jma-repo/secure-dev-platform (private)
Branch: `main`. For the latest commit, see `git log -1`.

---

## 1. Current Status in One Sentence

A locally runnable, zero-cloud-resource "unified secure development environment" PoC: monorepo + unified dev container + real secret gate + CI security pipeline configuration + zero-cloud-resource Terraform contract + restricted runtime container + local RAG whose data stays inside the network.
**Core selling point: the blocking, passing, and Q&A in the demo are real execution results, not front-end animations. Unverified items are explicitly marked blocked / not run in the UI.**

---

## 2. Client Requirements Mapping

The client's words were roughly: *a secure, unified development environment where all developers work in the same repo and the same environment; Copilot would be deployed from scratch, look at internal data, and then train a model.*

| Client requirement | Engineering translation | Current status | Evidence / gap |
| --- | --- | --- | --- |
| Unified repo | One monorepo for apps, shared modules, environment definitions, pipelines, and infrastructure | ✅ Done | `apps/`, `packages/`, `.devcontainer/`, `.github/`, and `infra/` in one repo; pushed to GitHub |
| Unified dev environment | A new hire enters the same-version toolchain with one command | 🟡 Configured; container image has actually run | `.devcontainer/` + `.nvmrc` pin Node 22.22.2; the runtime image builds and runs healthy; **the Dev Container itself has not been fully built in VS Code** |
| Many developers working together | Branch protection, review, code ownership | 🟡 Skeleton only | `CODEOWNERS` is a commented template, and `branch-protection.template.json` is a REST body; **not connected to a real organization; protection not enabled** |
| Security | Automatically block secrets, vulnerabilities, and dangerous configuration before merge | 🟢 Secret gate verified end to end; rest complete | Real Gitleaks blocking/passing and staging-area bypass prevention were tested; CodeQL / Trivy / Terraform validation are configured only and have not run remotely |
| Infrastructure as code | Reviewable and verifiable; no manual console clicks | 🟡 Contract example | Only `terraform_data`; no cloud provider, no backend, no apply; `fmt` passes; `init/validate` are blocked on this machine by the environment |
| Containerized runtime | Runs the same everywhere, and restricted | ✅ Actually run | Non-root, read-only root filesystem, cap-drop ALL, 256 MB / 128 pids, health check passes; **image vulnerability scan blocked by a Trivy environment issue** |
| Copilot / Q&A over internal data | Retrieval over internal material, not model training | 🟢 Local alternative complete | Local Qwen + nomic embedding, 7 documents / 64 chunks (hybrid retrieval); answers cite sources and say so when the material has no answer; **not a replacement for Copilot Studio** |
| The client's misunderstanding of Copilot | "Deploy from scratch, then train a model" | ✅ Clarified | Copilot Studio is a low-code agent platform that connects to data sources for retrieval and workflows. It does not train foundation models, and it requires a Microsoft license |

**One-sentence version for the client:**
> I have proven out the technical path of a unified repo, a unified environment, and security gates. The secret gate and the container hardening were verified by real execution. Multi-person collaboration rules and remote CI will be enabled once they are connected to your real repository and licenses. For the AI part, I first validated with a local model that Q&A works without the material leaving the internal network. It is not the same thing as Copilot Studio.

---

## 3. Verified vs. Not Verified (Keep Them Separate)

### Verified (can be demonstrated live)

- Pinned Node 22.22.2 runtime; **all 23 tests pass**
- The synthetic secret is blocked by real Gitleaks (exit code 42); after the fix, it passes (exit code 0)
- Staging-area bypass prevention: the secret was `git add`-ed, then removed only from the working tree without re-adding it, and it is still blocked
- Current source scan passes (47 files, excluding `.tools`, `.rag`, and `outputs`)
- `terraform fmt -check` passes (3 files, via stdin)
- `docker compose config` passes
- Runtime image built successfully; the container is read-only, non-root, cap-drop ALL, resource-limited, and passes its health check
- Local RAG: hybrid retrieval (vector + keyword) plus generation, 4 sources, about 12–25 seconds; questions outside the knowledge base get an explicit "the existing material does not say"
- Browser end-to-end: blocking, passing, the evidence page, copy, Local AI, no horizontal overflow on mobile, no JS errors, no CSP violations

### Not verified (labeled in both the UI and the docs; do not claim as complete)

- Full build of the Dev Container in VS Code (only the runtime image was verified)
- Terraform `init` / `validate`: the local Go tool reports `winapi error #5` when reading the project directory
- Trivy configuration scan and image vulnerability scan: same cause; reading `~/.docker/config.json` fails
- Actual GitHub Actions / CodeQL runs (not triggered by a push, no PR opened)
- Branch protection / CODEOWNERS actually in effect (requires an administrator to configure it in GitHub settings)
- No Kubernetes, no cloud resources, no SSO / RBAC / audit

---

## 4. How to Run the Next Client Demo

### Prerequisites

- Node.js **22.22.2**
- Python 3 (only used to download the pinned tool versions)
- Docker Desktop (only needed for the container demo)
- LM Studio (only needed for the Local AI demo)

### Step 1: Start the Local Model (only needed for the AI demo)

```powershell
& "$env:USERPROFILE\.cache\lm-studio\bin\lms.exe" server start --port 1234
& "$env:USERPROFILE\.cache\lm-studio\bin\lms.exe" ps
```

Two models are needed:
- Chat: **`qwen2.5-3b-instruct`** (about 1.93 GB; for the demo; 8–30 seconds per question)
- Chat (alternative): `qwen/qwen3.8-27b` (17.7 GB; better quality, but about 4 tokens/second on CPU, so one question takes several minutes and it is not suitable for a live demo)
- Embedding: `text-embedding-nomic-embed-text-v1.5`

The code prefers the 3B model by default. To use the 27B model, set the environment variable `LOCAL_CHAT_MODEL=qwen/qwen3.8-27b`.

> The 27B model is a reasoning model. LM Studio ignores `chat_template_kwargs.enable_thinking` and `/no_think`, and reasoning tokens consume `max_tokens`. So the code calls `/chat/completions` (reasoning goes in a separate field), and the budget is calculated for "reasoning + answer" together. Before changing `max_tokens`, read the comment in `packages/local-rag/index.mjs`.

Check the endpoint:

```powershell
curl http://127.0.0.1:1234/v1/models
```

You can also open LM Studio → Developer → Start Server directly.

### Step 2: Start the Demo

```powershell
cd C:\Users\jma92\OneDrive\Documents\claude_projects\secure-dev-platform
.\start-demo.cmd
```

On first run, it automatically downloads and verifies Gitleaks. Open **http://127.0.0.1:4173**.

Manual equivalent commands:

```powershell
python scripts/bootstrap-tools.py gitleaks
node apps/sample-service/server.mjs
```

### Step 3: Demo Order (about 7 minutes)

> **The UI is in English** (the client's working language is English). Six tabs: Overview / Live demo / Security report / Local AI / Evidence / Handoff.

1. **Overview**: explain the monorepo and the four-stage path. Stress that "the diagram is the design path; check the evidence for what passes."
2. **Live demo**: click "Demo leak → blocked" and look for Blocked / exit 42. Click "Demo repair → passed" and look for Passed / exit 0.
3. **Security report**: this is the kind of page you see in Snyk / SonarQube. At the top is the **quality gate** (currently `Incomplete`). Below it are one row per scanner and a threshold table for "what blocks a merge." Focus on the phrase `Not provable yet`: it is not a failure. It means "could not be verified on this machine."
4. **Local AI**: the badge shows Ready. Click an example question, then check the `[1]` source in the answer, the Sources list, and `Egress: Loopback only`.
5. **Evidence**: go through the real records one by one, and proactively point out the blocked / not run items.
6. **Handoff**: open `scripts/pre-commit.mjs`, `ci.yml`, and `terraform/main.tf`, and explain that "local hooks can be bypassed, so remote required checks are needed."

### Step 4: Optional Extra Demos

**Offline test**: turn off Wi-Fi and ask Local AI again. If it still answers, that proves the data does not leave the network.

**Bypass test:**

```powershell
git add docs/knowledge/security-policy.md
# Add a fake secret somewhere in the working tree, but do not git add it
node scripts/pre-commit.mjs   # still scans the staged version
```

**Container demo:**

```powershell
docker build -t secure-dev-poc:ci .
docker run -d --name sentinel-poc --read-only --tmpfs /tmp `
  --cap-drop ALL --security-opt no-new-privileges:true `
  --memory 256m --cpus 1 --pids-limit 128 `
  -p 127.0.0.1:4180:4173 secure-dev-poc:ci
docker ps --filter name=sentinel-poc
```

Visit http://127.0.0.1:4180. Note: the container cannot reach the host's LM Studio, so Local AI will show as unavailable. This is the expected result of isolation.

### Step 5: One-Command Acceptance

```powershell
node --test                  # 26 tests
node scripts/rag-smoke.mjs   # four RAG checks
node scripts/verify.mjs      # generates local evidence at outputs/evidence.json
```

> **Optional:** after setting `$env:GITHUB_TOKEN = "<PAT>"`, run `verify.mjs`. It reads the actual CI run for HEAD from the GitHub API and writes the job list and run link into the `ci` item of the evidence.
> Without a token, it honestly records `not_run` and states the reason. In neither case does it claim CI passed without evidence.

---

## 5. How to Add Material to the Knowledge Base

1. Put `.md` files into `docs/knowledge/` (chunked by `##` headings; each chunk is capped at 760 characters).
2. Rebuild the index:

```powershell
curl -X POST http://127.0.0.1:4173/api/rag/reindex
```

3. Refresh `#local-ai`. The badge should show the new document and chunk counts.

Currently: **7 documents / 64 chunks** (key management standard, onboarding guide, AI usage boundaries, platform boundaries, East of Eden summary, Canlus website information, README).

**Notes:**
- `docs/knowledge/east-of-eden.md` is a **summary** of a copyrighted work, not the original text. Do not upload the full copyrighted book.
- Do not write generic "key points summary" paragraphs. They dilute retrieval ranking. (Tested: after adding a generic key-points paragraph, the top source for a security question became that book passage instead.)
- Chinese questions that contain a brand name (for example, "Canlus 怎么收费", which means "how much does Canlus charge") tend to favor chunks that repeat the brand name, because the embedding model is English-first. This was fixed with hybrid retrieval (vector 0.55 + BM25 keyword 0.45). If answers still drift, rewrite the question in keyword style (for example, "固定月费" or "vCISO 月费", meaning "fixed monthly fee" or "vCISO monthly fee"), and it will match immediately.
- The index file `.rag/index.json` is not committed to Git. It is rebuilt automatically on a new machine.

---

## 6. Known Pitfalls

| Symptom | Cause | Fix |
| --- | --- | --- |
| `gitleaks` reports `winapi error #5` | The local sandbox restricts Go tools from reading files | Changed to pass input via stdin and config via environment variables; the normal path works |
| `terraform init` / `trivy` report the same error | Same as above | Re-run in a normal terminal or the Dev Container. The evidence is marked blocked, not reported as passing |
| Counts unchanged after reindex | Stale-cache bug in an earlier version | Fixed (`buildIndex` now updates `cached` in sync), with a regression test |
| Local AI badge is not Ready | LM Studio server is not running, or the embedding model is not loaded | Start the server and confirm both models are loaded |
| A Local AI question takes several minutes or times out | The 27B model is loaded | Load `qwen2.5-3b-instruct` instead, or set `LOCAL_CHAT_MODEL` explicitly |
| Answers are slow (10–25 seconds) | Local inference with the 27B model | Ask one warm-up question before the demo, or switch to a smaller model |
| Local AI unavailable inside the container | Inside a container, 127.0.0.1 refers to the container itself | Expected isolation, not a bug |
| Chinese JSON sent from PowerShell turns into question marks | Windows PowerShell's default encoding | Use Node, or `-ContentType "application/json; charset=utf-8"` |

---

## 7. Next Priorities

Ordered by client value:

1. **Connect a real GitHub organization**: fill in CODEOWNERS, turn on branch protection, and run CI and CodeQL once (license must be confirmed first).
2. **Finish Trivy**: run the image vulnerability scan in a normal terminal or in CI, and upgrade the base image based on the real results.
3. **Run the Dev Container for real**: open it in VS Code on the target machine and confirm one-click entry.
4. **Replace the knowledge base**: swap `docs/knowledge/` with the client's real, de-identified documents, and watch retrieval quality.
5. **Optional**: add authentication (OIDC / SSO) and audit logging. This is a necessary step to move from PoC to deliverable.

---

## 8. Three Questions for the Client (These Decide the Architecture)

1. Does the development environment run mainly on Azure/AWS, in existing data centers, or on developers' machines?
2. Can code and dependencies reach the public internet? If not at all, the Copilot Studio cloud option may not apply, and internal self-hosted retrieval should be used.
3. Which code platform, SSO, and security scanning licenses are in use today? CodeQL for private repositories requires the corresponding authorization.

---

## 9. Key File Index

```text
apps/sample-service/          UI + API + tests (26)
packages/security-policy/     Real Gitleaks calls, staging-area checks
packages/local-rag/           Chunking, local embedding, retrieval, generation
docs/knowledge/               7 knowledge base documents
scripts/pre-commit.mjs        Reads the Git index + staging policy
scripts/verify.mjs            Generates local evidence
scripts/rag-smoke.mjs         One-command RAG acceptance
scripts/browser-check.cjs     Browser end-to-end + screenshots
scripts/dependency-inventory.py  Explains what the dependency scan can read, then scans
.github/workflows/            ci.yml / codeql.yml (CodeQL on private repos requires a license; skipped)
infra/terraform/              Zero-cloud-resource contract (not applied)
outputs/                      Evidence, screenshots, zip files (not committed to Git)
DEMO_GUIDE.md                 Client on-site talking points
```

---

## 10. How to Pick Up Quickly in the Next Session

Tell the AI:

> Read `HANDOFF.md`, then check `git log -1`, `outputs/evidence.json`, and the results of `node --test`, and tell me which items are verified and which are not yet.

To continue, run these first:

```powershell
git status
node --test
node scripts/rag-smoke.mjs
```

Confirm the baseline is green before changing anything.
