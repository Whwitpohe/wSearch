"""Compare two real Tauri executables with the same Windows desktop and clipboard probes."""

import argparse
import json
from pathlib import Path
import windows_bench as w

parser = argparse.ArgumentParser()
parser.add_argument("executable", type=Path)
parser.add_argument("result", type=Path)
parser.add_argument("--primary-only", action="store_true")
parser.add_argument("--physical-drag", action="store_true")
parser.add_argument("--secondary-only", action="store_true")
args = parser.parse_args()
w.api(w.U, "FindWindowW", w.H, w.W.LPCWSTR, w.W.LPCWSTR)
w.api(w.U, "IsWindowVisible", w.I, w.H)
previous = w.cursor()
try:
    result = w.benchmark(
        "tauri",
        args.result.stem,
        w.monitors()[:1]
        if args.primary_only
        else w.monitors()[1:]
        if args.secondary_only
        else w.monitors(),
        executable=args.executable.resolve(),
        measure_return=True,
        directed=not args.physical_drag,
    )
    args.result.write_text(json.dumps(result, indent=2), encoding="utf8")
finally:
    w.U.SetCursorPos(previous.x, previous.y)
