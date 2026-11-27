"""Windows release comparison. Requires an unlocked interactive desktop and Python + Pillow.
Uses only synthetic pixels; saves timings/sizes, never clipboard payloads.
Run from a console with: python -X utf8 bench/windows_bench.py
"""

import ctypes as C
from ctypes import wintypes as W
import io, json, os, statistics, struct, subprocess as sp, sys, tempfile, threading, time
from pathlib import Path
from PIL import Image, ImageDraw

BASE = Path(__file__).resolve().parents[1]
WORK = BASE / "bench/work"
WORK.mkdir(exist_ok=True)
U = C.WinDLL("user32", use_last_error=True)
G = C.WinDLL("gdi32")
K = C.WinDLL("kernel32")
OLE = C.WinDLL("ole32")
P = C.c_void_p
I = C.c_int
D = W.DWORD
H = W.HANDLE


def api(d, name, t, *args):
    f = getattr(d, name)
    f.restype = t
    f.argtypes = list(args)
    return f


api(U, "SetProcessDpiAwarenessContext", I, H)(H(-4))
api(U, "CreateWindowExW", H, D, W.LPCWSTR, W.LPCWSTR, D, I, I, I, I, H, H, H, P)
api(U, "SetWindowPos", I, H, H, I, I, I, I, W.UINT)
api(U, "ShowWindow", I, H, I)
api(U, "LoadImageW", H, H, W.LPCWSTR, W.UINT, I, I, W.UINT)
api(U, "SendMessageW", C.c_ssize_t, H, W.UINT, C.c_size_t, C.c_ssize_t)
api(U, "DestroyWindow", I, H)
api(U, "UpdateWindow", I, H)
api(U, "SetForegroundWindow", I, H)
api(U, "GetForegroundWindow", H)
api(U, "GetDC", H, H)
api(U, "ReleaseDC", I, H, H)
api(U, "WindowFromPoint", H, W.POINT)
api(U, "GetAncestor", H, H, W.UINT)
api(U, "GetClassNameW", I, H, W.LPWSTR, I)
api(U, "GetWindowThreadProcessId", D, H, C.POINTER(D))
api(U, "SetCursorPos", I, I, I)
api(U, "GetCursorPos", I, C.POINTER(W.POINT))
api(U, "GetAsyncKeyState", C.c_short, I)
api(U, "PeekMessageW", I, C.POINTER(W.MSG), H, W.UINT, W.UINT, W.UINT)
api(U, "TranslateMessage", I, C.POINTER(W.MSG))
api(U, "DispatchMessageW", C.c_ssize_t, C.POINTER(W.MSG))
api(G, "CreateCompatibleDC", H, H)
api(G, "SelectObject", H, H, H)
api(G, "DeleteObject", I, H)
api(G, "DeleteDC", I, H)
api(G, "CreateDIBSection", H, H, P, W.UINT, C.POINTER(P), H, D)
api(G, "BitBlt", I, H, I, I, I, I, H, I, I, D)
api(G, "GdiFlush", I)
api(U, "OpenClipboard", I, H)
api(U, "GetClipboardData", H, W.UINT)
api(U, "GetClipboardOwner", H)
api(U, "SetClipboardData", H, W.UINT, H)
api(U, "EnumClipboardFormats", W.UINT, W.UINT)
api(U, "GetClipboardSequenceNumber", D)
api(K, "GlobalLock", P, H)
api(K, "GlobalUnlock", I, H)
api(K, "GlobalSize", C.c_size_t, H)
api(K, "GlobalFree", H, H)
api(OLE, "OleDuplicateData", H, H, W.WORD, W.UINT)
api(G, "DeleteEnhMetaFile", I, H)
api(K, "OpenProcess", H, D, I, D)
api(K, "CloseHandle", I, H)
api(K, "GetProcessTimes", I, H, P, P, P, P)
query = api(
    C.WinDLL("ntdll"), "NtQuerySystemInformation", C.c_long, D, P, D, C.POINTER(D)
)
clock = time.perf_counter


def pump():
    msg = W.MSG()
    while U.PeekMessageW(C.byref(msg), None, 0, 0, 1):
        U.TranslateMessage(C.byref(msg))
        U.DispatchMessageW(C.byref(msg))


def wait_for(fn, timeout, label):
    end = clock() + timeout
    while clock() < end:
        pump()
        v = fn()
        if v:
            return v
        time.sleep(0.003)
    raise RuntimeError("Timeout: " + label)


def cursor():
    pt = W.POINT()
    U.GetCursorPos(C.byref(pt))
    return pt


def hwnd_pid(hwnd):
    pid = D()
    U.GetWindowThreadProcessId(hwnd, C.byref(pid))
    return pid.value


def cls(hwnd):
    ch = C.create_unicode_buffer(180)
    U.GetClassNameW(hwnd, ch, 180)
    return ch.value


def monitors():
    out = []
    cbtype = C.WINFUNCTYPE(I, H, H, C.POINTER(W.RECT), C.c_ssize_t)

    @cbtype
    def cb(m, dc, r, data):
        rr = r.contents
        dx = W.UINT()
        dy = W.UINT()
        C.windll.shcore.GetDpiForMonitor(H(m), 0, C.byref(dx), C.byref(dy))
        out.append((rr.left, rr.top, rr.right - rr.left, rr.bottom - rr.top, dx.value))
        return 1

    U.EnumDisplayMonitors(None, None, cb, 0)
    return sorted(out, key=lambda v: (v[0] != 0 or v[1] != 0, v[0], v[1]))


def bbox(hwnd):
    r = W.RECT()
    U.GetWindowRect(H(hwnd), C.byref(r))
    return r.left, r.top, r.right - r.left, r.bottom - r.top


class Desktop:
    def __init__(self, mon):
        self.x, self.y, w, h, self.dpi = mon
        self.hwnd = U.CreateWindowExW(
            0x80,
            "#32770",
            "wSearch synthetic desktop",
            0x90000000,
            self.x,
            self.y,
            w,
            h,
            None,
            None,
            None,
            None,
        )
        assert self.hwnd
        self.image = U.CreateWindowExW(
            0, "STATIC", "", 0x5000000E, 0, 0, w, h, self.hwnd, None, None, None
        )
        assert self.image
        pic = Image.new("RGB", (w, h), "#e0e4eb")
        g = ImageDraw.Draw(pic)
        for y in range(0, h, 23):
            for x in range(0, w, 41):
                g.rectangle(
                    (x + 2, y + 2, x + 31, y + 14),
                    fill=(
                        (x * 7 + y) % 190 + 20,
                        (y * 11 + x) % 195 + 17,
                        (x + y * 13) % 193 + 18,
                    ),
                )
        g.rectangle((0, 0, 255, 48), fill="#f0f3f5")
        f = WORK / ("fixture-" + str(w) + "x" + str(h) + ".bmp")
        pic.save(f)
        self.fixture = pic
        alt = WORK / ("alt-" + str(w) + "x" + str(h) + ".bmp")
        if not alt.exists():
            Image.new("RGB", (w, h), "#e64359").save(alt)
        self.alternate = U.LoadImageW(None, str(alt), 0, 0, 0, 0x2010)
        assert self.alternate
        self.bitmap = U.LoadImageW(None, str(f), 0, 0, 0, 0x2010)
        assert self.bitmap
        U.SendMessageW(self.image, 0x172, 0, self.bitmap)
        U.ShowWindow(self.hwnd, 5)
        U.SetWindowPos(self.hwnd, H(-1), self.x, self.y, w, h, 0x40)
        U.UpdateWindow(self.hwnd)
        U.SetForegroundWindow(self.hwnd)
        pump()
        time.sleep(0.12)
        self.focus_fixture()
        U.UpdateWindow(self.image)
        pump()

    def focus_fixture(self):
        if U.GetForegroundWindow() != self.hwnd:
            U.SetForegroundWindow(self.hwnd)
            pump()
        if U.GetForegroundWindow() != self.hwnd:
            point = W.POINT(self.x + 50, self.y + 60)
            U.SetCursorPos(point.x, point.y)
            assert U.GetAncestor(U.WindowFromPoint(point), 2) == self.hwnd, (
                "Test desktop obscured"
            )
            U.mouse_event(2, 0, 0, 0, 0)
            pump()
            U.mouse_event(4, 0, 0, 0, 0)
            pump()
            U.SetForegroundWindow(self.hwnd)
            wait_for(
                lambda: U.GetForegroundWindow() == self.hwnd, 2, "local fixture focus"
            )
        assert U.GetForegroundWindow() == self.hwnd

    def close(self):
        U.DestroyWindow(self.hwnd)
        G.DeleteObject(self.bitmap)
        G.DeleteObject(self.alternate)


class ScreenPatch:
    def __init__(self, x, y, w, h):
        self.x, self.y, self.w, self.h = x, y, w, h
        self.screen = U.GetDC(None)
        self.dc = G.CreateCompatibleDC(self.screen)
        info = struct.pack("<IiiHHIIiiII", 40, w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
        self.bits = P()
        self.bitmap = G.CreateDIBSection(
            self.screen, info, 0, C.byref(self.bits), None, 0
        )
        assert self.bitmap
        self.old = G.SelectObject(self.dc, self.bitmap)

    def get(self):
        assert G.BitBlt(
            self.dc, 0, 0, self.w, self.h, self.screen, self.x, self.y, 0x40CC0020
        )
        G.GdiFlush()
        return C.string_at(self.bits, self.w * self.h * 4)

    def close(self):
        G.SelectObject(self.dc, self.old)
        G.DeleteObject(self.bitmap)
        G.DeleteDC(self.dc)
        U.ReleaseDC(None, self.screen)


class Keys(C.Structure):
    _fields_ = [
        ("vk", W.WORD),
        ("scan", W.WORD),
        ("flags", D),
        ("time", D),
        ("extra", C.c_size_t),
    ]


class Payload(C.Union):
    _fields_ = [("key", Keys), ("pad", C.c_ubyte * 32)]


class Input(C.Structure):
    _fields_ = [("type", D), ("data", Payload)]


api(U, "SendInput", W.UINT, W.UINT, C.POINTER(Input), I)


def keys(events):
    batch = (Input * len(events))()
    for i, (vk, up) in enumerate(events):
        batch[i].type = 1
        batch[i].data.key = Keys(vk, 0, 2 if up else 0, 0, 0)
    assert U.SendInput(len(batch), batch, C.sizeof(Input)) == len(batch)


def chord(vk):
    mods = [17, 18, 16]
    if any(U.GetAsyncKeyState(v) & 0x8000 for v in [1, 2, 16, 17, 18, 91, 92, vk]):
        raise RuntimeError("Another input is held")
    keys([(v, False) for v in mods])
    time.sleep(0.015)
    t = clock()
    try:
        keys([(vk, False), (vk, True)])
    finally:
        keys([(v, True) for v in reversed(mods)])
    return t


class Clipboard:
    """Duplicate normal clipboard handles in memory; decline unsupported owner/private formats."""

    def open(self, owner=None):
        wait_for(lambda: U.OpenClipboard(owner), 1, "clipboard")

    def __init__(self, owner):
        self.owner = owner
        self.saved = []
        self.owned = False
        self.seq = U.GetClipboardSequenceNumber()
        self.open(owner)
        try:
            fmt = 0
            while fmt := U.EnumClipboardFormats(fmt):
                if fmt in (3, 128, 131) or 0x0200 <= fmt < 0x0400:
                    raise RuntimeError(
                        "Unsupported clipboard format; original left intact"
                    )
                h = U.GetClipboardData(fmt)
                if not h:
                    raise RuntimeError("Unavailable clipboard data")
                copy = OLE.OleDuplicateData(h, fmt, 0)
                if not copy:
                    raise RuntimeError("Cannot preserve clipboard format")
                self.saved.append((fmt, copy))
            self.seq = U.GetClipboardSequenceNumber()
        finally:
            U.CloseClipboard()

    def verify(self, expected, w, h, overlay):
        self.open(self.owner)
        try:
            data = U.GetClipboardData(8)
            assert data, "No CF_DIB"
            ptr = K.GlobalLock(data)
            assert ptr
            try:
                size = K.GlobalSize(data)
                raw = C.string_at(ptr, size)
            finally:
                K.GlobalUnlock(data)
            offset, bw, bh, planes, bpp, compression = struct.unpack_from(
                "<IiiHHI", raw
            )
            if U.GetClipboardOwner() == overlay:
                self.seq = U.GetClipboardSequenceNumber()
                self.owned = True
            elif (
                (planes, bpp, compression) == (1, 32, 0)
                and abs(bw - w) <= 2
                and abs(-bh - h) <= 2
            ):
                # The one-shot helper can exit before verification. Identify its synthetic
                # crop even if a coordinate error makes the real pixel assertion fail.
                reference = Image.frombytes("RGB", (w, h), expected, "raw", "BGRX")
                actual = Image.frombytes("RGB", (bw, -bh), raw[offset:], "raw", "BGRX")
                inner = reference.crop((4, 4, w - 4, h - 4)).tobytes()
                if any(
                    actual.crop((4 + x, 4 + y, w - 4 + x, h - 4 + y)).tobytes() == inner
                    for x in range(-2, 3)
                    for y in range(-2, 3)
                ):
                    self.seq = U.GetClipboardSequenceNumber()
                    self.owned = True
            assert (bw, bh, planes, bpp, compression) == (w, -h, 1, 32, 0), (
                bw,
                bh,
                planes,
                bpp,
                compression,
            )
            actual = raw[offset : offset + 4 * w * h]
            assert all(actual[k::4] == expected[k::4] for k in range(3)), (
                "Clipboard pixels differ from the frozen source"
            )
            self.seq = U.GetClipboardSequenceNumber()
            self.owned = True
        finally:
            U.CloseClipboard()

    def close(self):
        self.open(self.owner)
        try:
            if self.owned and U.GetClipboardSequenceNumber() == self.seq:
                assert U.EmptyClipboard()
                while self.saved:
                    fmt, h = self.saved[0]
                    assert U.SetClipboardData(fmt, h)
                    self.saved.pop(0)
        finally:
            U.CloseClipboard()
            for fmt, h in self.saved:
                if fmt in (2, 9, 130):
                    G.DeleteObject(h)
                elif fmt in (14, 142):
                    G.DeleteEnhMetaFile(h)
                else:
                    K.GlobalFree(h)


buf = C.create_string_buffer(4 << 20)
tree_lock = threading.Lock()


def tree(root):
    with tree_lock:
        return read_tree(root)


def read_tree(root):
    global buf
    needed = D()
    rc = query(5, buf, C.sizeof(buf), C.byref(needed))
    if rc == -1073741820:
        buf = C.create_string_buffer(needed.value + (512 << 10))
        rc = query(5, buf, C.sizeof(buf), C.byref(needed))
    assert rc == 0, rc
    at = C.addressof(buf)
    items = {}
    while True:
        pid = C.c_size_t.from_address(at + 80).value
        parent = C.c_size_t.from_address(at + 88).value
        items[pid] = (parent, C.c_int64.from_address(at + 8).value)
        delta = D.from_address(at).value
        if not delta:
            break
        at += delta
    group = {root}
    while True:
        more = {pid for pid, (parent, _) in items.items() if parent in group}
        if more <= group:
            break
        group.update(more)
    return {pid: items[pid][1] / 1048576 for pid in group if pid in items}


def cpu_ticks(handle):
    t = (C.c_uint64 * 4)()
    assert K.GetProcessTimes(handle, *[C.byref(t, 8 * i) for i in range(4)])
    return t[2] + t[3]


class MemoryCounters(C.Structure):
    _fields_ = [("size", D), ("faults", D)] + [
        (x, C.c_size_t)
        for x in "peakws ws peakp p peaknp np page peakpage private".split()
    ]


api(K, "K32GetProcessMemoryInfo", I, H, C.POINTER(MemoryCounters), D)


def committed(handles):
    value = 0
    for h in handles:
        c = MemoryCounters()
        c.size = C.sizeof(c)
        if K.K32GetProcessMemoryInfo(h, C.byref(c), c.size):
            value += c.private
    return value / 1048576


class Watch:
    def __init__(self, pid):
        self.root = pid
        self.handles = {}
        self.samples = []
        self.commits = []
        self.stop = threading.Event()
        self.mark = self.sample()[1]
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.thread.start()

    def sample(self):
        m = tree(self.root)
        for pid in m:
            if pid not in self.handles:
                h = K.OpenProcess(0x1010, 0, pid)
                if h:
                    self.handles[pid] = h
        return sum(m.values()), sum(cpu_ticks(h) for h in self.handles.values())

    def run(self):
        while not self.stop.is_set():
            self.samples.append((clock(), self.sample()[0]))
            self.commits.append(committed(self.handles.values()))
            time.sleep(0.007)

    def finish(self):
        self.stop.set()
        self.thread.join()
        memory, cpu = self.sample()
        for h in self.handles.values():
            K.CloseHandle(h)
        return {
            "peak_private_mib": round(max([memory] + [x[1] for x in self.samples]), 2),
            "peak_private_commit_mib": round(max(self.commits, default=0), 2),
            "cpu_ms": round((cpu - self.mark) / 10000, 2),
            "observed_pids": len(self.handles),
            "samples": len(self.samples),
        }


def visible_info(root_pid):
    found = []
    group_ids = tree(root_pid)
    cbtype = C.WINFUNCTYPE(I, H, C.c_ssize_t)

    @cbtype
    def cb(hwnd, _):
        if U.IsWindowVisible(hwnd) and hwnd_pid(hwnd) in group_ids:
            x, y, w, h = bbox(hwnd)
            if w >= 320 and h >= 180:
                found.append((x, y, w, h))
        return 1

    U.EnumWindows(cb, 0)
    for x, y, w, h in found:
        view = ScreenPatch(x + 10, y + 45, min(w - 20, 540), min(h - 55, 190))
        try:
            data = view.get()
            counter = sum(
                1
                for blue, green, red in zip(data[0::4], data[1::4], data[2::4])
                if 90 < green < 170
                and 135 < blue <= 255
                and 0 <= red < 85
                and blue > green + 20
                and green > red + 40
            )
            if counter >= 150:
                return True
        finally:
            view.close()
    return False


def test(pid, monitor, clip, n, desktop, directed=False):
    x, y, w, h, dpi = monitor
    ax = x + w // 3
    ay = y + h // 3
    cw, ch = 255, 127
    bx, by = ax + cw, ay + ch
    reverse = n % 2 == 1
    start = (bx, by) if reverse else (ax, ay)
    end = (ax, ay) if reverse else (bx, by)
    desktop.focus_fixture()
    U.SetCursorPos(*start)
    pump()
    time.sleep(0.04)
    assert U.GetClipboardSequenceNumber() == clip.seq, "Clipboard changed externally"
    region = ScreenPatch(ax, ay, cw, ch)
    badge = ScreenPatch(x + 14, y + 14, 10, 8)
    edge = ScreenPatch(ax + 28, ay, 10, 2)
    expected = region.get()
    intended = desktop.fixture.crop((ax - x, ay - y, ax - x + cw, ay - y + ch))
    observed = Image.frombytes("RGB", (cw, ch), expected, "raw", "BGRX")

    # Compare the pattern's edges; the two physical monitors apply different color profiles.
    def background_mask(im):
        colors = list(im.getdata())
        background = max(im.getcolors(cw * ch))[1]
        return bytes(c == background for c in colors)

    assert background_mask(intended) == background_mask(observed), (
        "Fixture pattern mismatch"
    )
    assert len(set(expected[0::4])) > 8, "Test pattern is not on screen"
    wait_for(lambda: min(badge.get()[0::4]) > 135, 3, "visible local test surface")
    before = U.GetClipboardSequenceNumber()
    wch = Watch(pid)
    down = False
    overlay = None
    try:
        t0 = chord(83)

        def ready():
            hwnd = U.GetAncestor(U.WindowFromPoint(W.POINT(*start)), 2)
            if not hwnd or cls(hwnd) != "WSearchTrialSelection":
                return False
            if bbox(hwnd) != (x, y, w, h):
                return False
            return (
                hwnd
                if hwnd_pid(hwnd) in tree(pid) and max(badge.get()[0::4]) < 32
                else False
            )

        try:
            overlay = wait_for(ready, 6, "visible capture overlay")
        except RuntimeError:
            own = U.FindWindowW("WSearchTrialSelection", None)
            hit = U.GetAncestor(U.WindowFromPoint(W.POINT(*start)), 2)
            print(
                "overlay readiness diagnostics",
                {
                    "tree": list(tree(pid)),
                    "window": own,
                    "window_pid": hwnd_pid(own) if own else None,
                    "bounds": bbox(own) if own else None,
                    "hit_class": cls(hit),
                    "hit_pid": hwnd_pid(hit),
                    "badge_max": max(badge.get()[0::4]),
                },
                flush=True,
            )
            if own and hwnd_pid(own) in tree(pid) and U.IsWindowVisible(own):
                keys([(27, False), (27, True)])
            raise

        def mouse(message, buttons, pt):
            xx, yy = pt[0] - x, pt[1] - y
            U.SendMessageW(
                overlay, message, buttons, (xx & 65535) | ((yy & 65535) << 16)
            )

        t1 = clock()
        if directed:
            mouse(0x201, 1, start)
        else:
            U.SetCursorPos(*start)
            U.mouse_event(2, 0, 0, 0, 0)
        down = True
        time.sleep(0.008)
        if directed:
            mouse(0x200, 1, end)
        else:
            U.SetCursorPos(*end)

        def painted():
            a = edge.get()
            return max(a[:40:4]) < 10 and min(a[40::4]) > 243

        wait_for(painted, 3, "physical selection border")
        t2 = clock()
        if n == 2:
            U.SendMessageW(desktop.image, 0x172, 0, desktop.alternate)
            U.UpdateWindow(desktop.image)
        time.sleep(0.14)
        tr = clock()
        if directed:
            mouse(0x202, 0, end)
        else:
            U.SetCursorPos(*end)
            U.mouse_event(4, 0, 0, 0, 0)
        down = False
        wait_for(
            lambda: U.GetClipboardSequenceNumber() != before, 3, "clipboard publication"
        )
        clip.verify(expected, cw, ch, overlay)
        tc = clock()
        stats = wch.finish()
        wch = None
        return dict(
            display=[x, y, w, h, dpi],
            overlay_hwnd=overlay,
            background_swapped=(n == 2),
            reverse=reverse,
            ready_ms=round((t1 - t0) * 1000, 1),
            border_ms=round((t2 - t0) * 1000, 1),
            release_verified_ms=round((tc - tr) * 1000, 1),
            pixels="exact",
            **stats,
        )
    finally:
        if down:
            if directed and overlay:
                mouse(0x202, 0, end)
            else:
                U.mouse_event(4, 0, 0, 0, 0)
        if (
            overlay
            and U.IsWindowVisible(H(overlay))
            and cls(overlay) == "WSearchTrialSelection"
        ):
            if directed:
                U.SendMessageW(overlay, 0x100, 27, 1)
            else:
                keys([(27, False), (27, True)])
        if wch:
            wch.finish()
        if n == 2:
            U.SendMessageW(desktop.image, 0x172, 0, desktop.bitmap)
            U.UpdateWindow(desktop.image)
        for q in [region, badge, edge]:
            q.close()


def benchmark(
    name, batch, displays, *, executable=None, measure_return=False, directed=False
):
    path = executable or (
        BASE
        / "artifacts"
        / (
            "tauri-windows-x64/wsearch-tauri-trial.exe"
            if name == "tauri"
            else "electrobun-windows-x64/bin/launcher.exe"
        )
    )
    wd = Path(tempfile.mkdtemp(prefix=name + "-", dir=WORK))
    env = {**os.environ, "WSEARCH_TRIAL_BENCH_DIR": str(wd)}
    ui = batch == "ui"
    if ui:
        env["WSEARCH_TRIAL_SHOW_UI"] = "1"
    out = open(wd / "output.log", "wb")
    t = clock()
    proc = sp.Popen(
        [str(path)],
        cwd=path.parent,
        env=env,
        stdout=out,
        stderr=out,
        creationflags=sp.CREATE_NO_WINDOW,
    )
    readyfile = wd / "ready"
    samples = []
    try:
        wait_for(readyfile.exists, 18, "runtime ready " + str(wd))
        startup = (clock() - t) * 1000
        assert readyfile.read_text() == "registered", "Global shortcut unavailable"
        ui_ms = None
        if ui:
            wait_for(lambda: visible_info(proc.pid), 12, "visible WebView heading")
            ui_ms = round((clock() - t) * 1000, 1)
        time.sleep(2.0)
        for _ in range(10):
            samples.append(sum(tree(proc.pid).values()))
            time.sleep(0.1)
        idlecpu = Watch(proc.pid)
        time.sleep(1)
        idle = idlecpu.finish()
        report = dict(
            name=name,
            batch=batch,
            ui_visible_ms=ui_ms,
            launch_ms=round(startup, 1),
            idle_private_mib=round(statistics.median(samples), 2),
            idle_processes=len(tree(proc.pid)),
            idle_commit_mib=idle["peak_private_commit_mib"],
            idle_cpu_ms_per_second=idle["cpu_ms"],
            trials=[],
        )
        if not ui:
            for i, mon in enumerate(displays):
                desktop = Desktop(mon)
                clip = None
                try:
                    clip = Clipboard(desktop.hwnd)
                    for n in range(3):
                        (wd / "native.json").unlink(missing_ok=True)
                        result = test(proc.pid, mon, clip, n, desktop, directed)
                        wait_for(
                            lambda: (
                                (wd / "native.json").exists()
                                and (wd / "native.json").stat().st_size > 0
                            ),
                            3,
                            "native diagnostics",
                        )
                        result.update(json.loads((wd / "native.json").read_text()))
                        report["trials"].append(result)
                        if measure_return:
                            (wd / "samples.json").write_text(
                                json.dumps(report), encoding="utf8"
                            )
                        print(name, i, n, result, flush=True)
                        time.sleep(0.25)
                    desktop.focus_fixture()
                    before = U.GetClipboardSequenceNumber()
                    U.SetCursorPos(mon[0] + 200, mon[1] + 200)
                    chord(83)

                    def cancel_ready():
                        v = U.FindWindowW("WSearchTrialSelection", None)
                        hit = U.GetAncestor(U.WindowFromPoint(cursor()), 2)
                        if (
                            not v
                            or not U.IsWindowVisible(v)
                            or hwnd_pid(v) not in tree(proc.pid)
                        ):
                            return False
                        return v if directed or hit == v else False

                    ov = wait_for(cancel_ready, 4, "cancel overlay")
                    assert hwnd_pid(ov) in tree(proc.pid)
                    if directed:
                        U.SendMessageW(ov, 0x100, 27, 1)
                    else:
                        keys([(27, False), (27, True)])
                    wait_for(lambda: not U.IsWindowVisible(H(ov)), 3, "cancel closed")
                    assert before == U.GetClipboardSequenceNumber()
                finally:
                    if clip:
                        clip.close()
                    desktop.close()
            report["escape_preserves_clipboard"] = True
            if measure_return:
                time.sleep(2)
                after = []
                for _ in range(10):
                    after.append(sum(tree(proc.pid).values()))
                    time.sleep(0.1)
                report["returned_private_mib"] = round(statistics.median(after), 2)
        return report
    finally:
        if (
            readyfile.exists()
            and readyfile.read_text() == "registered"
            and cls(U.GetForegroundWindow()) != "RustdeskMultiWindow"
        ):
            chord(0x76)
            try:
                proc.wait(timeout=5)
            except sp.TimeoutExpired:
                pass
        # An error must not leave trial processes occupying the test chord.
        if proc.poll() is None:
            sp.run(
                ["taskkill", "/pid", str(proc.pid), "/t", "/f"],
                stdout=sp.DEVNULL,
                stderr=sp.DEVNULL,
                check=True,
            )
            proc.wait(5)
        out.close()


if __name__ == "__main__":
    api(U, "FindWindowW", H, W.LPCWSTR, W.LPCWSTR)
    api(U, "IsWindowVisible", I, H)
    assert C.sizeof(P) == 8
    old = cursor()
    displays = monitors()
    reports = []
    target = BASE / "results/windows.json"
    requested = sys.argv[1:] or [
        "tauri:1",
        "electrobun:1",
        "electrobun:2",
        "tauri:2",
        "tauri:ui",
        "electrobun:ui",
    ]
    if sys.argv[1:] and target.exists():
        reports = json.loads(target.read_text("utf8"))["runs"]
    try:
        for item in requested:
            name, batch = item.split(":")
            r = benchmark(name, batch, displays)
            reports = [x for x in reports if (x["name"], x["batch"]) != (name, batch)]
            reports.append(r)
            print("completed", name, batch, flush=True)
            target.write_text(
                json.dumps({"displays": displays, "runs": reports}, indent=2), "utf8"
            )
    finally:
        U.SetCursorPos(old.x, old.y)
