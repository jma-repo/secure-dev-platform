# Secrets and Credential Management Policy

## Ground rules

No real credential may enter the Git repository. That covers passwords, API keys, access tokens, private keys, database connection strings and cloud provider access keys. Credentials are injected at runtime through environment variables or a secrets manager. The repository may only contain placeholders such as `API_TOKEN=${INJECT_AT_RUNTIME}`.

## Checks before a commit

The repository scans the staged content with Gitleaks 8.30.1 before every commit. The scan reads the version in the `git index`, not the version currently saved in the editor. Deleting a secret in the working tree without staging that deletion is therefore still blocked. If the scanner is missing or fails to run, the commit is blocked by default; it is never let through silently.

A local hook can be bypassed by the developer, so the remote pipeline scans the full Git history again. The enforcement that actually binds comes from required server-side checks and branch protection, not from the local script.

## What to do after a leak

1. Rotate or revoke the credential on the platform that issued it first. Do not start by deleting code.
2. Preserve the evidence, notify the security owner, and record when the leak was found, what it exposed and where it was used.
3. Run `gitleaks git` over the full history to establish which commits the secret entered.
4. Cleaning history means rewriting commits and coordinating every collaborator. Adding a new commit that deletes the secret is not enough.
5. Review the incident, then add the rule or process that stops the same class of mistake.

## Exceptions

A synthetic test credential may only be committed with an obvious synthetic prefix such as `SDEV_DEMO_`, plus a precise rule or a narrowly scoped allowlist entry in `.gitleaks.toml`. Broad path exclusions and whole-file ignores are not allowed, and renaming a real credential does not turn it into test data.
