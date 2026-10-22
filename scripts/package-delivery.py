"""Create a source handoff ZIP, excluding binaries, Git history and private data."""
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "outputs"
SKIP = {".git", ".tools", ".workbuddy-ai", "outputs", "node_modules", ".terraform", ".playwright-cli", "reports", "__pycache__"}
OUT.mkdir(exist_ok=True)
evidence = json.loads((OUT / "evidence.json").read_text(encoding="utf-8"))
archive_path = OUT / "secure-dev-platform-poc.zip"
with zipfile.ZipFile(archive_path, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(ROOT.rglob("*")):
        relative = path.relative_to(ROOT)
        if set(relative.parts) & SKIP or not path.is_file() or path.is_symlink():
            continue
        if path.name.startswith(".env") or path.suffix in {".tfstate", ".tfplan", ".log"}:
            continue
        archive.write(path, Path("secure-dev-platform") / relative)
    files = [OUT / "evidence.json", OUT / "browser-check.json", OUT / "overview.png", OUT / "live-demo.png", OUT / "local-ai.png", OUT / "mobile.png"]
    run_directory = OUT / evidence["reportDirectory"]
    files.extend(path for path in run_directory.rglob("*") if path.is_file())
    for path in files:
        if path.is_file():
            archive.write(path, Path("secure-dev-platform") / path.relative_to(ROOT))
shutil.copyfile(ROOT / "DEMO_GUIDE.md", OUT / "DEMO_GUIDE.md")
print(json.dumps({"archive": str(archive_path), "bytes": archive_path.stat().st_size, "evidence_run": evidence["runId"]}, ensure_ascii=False))
