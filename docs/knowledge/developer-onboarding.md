# New Developer Onboarding

## Your first day

1. Install Docker Desktop and VS Code, then add the Dev Containers extension.
2. Clone the shared monorepo. Do not create a separate project directory locally.
3. In VS Code choose "Reopen in Container" to enter the shared environment.
4. Wait for the initialisation to finish. It installs Gitleaks, Trivy and Terraform and wires up the pre-commit check.
5. Run `node --test` to confirm the environment is healthy, then `node apps/sample-service/server.mjs` to open the local demo.

## What the shared environment contains

Node.js is pinned to 22.22.2 and the runtime uses the standard library only, with no third-party npm runtime dependencies. The development container runs as the non-root `node` user, drops every Linux capability, forbids privilege escalation, does not mount the Docker socket, and forwards only port 4173 to the host.

Image tags and system package repositories are not immutable. Before production, pin the image digest, set a patching cadence and use a controlled package source.

## Code ownership and collaboration

`CODEOWNERS` declares who owns which directories, but on its own it does not block a merge. A repository administrator still has to configure branch protection or a ruleset: require a pull request, at least one review, approval from the code owner, the required status checks passing, and no force push and no branch deletion.

A commit message should state why the change exists. Anything touching security rules, the CI pipeline, the development container or the infrastructure directory needs review from the owner of that area.

## Common local commands

- `node --test` — run the tests
- `node scripts/verify.mjs` — produce the local verification evidence
- `python scripts/bootstrap-tools.py gitleaks terraform trivy` — fetch the pinned tools
- `docker compose up --build` — run the sample service under its restrictions
