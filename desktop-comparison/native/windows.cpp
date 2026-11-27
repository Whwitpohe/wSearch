#define UNICODE
#define _UNICODE
#define NOMINMAX
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <limits>
#include <string>
#include <windows.h>
#include <windowsx.h>
#ifdef WSEARCH_TAURI_OVERLAY
#include <dwmapi.h>
#endif

namespace {
struct Frame {
    HDC dc = nullptr;
    HBITMAP bitmap = nullptr;
    HGDIOBJ previous = nullptr;
    unsigned char *pixels = nullptr;
    RECT monitor{};
    int width = 0, height = 0;

    bool grab() {
        POINT cursor{};
        MONITORINFO info{sizeof(info)};
        if (!GetCursorPos(&cursor) ||
            !GetMonitorInfo(MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST), &info))
            return false;
        monitor = info.rcMonitor;
        width = monitor.right - monitor.left;
        height = monitor.bottom - monitor.top;
        HDC screen = GetDC(nullptr);
        if (!screen)
            return false;
        BITMAPINFO fmt{};
        fmt.bmiHeader.biSize = sizeof(BITMAPINFOHEADER);
        fmt.bmiHeader.biWidth = width;
        fmt.bmiHeader.biHeight = -height;
        fmt.bmiHeader.biPlanes = 1;
        fmt.bmiHeader.biBitCount = 32;
        dc = CreateCompatibleDC(screen);
        bitmap = CreateDIBSection(screen, &fmt, DIB_RGB_COLORS, reinterpret_cast<void **>(&pixels),
                                  nullptr, 0);
        if (dc && bitmap)
            previous = SelectObject(dc, bitmap);
        bool copied = previous && BitBlt(dc, 0, 0, width, height, screen, monitor.left, monitor.top,
                                         SRCCOPY | CAPTUREBLT);
        GdiFlush();
        ReleaseDC(nullptr, screen);
        return copied;
    }
    void clear() {
        if (previous)
            SelectObject(dc, previous);
        if (bitmap)
            DeleteObject(bitmap);
        if (dc)
            DeleteDC(dc);
        dc = nullptr;
        bitmap = nullptr;
        previous = nullptr;
        pixels = nullptr;
        width = height = 0;
    }
    ~Frame() { clear(); }
};
Frame frame;
bool dragging = false;
POINT origin{}, current{};
using Clock = std::chrono::steady_clock;
void timings(Clock::time_point entered, Clock::time_point grabbed, Clock::time_point drawn) {
    if (const auto *dir = _wgetenv(L"WSEARCH_TRIAL_BENCH_DIR")) {
        const auto file = std::wstring(dir) + L"\\native.json";
        if (auto *f = _wfopen(file.c_str(), L"w")) {
            std::fprintf(f, "{\"grab_ms\":%.3f,\"setup_paint_ms\":%.3f}",
                         std::chrono::duration<double, std::milli>(grabbed - entered).count(),
                         std::chrono::duration<double, std::milli>(drawn - grabbed).count());
            std::fclose(f);
        }
    }
}
void drawBadge(HDC dc) {
    RECT badge{12, 12, 250, 42};
    FillRect(dc, &badge, static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));
    SetTextColor(dc, RGB(255, 255, 255));
    SetBkMode(dc, TRANSPARENT);
    DrawText(dc, L"拖动选择区域   ·   Esc 取消", -1, &badge,
             DT_SINGLELINE | DT_CENTER | DT_VCENTER);
}
#ifdef WSEARCH_TAURI_OVERLAY
bool active = false;
bool escapeRegistered = false;
Clock::time_point entered, grabbed, drawn;
HDC badgeDC = nullptr;
HBITMAP badgeBitmap = nullptr;
HGDIOBJ oldBadge = nullptr;
void finish(HWND hwnd, int) {
    if (!active)
        return;
    active = dragging = false;
    if (GetCapture() == hwnd)
        ReleaseCapture();
    if (escapeRegistered)
        UnregisterHotKey(hwnd, 1);
    escapeRegistered = false;
    ShowWindow(hwnd, SW_HIDE);
    frame.clear();
    // Finish removing the old surface before a queued shortcut can acquire the next frame.
    DwmFlush();
    timings(entered, grabbed, drawn);
}
#else
void finish(HWND, int code) { PostQuitMessage(code); }
#endif
RECT selection() {
    return {std::min(origin.x, current.x), std::min(origin.y, current.y),
            std::max(origin.x, current.x), std::max(origin.y, current.y)};
}
POINT position(LPARAM arg) {
    return {std::clamp(GET_X_LPARAM(arg), 0, frame.width),
            std::clamp(GET_Y_LPARAM(arg), 0, frame.height)};
}
bool copy(HWND window, RECT r) {
    int w = r.right - r.left, h = r.bottom - r.top;
    if (w <= 0 || h <= 0)
        return false;
    size_t stride = static_cast<size_t>(w) * 4;
    if (stride > (std::numeric_limits<size_t>::max() - sizeof(BITMAPINFOHEADER)) / h)
        return false;
    HGLOBAL data = GlobalAlloc(GMEM_MOVEABLE, sizeof(BITMAPINFOHEADER) + stride * h);
    if (!data)
        return false;
    auto header = static_cast<BITMAPINFOHEADER *>(GlobalLock(data));
    if (!header) {
        GlobalFree(data);
        return false;
    }
    *header = {};
    header->biSize = sizeof(*header);
    header->biWidth = w;
    header->biHeight = -h;
    header->biPlanes = 1;
    header->biBitCount = 32;
    header->biCompression = BI_RGB;
    auto dest = reinterpret_cast<unsigned char *>(header + 1);
    for (int y = 0; y < h; y++) {
        auto row = dest + stride * y;
        std::memcpy(row, frame.pixels + (static_cast<size_t>(r.top + y) * frame.width + r.left) * 4,
                    stride);
        for (int x = 0; x < w; x++)
            row[4 * x + 3] = 255;
    }
    GlobalUnlock(data);
    bool ok = false;
    for (int attempt = 0; attempt < 12; attempt++) {
        if (OpenClipboard(window)) {
            ok = EmptyClipboard() && SetClipboardData(CF_DIB, data) != nullptr;
            CloseClipboard();
            break;
        }
        Sleep(5);
    }
    if (!ok)
        GlobalFree(data);
    return ok;
}
void change(HWND hwnd, POINT p) {
    RECT old = selection();
    current = p;
    RECT next = selection(), dirty{};
    UnionRect(&dirty, &old, &next);
    InflateRect(&dirty, 3, 3);
    InvalidateRect(hwnd, &dirty, FALSE);
}
LRESULT CALLBACK procedure(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
    switch (msg) {
    case WM_ERASEBKGND:
        return 1;
    case WM_PAINT: {
        PAINTSTRUCT ps{};
        HDC dc = BeginPaint(hwnd, &ps);
        if (!frame.dc) {
            EndPaint(hwnd, &ps);
            return 0;
        }
        const RECT &r = ps.rcPaint;
        BitBlt(dc, r.left, r.top, r.right - r.left, r.bottom - r.top, frame.dc, r.left, r.top,
               SRCCOPY);
        if (dragging) {
            RECT box = selection();
            FrameRect(dc, &box, static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));
            InflateRect(&box, -1, -1);
            FrameRect(dc, &box, static_cast<HBRUSH>(GetStockObject(WHITE_BRUSH)));
        }
#ifdef WSEARCH_TAURI_OVERLAY
        if (badgeDC)
            BitBlt(dc, 12, 12, 238, 30, badgeDC, 12, 12, SRCCOPY);
        else
            drawBadge(dc);
#else
        drawBadge(dc);
#endif
        EndPaint(hwnd, &ps);
        return 0;
    }
    case WM_LBUTTONDOWN:
#ifdef WSEARCH_TAURI_OVERLAY
        if (!active)
            return 0;
#endif
        origin = current = position(lp);
        dragging = true;
        SetCapture(hwnd);
        return 0;
    case WM_MOUSEMOVE:
        if (dragging)
            change(hwnd, position(lp));
        return 0;
    case WM_LBUTTONUP:
        if (dragging) {
            current = position(lp);
            RECT r = selection();
            dragging = false;
            ReleaseCapture();
            if (IsRectEmpty(&r))
                return 0;
            finish(hwnd, copy(hwnd, r) ? 0 : 2);
        }
        return 0;
    case WM_CAPTURECHANGED:
        if (dragging)
            finish(hwnd, 1);
        return 0;
    case WM_HOTKEY:
        if (wp == 1)
            finish(hwnd, 1);
        return 0;
    case WM_KEYDOWN:
        if (wp == VK_ESCAPE)
            finish(hwnd, 1);
        return 0;
    case WM_CLOSE:
        finish(hwnd, 1);
        return 0;
    case WM_DISPLAYCHANGE:
        finish(hwnd, 1);
        return 0;
#ifdef WSEARCH_TAURI_OVERLAY
    case WM_MOUSEACTIVATE:
        if (escapeRegistered)
            return MA_NOACTIVATE;
        break;
#endif
    default:
        return DefWindowProc(hwnd, msg, wp, lp);
    }
    return DefWindowProc(hwnd, msg, wp, lp);
}
HWND createOverlay(HINSTANCE instance, const RECT &bounds) {
    WNDCLASS wc{};
    wc.hInstance = instance;
    wc.lpszClassName = L"WSearchTrialSelection";
    wc.lpfnWndProc = procedure;
    wc.hCursor = LoadCursor(nullptr, IDC_CROSS);
    if (!RegisterClass(&wc) && GetLastError() != ERROR_CLASS_ALREADY_EXISTS)
        return nullptr;
    return CreateWindowEx(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, wc.lpszClassName,
                          L"wSearch Trial Capture", WS_POPUP, bounds.left, bounds.top,
                          bounds.right - bounds.left, bounds.bottom - bounds.top, nullptr, nullptr,
                          instance, nullptr);
}
} // namespace
#ifdef WSEARCH_TAURI_OVERLAY
namespace {
struct PhysicalPixels {
    DPI_AWARENESS_CONTEXT previous =
        SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    ~PhysicalPixels() {
        if (previous)
            SetThreadDpiAwarenessContext(previous);
    }
};
} // namespace
extern "C" HWND wsearch_prepare_overlay() {
    PhysicalPixels dpi;
    HWND hwnd = createOverlay(GetModuleHandle(nullptr), RECT{0, 0, 1, 1});
    if (!hwnd)
        return nullptr;
    BOOL disabled = TRUE;
    DwmSetWindowAttribute(hwnd, DWMWA_TRANSITIONS_FORCEDISABLED, &disabled, sizeof(disabled));
    HDC screen = GetDC(nullptr);
    if (screen) {
        badgeBitmap = CreateCompatibleBitmap(screen, 250, 42);
        if (badgeBitmap)
            badgeDC = CreateCompatibleDC(screen);
        if (badgeDC) {
            oldBadge = SelectObject(badgeDC, badgeBitmap);
            drawBadge(badgeDC);
            GdiFlush();
        }
        ReleaseDC(nullptr, screen);
    }
    return hwnd;
}
extern "C" int wsearch_begin_capture(HWND hwnd) {
    if (!IsWindow(hwnd))
        return 0;
    if (active)
        return 1;
    PhysicalPixels dpi;
    entered = Clock::now();
    if (!frame.grab()) {
        frame.clear();
        return 0;
    }
    grabbed = Clock::now();
    active = true;
    escapeRegistered = RegisterHotKey(hwnd, 1, MOD_NOREPEAT, VK_ESCAPE) != FALSE;
    if (!SetWindowPos(hwnd, HWND_TOPMOST, frame.monitor.left, frame.monitor.top, frame.width,
                      frame.height, SWP_SHOWWINDOW | SWP_NOACTIVATE)) {
        drawn = Clock::now();
        finish(hwnd, 2);
        return 0;
    }
    if (!escapeRegistered) {
        SetForegroundWindow(hwnd);
        SetFocus(hwnd);
    }
    RedrawWindow(hwnd, nullptr, nullptr, RDW_INVALIDATE | RDW_UPDATENOW);
    drawn = Clock::now();
    return 1;
}
extern "C" void wsearch_destroy_overlay(HWND hwnd) {
    finish(hwnd, 1);
    DestroyWindow(hwnd);
    if (oldBadge)
        SelectObject(badgeDC, oldBadge);
    if (badgeBitmap)
        DeleteObject(badgeBitmap);
    if (badgeDC)
        DeleteDC(badgeDC);
    oldBadge = nullptr;
    badgeBitmap = nullptr;
    badgeDC = nullptr;
}
#else
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int) {
    const auto entered = Clock::now();
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    if (!frame.grab())
        return 2;
    const auto grabbed = Clock::now();
    HWND hwnd = createOverlay(instance, frame.monitor);
    if (!hwnd)
        return 2;
    const bool escapeRegistered = RegisterHotKey(hwnd, 1, MOD_NOREPEAT, VK_ESCAPE) != FALSE;
    ShowWindow(hwnd, SW_SHOW);
    SetForegroundWindow(hwnd);
    SetFocus(hwnd);
    UpdateWindow(hwnd);
    const auto drawn = Clock::now();
    MSG msg{};
    int rc;
    while ((rc = GetMessage(&msg, nullptr, 0, 0)) > 0) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    if (escapeRegistered)
        UnregisterHotKey(hwnd, 1);
    DestroyWindow(hwnd);
    timings(entered, grabbed, drawn);
    return rc < 0 ? 2 : static_cast<int>(msg.wParam);
}
#endif
