from pathlib import Path
import hashlib, sys, zipfile

artifacts = Path(__file__).resolve().parents[1] / "artifacts"
for name in (
    ("tauri", "electrobun")
    if len(sys.argv) < 2 or sys.argv[1] == "both"
    else (sys.argv[1],)
):
    folder = artifacts / (name + "-windows-x64")
    if not folder.is_dir():
        raise FileNotFoundError(folder)
    with zipfile.ZipFile(
        folder.with_suffix(".zip"), "w", zipfile.ZIP_DEFLATED, compresslevel=9
    ) as output:
        for file in sorted(folder.rglob("*")):
            if file.is_file() and file.suffix.lower() != ".log":
                output.write(file, file.relative_to(artifacts))
    print(
        name,
        folder.with_suffix(".zip").stat().st_size,
        "bytes, SHA256",
        hashlib.sha256(folder.with_suffix(".zip").read_bytes()).hexdigest(),
    )
