#include <X11/Xatom.h>
#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/cursorfont.h>
#include <X11/extensions/Xrandr.h>
#include <X11/keysym.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <gio/gio.h>
#include <limits>
#include <png.h>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

namespace {
struct Rect {
    int x, y, w, h;
};
Rect screenAtPointer(Display *d, Window root) {
    Window a, b;
    int x, y, rx, ry;
    unsigned state;
    XQueryPointer(d, root, &a, &b, &x, &y, &rx, &ry, &state);
    Rect area{0, 0, DisplayWidth(d, DefaultScreen(d)), DisplayHeight(d, DefaultScreen(d))};
    int count = 0;
    auto m = XRRGetMonitors(d, root, True, &count);
    for (int i = 0; i < count; i++)
        if (x >= m[i].x && y >= m[i].y && x < m[i].x + m[i].width && y < m[i].y + m[i].height) {
            area = {m[i].x, m[i].y, m[i].width, m[i].height};
            break;
        }
    if (m)
        XRRFreeMonitors(m);
    return area;
}
bool sendClipboard(const void *pixels, size_t length, bool wayland) {
    auto process =
        g_subprocess_new(G_SUBPROCESS_FLAGS_STDIN_PIPE, nullptr, wayland ? "wl-copy" : "xclip",
                         wayland ? "--type" : "-selection", wayland ? "image/png" : "clipboard",
                         wayland ? nullptr : "-t", "image/png", nullptr);
    if (!process)
        return false;
    auto stream = g_subprocess_get_stdin_pipe(process);
    bool ok = g_output_stream_write_all(stream, pixels, length, nullptr, nullptr, nullptr);
    ok = g_output_stream_close(stream, nullptr, nullptr) && ok;
    ok = g_subprocess_wait_check(process, nullptr, nullptr) && ok;
    g_object_unref(process);
    return ok;
}
unsigned char channel(unsigned long pixel, unsigned long mask) {
    if (!mask)
        return 0;
    while (!(mask & 1)) {
        mask >>= 1;
        pixel >>= 1;
    }
    return static_cast<unsigned char>(((pixel & mask) * 255 + mask / 2) / mask);
}
bool copyRect(XImage *image, Rect rect) {
    std::vector<unsigned char> rgb(static_cast<size_t>(rect.w) * rect.h * 3);
    for (int y = 0; y < rect.h; y++)
        for (int x = 0; x < rect.w; x++) {
            auto pixel = XGetPixel(image, rect.x + x, rect.y + y);
            size_t i = (static_cast<size_t>(y) * rect.w + x) * 3;
            rgb[i] = channel(pixel, image->red_mask);
            rgb[i + 1] = channel(pixel, image->green_mask);
            rgb[i + 2] = channel(pixel, image->blue_mask);
        }
    png_image out{};
    out.version = PNG_IMAGE_VERSION;
    out.width = rect.w;
    out.height = rect.h;
    out.format = PNG_FORMAT_RGB;
    png_alloc_size_t size = 0;
    if (!png_image_write_to_memory(&out, nullptr, &size, 0, rgb.data(), 0, nullptr))
        return false;
    std::vector<unsigned char> png(size);
    if (!png_image_write_to_memory(&out, png.data(), &size, 0, rgb.data(), 0, nullptr))
        return false;
    return sendClipboard(png.data(), size, false);
}
int x11Capture() {
    Display *d = XOpenDisplay(nullptr);
    if (!d)
        return 2;
    Window root = DefaultRootWindow(d);
    auto area = screenAtPointer(d, root);
    XImage *image = XGetImage(d, root, area.x, area.y, area.w, area.h, AllPlanes, ZPixmap);
    if (!image) {
        XCloseDisplay(d);
        return 2;
    }
    XSetWindowAttributes attr{};
    attr.override_redirect = True;
    attr.event_mask =
        ExposureMask | ButtonPressMask | ButtonReleaseMask | PointerMotionMask | KeyPressMask;
    Window win =
        XCreateWindow(d, root, area.x, area.y, area.w, area.h, 0, CopyFromParent, InputOutput,
                      CopyFromParent, CWOverrideRedirect | CWEventMask, &attr);
    XStoreName(d, win, "wSearch Trial Capture");
    Cursor cross = XCreateFontCursor(d, XC_crosshair);
    XDefineCursor(d, win, cross);
    XMapRaised(d, win);
    XSync(d, False);
    bool grabbed =
        XGrabKeyboard(d, win, False, GrabModeAsync, GrabModeAsync, CurrentTime) == GrabSuccess;
    const int pointer =
        XGrabPointer(d, win, False, ButtonPressMask | ButtonReleaseMask | PointerMotionMask,
                     GrabModeAsync, GrabModeAsync, win, cross, CurrentTime);
    GC gc = XCreateGC(d, win, 0, nullptr);
    bool dragging = false, done = !grabbed || pointer != GrabSuccess;
    int result = done ? 2 : 1, x0 = 0, y0 = 0, x1 = 0, y1 = 0;
    auto selection = [&]() {
        return Rect{std::min(x0, x1), std::min(y0, y1), std::abs(x1 - x0), std::abs(y1 - y0)};
    };
    auto paint = [&](Rect r) {
        if (r.w > 0 && r.h > 0)
            XPutImage(d, win, gc, image, r.x, r.y, r.x, r.y, r.w, r.h);
        if (dragging) {
            auto b = selection();
            if (b.w > 1 && b.h > 1) {
                XSetForeground(d, gc, BlackPixel(d, DefaultScreen(d)));
                XDrawRectangle(d, win, gc, b.x, b.y, b.w - 1, b.h - 1);
                if (b.w > 3 && b.h > 3) {
                    XSetForeground(d, gc, WhitePixel(d, DefaultScreen(d)));
                    XDrawRectangle(d, win, gc, b.x + 1, b.y + 1, b.w - 3, b.h - 3);
                }
            }
        }
        XSetForeground(d, gc, BlackPixel(d, DefaultScreen(d)));
        XFillRectangle(d, win, gc, 12, 12, 238, 30);
        XSetForeground(d, gc, WhitePixel(d, DefaultScreen(d)));
        const char *label = "Drag to copy  |  Esc to cancel";
        XDrawString(d, win, gc, 22, 31, label, static_cast<int>(strlen(label)));
        XFlush(d);
    };
    paint({0, 0, area.w, area.h});
    Rect selected{};
    while (!done) {
        XEvent e{};
        XNextEvent(d, &e);
        switch (e.type) {
        case Expose:
            paint({e.xexpose.x, e.xexpose.y, e.xexpose.width, e.xexpose.height});
            break;
        case KeyPress:
            if (XLookupKeysym(&e.xkey, 0) == XK_Escape)
                done = true;
            break;
        case ButtonPress:
            if (e.xbutton.button == Button1) {
                dragging = true;
                x0 = x1 = e.xbutton.x;
                y0 = y1 = e.xbutton.y;
            }
            break;
        case MotionNotify:
            if (dragging) {
                auto old = selection();
                x1 = std::clamp(e.xmotion.x, 0, area.w);
                y1 = std::clamp(e.xmotion.y, 0, area.h);
                auto next = selection();
                int x = std::min(old.x, next.x), y = std::min(old.y, next.y);
                paint({x, y, std::max(old.x + old.w, next.x + next.w) - x,
                       std::max(old.y + old.h, next.y + next.h) - y});
            }
            break;
        case ButtonRelease:
            if (dragging && e.xbutton.button == Button1) {
                dragging = false;
                x1 = std::clamp(e.xbutton.x, 0, area.w);
                y1 = std::clamp(e.xbutton.y, 0, area.h);
                selected = selection();
                if (selected.w > 0 && selected.h > 0)
                    done = true;
            }
            break;
        }
    }
    XUngrabPointer(d, CurrentTime);
    XUngrabKeyboard(d, CurrentTime);
    XFreeGC(d, gc);
    XFreeCursor(d, cross);
    XDestroyWindow(d, win);
    XSync(d, False);
    if (selected.w > 0 && selected.h > 0)
        result = copyRect(image, selected) ? 0 : 2;
    XDestroyImage(image);
    XCloseDisplay(d);
    return result;
}
struct PortalResult {
    GMainLoop *loop;
    int status = 2;
    bool received = false;
};
void portalResponse(GDBusConnection *, const gchar *, const gchar *, const gchar *, const gchar *,
                    GVariant *parameters, gpointer context) {
    auto *result = static_cast<PortalResult *>(context);
    guint code = 2;
    GVariant *values = nullptr;
    g_variant_get(parameters, "(u@a{sv})", &code, &values);
    const gchar *uri = nullptr;
    if (code == 1)
        result->status = 1;
    if (code == 0 && g_variant_lookup(values, "uri", "&s", &uri)) {
        GFile *file = g_file_new_for_uri(uri);
        gchar *content = nullptr;
        gsize len = 0;
        if (g_file_load_contents(file, nullptr, &content, &len, nullptr, nullptr)) {
            result->status = sendClipboard(content, len, true) ? 0 : 2;
            g_free(content);
        }
        g_object_unref(file);
    }
    g_variant_unref(values);
    result->received = true;
    g_main_loop_quit(result->loop);
}
int portalCapture() {
    auto bus = g_bus_get_sync(G_BUS_TYPE_SESSION, nullptr, nullptr);
    if (!bus)
        return 2;
    gchar *token = g_strdup_printf("wsearch_%u_%u", getpid(), g_random_int());
    gchar *sender = g_strdup(g_dbus_connection_get_unique_name(bus) + 1);
    g_strdelimit(sender, ".", '_');
    gchar *requestPath =
        g_strdup_printf("/org/freedesktop/portal/desktop/request/%s/%s", sender, token);
    PortalResult result{g_main_loop_new(nullptr, FALSE)};
    auto sub = g_dbus_connection_signal_subscribe(
        bus, "org.freedesktop.portal.Desktop", "org.freedesktop.portal.Request", "Response",
        requestPath, nullptr, G_DBUS_SIGNAL_FLAGS_NONE, portalResponse, &result, nullptr);
    GVariantBuilder args;
    g_variant_builder_init(&args, G_VARIANT_TYPE_VARDICT);
    g_variant_builder_add(&args, "{sv}", "interactive", g_variant_new_boolean(TRUE));
    g_variant_builder_add(&args, "{sv}", "handle_token", g_variant_new_string(token));
    GVariant *reply = g_dbus_connection_call_sync(
        bus, "org.freedesktop.portal.Desktop", "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.Screenshot", "Screenshot", g_variant_new("(sa{sv})", "", &args),
        G_VARIANT_TYPE("(o)"), G_DBUS_CALL_FLAGS_NONE, 15000, nullptr, nullptr);
    if (reply) {
        const gchar *actual = nullptr;
        g_variant_get(reply, "(&o)", &actual);
        if (g_strcmp0(actual, requestPath) != 0) {
            g_dbus_connection_signal_unsubscribe(bus, sub);
            sub = g_dbus_connection_signal_subscribe(
                bus, "org.freedesktop.portal.Desktop", "org.freedesktop.portal.Request", "Response",
                actual, nullptr, G_DBUS_SIGNAL_FLAGS_NONE, portalResponse, &result, nullptr);
        }
        if (!result.received)
            g_main_loop_run(result.loop);
        g_variant_unref(reply);
    }
    g_dbus_connection_signal_unsubscribe(bus, sub);
    g_main_loop_unref(result.loop);
    g_free(requestPath);
    g_free(sender);
    g_free(token);
    g_object_unref(bus);
    return result.status;
}
} // namespace
int main() {
    const char *wayland = getenv("WAYLAND_DISPLAY");
    if (wayland && *wayland)
        return portalCapture();
    return x11Capture();
}
