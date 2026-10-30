# SENTINEL Client Demo Script

## Opening Positioning (30 seconds)

> I built a locally runnable PoC for a "unified, secure, reproducible development environment." It is not tied to Azure, AWS, or any license. It focuses on verifying one repository, a pinned development environment, and security gates that actually run. The security results below come from real scans, not UI simulation. This is my own validation work; it is not a claim that it has already been delivered in a client's production environment.

## Which Image to Show the Client First

**Only one: `secure-dev-environment-plan/SENTINEL-one-page.svg` (same name, `.png` / `.pdf`).**

The 15-slide deck, `secure-dev-environment-plan/secure-dev-environment-plan.pptx`, is not opening material. It is for after the client asks "how exactly would you do it?" If you show all 15 slides at the start, the client will not remember any of them.

This one-page diagram covers only three things. Explain them in this order, top to bottom:

1. **Every change goes through three checkpoints** (before commit / before merge / before run), shown as three cards side by side.
2. **Every checkpoint leaves a receipt you can re-run.** The green panel on the left shows "verified 10 / 14"; the amber panel on the right shows "not verified 4 / 14."
3. **The AI part never leaves the machine.** The dashed box at the bottom runs from 7 documents to a cited answer, all inside `127.0.0.1`.

### 60-Second Script (read it as written)

> This diagram is the full picture of what I built, in three points.
>
> **First, every change goes through three checkpoints.** Before the commit, I scan the staging area. Before the merge, I run five CI checks. Before the run, I harden the container to non-root with a read-only filesystem. Each checkpoint blocks something different. It is not the same check drawn three times.
>
> **Second, every checkpoint leaves a receipt.** The green side on the left is what actually passed on this machine: 10 items. The amber side on the right is what did not pass: 4 items. I list them anyway and do not mix them into the green. **Installing a tool does not mean the check passed.** This panel is where I do not hedge.
>
> **Third, the AI part never leaves the machine.** Documents are chunked, embedded, retrieved, and answered entirely on this machine, all on `127.0.0.1`. The code has a hard check: if an external address is configured, the request cannot be sent at all. The cost is speed. On a CPU, one question takes 6 to 30 seconds. I do not hide that.

Then stop and wait for questions. **Do not jump to the deck on your own.** When the client asks "how would this roll out?", "what does it cost?", or "can you control access per person?", turn to the matching slides.

### The Three Questions the Client Is Most Likely to Ask

| Client asks | How to answer |
| --- | --- |
| "Are these green results really from actual runs?" | Open the Security report tab. Every row shows `x of y checks verified`. Then open Evidence; every entry states the command that ran. |
| "Why are some items not verified?" | Three are sandbox limits on this machine (Go tools cannot read the project directory). One requires a Code Security license for a private repository. These can be completed in the client's environment or in the Dev Container. I am not pretending they passed here. |
| "Can you control access per person?" | Not yet. Document-level ACLs and an identity system are the next phase. I would draw out the permission model first, then build it. **Do not say "yes." It really does not exist yet.** |

## Before the Demo

1. Double-click `start-demo.cmd` in the project root. Keep the window open, and go to **http://127.0.0.1:4173**.
2. The Overview should show Connected, and Gitleaks should show Available.
3. No cloud account or API key is needed. If the port is in use, first check whether a demo instance is already running.
4. For the Local AI demo: open LM Studio → Developer → Start Server (port 1234), then load **one chat model** (`qwen2.5-3b-instruct` preferred; answers take about 20–30 seconds) **and one embedding model** (`text-embedding-nomic-embed-text-v1.5`). The badge on the page should show Ready. The 27B model also works, but a single question takes several minutes, so it is not suitable for a live demo.
5. Keep the unverified items visible on the Evidence page. Do not describe them as complete.
6. **The UI is in English** (the client's working language is English): six tabs — Overview / Live demo / Security report / Local AI / Evidence / Handoff. Narrate in English too, so the client can follow the on-screen text.

## Eight-Minute Demo Path

### 1. Overview — Why Unify (45 seconds)

Point to Repository → Dev Container → Security gates → Delivery.

> Code, the sample service, the shared security module, the development environment definition, the security rules, and the automated checks all live in one monorepo. A team can reproduce the same runtime version. The architecture diagram shows the design path. Which checks actually pass is shown in the evidence, not by coloring all four boxes green.

### 2. Live Demo — Real Blocking (90 seconds)

Click **Demo leak → blocked**, and wait for **Secret blocked**.

Talking points:
- The tool generates, in memory, a synthetic credential that cannot be used to log in to any system.
- Real Gitleaks matches it through a custom rule, and the default rules stay enabled.
- It returns the scanner version, the duration, the rule, and exit code 42. It does not return the raw credential.
- Exit code 42 is reserved for findings. A tool crash or timeout is never mistaken for a successful block.

Then click **Demo repair → passed**, and wait for **Input cleared / Passed / exit 0**.

> After the fix, the same scanner runs again. The frontend does not just switch the color to green. This result only proves that this input passes the current rules; it does not mean the code will never have a security problem.

### 3. Security Report — A Snyk-Style Ledger (60 seconds)

This is a newly added page. It matches the Snyk / SonarQube style that clients are familiar with.

At the top is the **quality gate**. It currently shows `Incomplete` and `Not provable yet`, with a line below reading `6 of 11 checks verified`. The four numbers are 26 tests, 78 files scanned, 2 blocked items, and 1 item not run.

Two tables below:

- **Scans**: one row per scanner, showing the tool, the threshold, and the status. Green = actually ran and passed. Yellow Blocked = cannot run on this machine. Grey Not run = never executed.
- **What blocks a merge**: the threshold for each rule, and why it is set there.

Key talking point (this is the most valuable part):

> The point of this table is not "everything is green." It is to show the client **which rule blocks a merge, and under what conditions**. For example, secrets are "blocked on any match," because we cannot tell from here whether a key has already leaked. Third-party CVEs in the image only block at "CRITICAL with a patch available," because a vulnerability with no patch leaves you nothing to do locally, and a permanent red would only teach the team to ignore red.

If the client asks why it is not all green: the 2 blocked items are limits of this machine (the Docker engine is not running, and the Trivy database cannot be reached). They are not code problems, and they run for real in CI. Say this clearly. Do not be vague.

### 4. Local AI — Data Stays Inside the Network (90 seconds)

Open the **Local AI** tab. Confirm the badge says **Ready**, and that it shows 7 documents, about 69 chunks, and the local embedding model. Click an example question (for example, "What should I do if I find a leaked secret at commit time?"), and wait **20–30 seconds**.

Talking points:
- Documents are chunked and embedded locally, and the question is embedded locally too. Keyword scoring (BM25) runs alongside as a fallback. The two scores are weighted together, the Top 3 are taken, and they go to the local Qwen model for generation.
- Everything goes only through `127.0.0.1:1234`. The code has a hard loopback check, and an external address is refused outright.
- Answers carry source numbers. You can open them to see the matched file and section.
- Ask a question the knowledge base does not cover ("How many days of annual leave do I get?"). It says the material does not cover it, instead of making something up.
- **The latency is real. Do not hide it.** On this machine's CPU, the 3B model takes about 20–30 seconds per answer, and the 27B model takes several minutes. That is the price of keeping data on the machine, and it is roughly an order of magnitude slower than cloud Copilot. If the client needs it fast, they will need to buy a GPU or accept a smaller model.

> This is retrieval-augmented generation. It does not train or fine-tune any model. What it proves is that internal material can be answered from without leaving the internal network. It is not a replacement for Copilot Studio.

### 5. Evidence — Repeatable Verification (60 seconds)

Show the runtime, the security tests, the two-scenario scan, the current source scan, the staging-area gate, Terraform formatting, the Compose configuration, container hardening, and the local RAG records.

> I also verified a point that is easy to miss: if a secret is staged, then removed only from the working tree without re-staging, the check still blocks it, because the check reads the Git index.

State clearly: the full Terraform init/validate, the Trivy configuration and image scans, and the remote GitHub Actions/CodeQL/branch protection still need to be verified or enabled. A tool installing successfully does not mean the scan passed.

### 6. Handoff / Repository — Engineering Practices (60 seconds)

Open the relevant files:

- `.devcontainer/devcontainer.json`: pinned environment, non-root user, local ports.
- `scripts/pre-commit.mjs`: reads the staged content, and blocks if the scanner is missing.
- `.github/workflows/ci.yml`: real tests and security gates, minimum permissions, pinned Action references.
- `infra/terraform/main.tf`: a contract example with no cloud provider and no apply.
- `.github/CODEOWNERS` and the branch protection template: to be filled in and enabled by the client's repository administrators. Do not say that review is enforced.

> Local checks help developers catch problems early. A process that cannot be casually bypassed also depends on remote required checks, review, and permission settings. These get enabled once the client's repository, licensing, and internal network requirements are clear.

### 7. Closing — Clarify the Deployment Boundary (30 seconds)

> Does the client's development environment run mainly on Azure/AWS, in existing data centers, or on developers' own machines? Can code and dependencies reach the public internet? Which code platform, SSO, and security scanning licenses are in use today? The answers decide whether to use a managed workspace or a self-hosted setup inside the network, but they do not change the order of work: first make the unified environment and the security gates solid.

## What to Say / What Not to Say

| You can say | Do not say |
| --- | --- |
| I built this runnable PoC and verified the secret gate, the staging-area behavior, and local RAG for real | I launched a production platform for a client (unless that is actually true) |
| The container has actually run read-only, as non-root, with cap-drop, and passed its health check | The container image has been scanned clean for vulnerabilities (local tools are restricted; not finished) |
| The IaC example creates no cloud resources; the format check has actually run | Full cloud permissions and resource security policies have been verified |
| The CI and build/scan delivery pipeline is prepared; there is no actual deployment | CI/CD is live remotely, and the branches are already enforced by protection rules |
| The local demo has no cloud bill; the model runs on this machine and calls no paid API | Private-repo CodeQL on GitHub, or unlimited free Codespaces usage forever |

## Short Introduction You Can Send

> I first built a locally runnable secure-dev-platform PoC: a monorepo, a pinned Node/Dev Container setup, a real Gitleaks pre-commit gate, GitHub Actions security checks, and a Terraform example that does not apply. The demo page can show live that a synthetic leaked secret is blocked, and that a re-scan after the fix passes. The container runs read-only as non-root. A local model can answer questions over internal documents without the material leaving the internal network. I did not connect any cloud or call a paid AI API for the demo. Remote CI/CodeQL, image vulnerability scanning, and repository protection are kept as items to verify or configure. They will be completed once the client's internal and external network, code platform, and identity and permission requirements are clear.

## How to Talk About AI

If the other side mentions "deploy Copilot Studio and then train a model," you can gently clarify:

> This is closer to connecting internal company documents to knowledge retrieval and agent workflows than to training a foundation model from scratch. We first define the code and data access boundaries, identity permissions, and audit requirements. Later, we decide whether to connect Copilot Studio or build internal retrieval on our own network.

Then you can naturally open the Local AI tab:

> I built a retrieval prototype with a local Qwen model and local embeddings. The documents, the questions, and the vectors all stay on this machine. Answers must cite sources, and when the material does not contain the answer, it says so. This approach suits scenarios where material cannot leave the internal network. Copilot Studio is a cloud low-code platform that requires a Microsoft license. The two are not the same thing.

Do not say "we trained a model." This PoC only does retrieval-augmented generation. It does not train or fine-tune anything, and it is not connected to the client's real documents, enterprise identity, or audit systems.
