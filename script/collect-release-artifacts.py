"""Collect successful native jobs from builds that checked out the release commit."""

import json
import os
from pathlib import Path
import re
import subprocess


def api(path):
    return json.loads(subprocess.check_output(["gh", "api", f"repos/{repo}/{path}"]))


repo = os.environ["GH_REPO"]
tag = os.environ["TAG"]
commit = api(f"commits/{tag}")["sha"]
workflow = api("actions/workflows/build.yml")["id"]
formats = {"win32": ["exe", "zip"], "darwin": ["dmg", "zip"], "linux": ["AppImage", "tar.gz", "deb", "rpm"]}
targets = {f"{platform} / {arch}": (platform, arch) for platform in formats for arch in ("x64", "arm64")}
destination = Path("release-files")
collected = set()

for run_id in os.environ["ARTIFACT_RUNS"].split(","):
    run = api(f"actions/runs/{run_id}")
    if run["head_repository"]["full_name"] != repo or run["workflow_id"] != workflow or run["status"] != "completed":
        raise SystemExit(f"Unexpected source workflow: {run_id}")
    for job in api(f"actions/runs/{run_id}/jobs?per_page=100")["jobs"]:
        target = job["name"]
        if target not in targets or job["conclusion"] != "success":
            continue
        if target in collected:
            raise SystemExit(f"More than one successful build for {target}")
        log = subprocess.check_output(["gh", "api", "--allow-escape-sequences", f"repos/{repo}/actions/jobs/{job['id']}/logs"])
        if not re.search(rb"log -1 --format=%H[^\n]*\n[^\n]{0,80}" + commit.encode() + rb"\s*$", log, re.M):
            raise SystemExit(f"Cannot verify checkout of {commit} in job {job['id']}")
        platform, arch = targets[target]
        artifact = f"packages-{platform}-{arch}"
        folder = Path("recovered") / artifact
        subprocess.run(["gh", "run", "download", run_id, "--name", artifact, "--dir", str(folder)], check=True)
        expected = {f"wSearch-{tag}-{platform}-{arch}{suffix}.{ext}" for suffix in ("", "-offline") for ext in formats[platform]}
        if {p.name for p in folder.iterdir()} != expected:
            raise SystemExit(f"Unexpected contents in {artifact}")
        destination.mkdir(exist_ok=True)
        for name in sorted(expected):
            source = folder / name
            if not source.is_file() or source.stat().st_size < 1_000_000:
                raise SystemExit(f"Incomplete release file: {name}")
            source.rename(destination / name)
        print(f"Verified {target} from run {run_id} at {commit}", flush=True)
        collected.add(target)

if collected != set(targets):
    raise SystemExit(f"Missing native targets: {sorted(set(targets) - collected)}")
