"""Install pinned CLIs into this repository, never into the system PATH.
Uses only Python's standard library. Archives are SHA256-verified against
HTTPS vendor manifests; this is integrity checking, not signature verification.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import tarfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSIONS = json.loads((ROOT / "scripts" / "tools.json").read_text())
TOOLS = ROOT / ".tools"


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "sentinel-poc-bootstrap/1.0"})
    with urllib.request.urlopen(request, timeout=180) as response:
        return response.read()


def urls(name, version):
    system = platform.system().lower()
    machine = platform.machine().lower()
    arch = "amd64" if machine in ("amd64", "x86_64") else "arm64" if machine in ("arm64", "aarch64") else None
    if not arch or system not in ("windows", "linux", "darwin"):
        raise RuntimeError(f"Unsupported platform: {system}/{machine}")
    if name == "terraform":
        base = f"https://releases.hashicorp.com/terraform/{version}/"
        asset = f"terraform_{version}_{system}_{arch}.zip"
        manifest = f"terraform_{version}_SHA256SUMS"
    elif name == "gitleaks":
        base = f"https://github.com/gitleaks/gitleaks/releases/download/v{version}/"
        cpu = "x64" if arch == "amd64" else "arm64"
        extension = "zip" if system == "windows" else "tar.gz"
        asset = f"gitleaks_{version}_{system}_{cpu}.{extension}"
        manifest = f"gitleaks_{version}_checksums.txt"
    else:
        base = f"https://github.com/aquasecurity/trivy/releases/download/v{version}/"
        osname = {"windows": "windows", "linux": "Linux", "darwin": "macOS"}[system]
        cpu = "64bit" if arch == "amd64" else "ARM64"
        extension = "zip" if system == "windows" else "tar.gz"
        asset = f"trivy_{version}_{osname}-{cpu}.{extension}"
        manifest = f"trivy_{version}_checksums.txt"
    return base, asset, manifest


def install(name):
    version = VERSIONS[name]
    executable = name + (".exe" if os.name == "nt" else "")
    target = TOOLS / executable
    receipt_path = TOOLS / f"{name}.receipt.json"
    host_platform = {"os": platform.system().lower(), "arch": platform.machine().lower()}
    if target.exists() and receipt_path.exists():
        receipt = json.loads(receipt_path.read_text())
        if receipt.get("version") == version and receipt.get("platform") == host_platform and receipt.get("binary_sha256") == hashlib.sha256(target.read_bytes()).hexdigest():
            print(f"{name} {version}: verified local binary", flush=True)
            return
    base, asset, manifest = urls(name, version)
    print(f"Downloading {name} {version} ({asset})", flush=True)
    checksums = download(base + manifest).decode("utf-8")
    expected = next((line.split()[0] for line in checksums.splitlines() if len(line.split()) >= 2 and line.split()[-1].lstrip("*") == asset), None)
    if not expected or len(expected) != 64:
        raise RuntimeError(f"No exact checksum entry for {asset}")
    archive = download(base + asset)
    actual = hashlib.sha256(archive).hexdigest()
    if actual != expected:
        raise RuntimeError(f"Checksum mismatch for {asset}; nothing installed")
    # Extract only the named executable, never arbitrary paths from an archive.
    if asset.endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            candidates = [item for item in bundle.infolist() if Path(item.filename).name == executable]
            if len(candidates) != 1:
                raise RuntimeError("Expected exactly one executable in archive")
            binary = bundle.read(candidates[0])
    else:
        with tarfile.open(fileobj=io.BytesIO(archive), mode="r:gz") as bundle:
            candidates = [item for item in bundle.getmembers() if Path(item.name).name == executable and item.isfile()]
            if len(candidates) != 1:
                raise RuntimeError("Expected exactly one executable in archive")
            binary = bundle.extractfile(candidates[0]).read()
    TOOLS.mkdir(exist_ok=True)
    staging = TOOLS / f"{executable}.download"
    staging.write_bytes(binary)
    staging.chmod(0o755)
    staging.replace(target)
    receipt_path.write_text(json.dumps({
        "tool": name, "version": version, "platform": host_platform, "source": base + asset,
        "manifest": base + manifest, "archive_sha256": actual,
        "binary_sha256": hashlib.sha256(binary).hexdigest(),
        "verification": "SHA256 against vendor HTTPS manifest; no signature verification"
    }, indent=2) + "\n")
    print(f"Installed {name} {version}; SHA256 verified", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tools", nargs="+", choices=sorted(VERSIONS))
    args = parser.parse_args()
    for tool in dict.fromkeys(args.tools):
        install(tool)
