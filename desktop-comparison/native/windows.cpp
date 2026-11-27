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
    ~Frame() {
        if (previous)
            SelectObject(dc, previous);
        if (bitmap)
            DeleteObject(bitmap);
        if (dc)
            DeleteDC(dc);
    }
};
Frame frame;
bool dragging = false;
POINT origin{}, current{};
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
        const RECT &r = ps.rcPaint;
        BitBlt(dc, r.left, r.top, r.right - r.left, r.bottom - r.top, frame.dc, r.left, r.top,
               SRCCOPY);
        if (dragging) {
            RECT box = selection();
            FrameRect(dc, &box, static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));
            InflateRect(&box, -1, -1);
            FrameRect(dc, &box, static_cast<HBRUSH>(GetStockObject(WHITE_BRUSH)));
        }
        RECT badge{12, 12, 250, 42};
        FillRect(dc, &badge, static_cast<HBRUSH>(GetStockObject(BLACK_BRUSH)));
        SetTextColor(dc, RGB(255, 255, 255));
        SetBkMode(dc, TRANSPARENT);
        DrawText(dc, L"拖动选择区域   ·   Esc 取消", -1, &badge,
                 DT_SINGLELINE | DT_CENTER | DT_VCENTER);
        EndPaint(hwnd, &ps);
        return 0;
    }
    case WM_LBUTTONDOWN:
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
            PostQuitMessage(copy(hwnd, r) ? 0 : 2);
        }
        return 0;
    case WM_CAPTURECHANGED:
        if (dragging)
            PostQuitMessage(1);
        return 0;
    case WM_HOTKEY:
        if (wp == 1)
            PostQuitMessage(1);
        return 0;
    case WM_KEYDOWN:
        if (wp == VK_ESCAPE)
            PostQuitMessage(1);
        return 0;
    case WM_CLOSE:
        PostQuitMessage(1);
        return 0;
    case WM_DISPLAYCHANGE:
        PostQuitMessage(1);
        return 0;
    default:
        return DefWindowProc(hwnd, msg, wp, lp);
    }
}
} // namespace
int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int) {
    using Clock = std::chrono::steady_clock;
    const auto entered = Clock::now();
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    if (!frame.grab())
        return 2;
    const auto grabbed = Clock::now();
    WNDCLASS wc{};
    wc.hInstance = instance;
    wc.lpszClassName = L"WSearchTrialSelection";
    wc.lpfnWndProc = procedure;
    wc.hCursor = LoadCursor(nullptr, IDC_CROSS);
    if (!RegisterClass(&wc))
        return 2;
    HWND hwnd =
        CreateWindowEx(WS_EX_TOPMOST | WS_EX_TOOLWINDOW, wc.lpszClassName, L"wSearch Trial Capture",
                       WS_POPUP, frame.monitor.left, frame.monitor.top, frame.width, frame.height,
                       nullptr, nullptr, instance, nullptr);
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
    if (const auto *dir = _wgetenv(L"WSEARCH_TRIAL_BENCH_DIR")) {
        const auto file = std::wstring(dir) + L"\\native.json";
        if (auto *f = _wfopen(file.c_str(), L"w")) {
            std::fprintf(f, "{\"grab_ms\":%.3f,\"setup_paint_ms\":%.3f}",
                         std::chrono::duration<double, std::milli>(grabbed - entered).count(),
                         std::chrono::duration<double, std::milli>(drawn - grabbed).count());
            std::fclose(f);
        }
    }
    return rc < 0 ? 2 : static_cast<int>(msg.wParam);
}
