#!/usr/bin/env python3
"""State out loud what a dependency scan would actually read.

A vulnerability scanner that finds nothing because it was given nothing is not
a passing check. This script turns "zero findings" into a claim that can be
audited: either the repository declares no third-party packages at all, or it
declares some and ships a lockfile the scanner can read.

Exit codes:
  0  nothing to scan (zero declared packages) or every declared package has a lockfile
  1  a package.json declares dependencies without a lockfile for the scanner
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SKIP_DIRS = {
    ".git",
    ".tools",
    ".rag",
    "node_modules",
    "outputs",
    "reports",
    ".venv",
    "__pycache__",
}

DEP_FIELDS = (
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
)

LOCKFILES = ("package-lock.json", "yarn.lock", "pnpm-lock.yaml", "npm-shrinkwrap.json")


def find_package_manifests(root: Path) -> list[Path]:
    found: list[Path] = []
    for path in sorted(root.rglob("package.json")):
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        found.append(path)
    return found


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    manifests = find_package_manifests(root)

    rows: list[tuple[str, int, str]] = []
    unreadable: list[str] = []

    for manifest in manifests:
        rel = manifest.relative_to(root).as_posix()
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            unreadable.append(f"{rel}: {exc}")
            continue

        declared = 0
        for field in DEP_FIELDS:
            block = data.get(field) or {}
            if isinstance(block, dict):
                declared += len(block)

        lock = next(
            (name for name in LOCKFILES if (manifest.parent / name).exists()),
            "",
        )
        rows.append((rel, declared, lock))

    print("Declared third-party packages per manifest")
    print("")
    print("| Manifest | Declared packages | Lockfile |")
    print("| --- | --- | --- |")
    for rel, declared, lock in rows:
        print(f"| `{rel}` | {declared} | {lock or 'none'} |")
    print("")

    if unreadable:
        print("Could not read these manifests, so their dependencies are unknown:")
        for line in unreadable:
            print(f"  - {line}")
        print("RESULT: FAIL - unreadable manifests hide whatever they declare")
        return 1

    total = sum(declared for _, declared, _ in rows)
    missing_lock = [
        rel for rel, declared, lock in rows if declared > 0 and not lock
    ]

    if missing_lock:
        print("These manifests declare packages but ship no lockfile:")
        for rel in missing_lock:
            print(f"  - {rel}")
        print(
            "RESULT: FAIL - the scanner has versions to resolve but no lockfile, "
            "so a green result would mean nothing was read."
        )
        return 1

    if total == 0:
        print(
            f"RESULT: NOTHING_TO_SCAN - {len(rows)} manifests, 0 declared "
            "third-party packages. The runtime uses the Node standard library "
            "only, so a dependency scan has no input."
        )
        return 0

    print(
        f"RESULT: SCANNABLE - {total} declared packages across {len(rows)} "
        "manifests, every one covered by a lockfile."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
