import {
    BrowserWindow,
    type Rectangle,
    screen,
    type WebContents,
} from "electron";
import { mainOn, mainSend } from "../../lib/ipc";
import type { PinPanelState } from "../ShareTypes";

export function outsidePin(
    pin: Rectangle,
    work: Rectangle,
    width: number,
    height: number,
): Rectangle | null {
    const right = work.x + work.width,
        bottom = work.y + work.height,
        gap = 4;
    const x = Math.round(
        Math.max(
            work.x,
            Math.min(right - width, pin.x + (pin.width - width) / 2),
        ),
    );
    const y = Math.round(
        Math.max(
            work.y,
            Math.min(bottom - height, pin.y + (pin.height - height) / 2),
        ),
    );
    const candidates = [
        { x, y: pin.y + pin.height + gap },
        { x, y: pin.y - height - gap },
        { x: pin.x + pin.width + gap, y },
        { x: pin.x - width - gap, y },
    ];
    for (const p of candidates)
        if (
            p.x >= work.x &&
            p.y >= work.y &&
            p.x + width <= right &&
            p.y + height <= bottom
        )
            return { ...p, width, height };
    return null;
}
type Panel = {
    win: BrowserWindow;
    owner: WebContents;
    state: PinPanelState;
    anchor: Rectangle;
    ready: boolean;
    tools: boolean;
    revision: number;
    rendered?: string;
    size?: { width: number; height: number };
    unwatch: () => void;
    timer?: ReturnType<typeof setTimeout>;
};
export function initPinPanels(
    allowed: (id: number, sender: WebContents) => boolean,
    load: (win: BrowserWindow) => void,
    trayStatus: (msg: string) => void,
) {
    const panels = new Map<number, Panel>();
    function close(id: number) {
        const p = panels.get(id);
        if (!p) return;
        panels.delete(id);
        clearTimeout(p.timer);
        p.unwatch();
        if (!p.win.isDestroyed()) p.win.destroy();
        trayStatus("");
    }
    function position(p: Panel) {
        if (!p.size || (!p.tools && !p.state.status)) return;
        const work = screen.getDisplayMatching(p.anchor).workArea;
        const rect = outsidePin(p.anchor, work, p.size.width, p.size.height);
        if (!rect) {
            p.win.hide();
            if (p.state.status) trayStatus(p.state.status);
            return;
        }
        const current = p.win.getBounds();
        if (
            current.x !== rect.x ||
            current.y !== rect.y ||
            current.width !== rect.width ||
            current.height !== rect.height
        )
            p.win.setBounds(rect);
        if (!p.win.isVisible()) p.win.showInactive();
    }
    function paint(p: Panel) {
        if (!p.ready) return;
        const available = screen.getDisplayMatching(p.anchor).workArea.width;
        const zoom = p.win.webContents.getZoomFactor();
        const maxWidth = Math.min(available / zoom, p.tools ? 510 : 360);
        const key = JSON.stringify([
            maxWidth,
            p.state.status,
            p.state.closeLabel,
            p.tools,
            p.tools
                ? [
                      p.state.buttons,
                      p.state.zoom,
                      p.state.opacity,
                      p.state.zoomLabel,
                      p.state.opacityLabel,
                  ]
                : null,
        ]);
        if (key !== p.rendered) {
            p.rendered = key;
            mainSend(p.win.webContents, "pinPanelRender", [
                p.state,
                p.tools,
                maxWidth,
                ++p.revision,
            ]);
        } else position(p);
    }
    mainOn("pinPanelSize", ([id, revision, w, h], event) => {
        const p = panels.get(id);
        if (
            !p ||
            event.sender !== p.win.webContents ||
            event.senderFrame !== event.sender.mainFrame ||
            revision !== p.revision
        )
            return;
        const work = screen.getDisplayMatching(p.anchor).workArea;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
            return;
        p.size = {
            width: Math.min(
                Math.ceil(Math.min(w, 510) * p.win.webContents.getZoomFactor()),
                work.width,
            ),
            height: Math.min(
                Math.ceil(h * p.win.webContents.getZoomFactor()),
                work.height,
            ),
        };
        position(p);
    });
    function deferHide(p: Panel) {
        clearTimeout(p.timer);
        p.timer = setTimeout(() => {
            if (p.win.isDestroyed()) return;
            const b = p.win.getBounds(),
                mouse = screen.getCursorScreenPoint();
            const inside = (r: Rectangle) =>
                mouse.x >= r.x &&
                mouse.x < r.x + r.width &&
                mouse.y >= r.y &&
                mouse.y < r.y + r.height;
            if (p.state.compact && (inside(b) || inside(p.anchor))) {
                deferHide(p);
                return;
            }
            if (!p.state.status) {
                p.tools = false;
                p.win.hide();
                p.timer = setTimeout(() => close(p.state.id), 20000);
                return;
            }
            p.tools = false;
            paint(p);
        }, 500);
    }
    mainOn("pinPanelState", ([state], event) => {
        if (
            !allowed(state.id, event.sender) ||
            event.senderFrame !== event.sender.mainFrame
        )
            return;
        const owner = BrowserWindow.fromWebContents(event.sender);
        if (!owner) return;
        const bounds = owner.getContentBounds(),
            z = event.sender.getZoomFactor();
        const anchor = {
            x: Math.round(bounds.x + state.rect.x * z),
            y: Math.round(bounds.y + state.rect.y * z),
            width: Math.round(state.rect.width * z),
            height: Math.round(state.rect.height * z),
        };
        if (
            !anchor.width ||
            !anchor.height ||
            anchor.x + anchor.width <= bounds.x ||
            anchor.x >= bounds.x + bounds.width ||
            anchor.y + anchor.height <= bounds.y ||
            anchor.y >= bounds.y + bounds.height
        )
            return;
        let panel = panels.get(state.id);
        if (panel && panel.owner !== event.sender) {
            if (!state.hovered) return;
            close(state.id);
            panel = undefined;
        }
        const tools = state.compact && state.hovered;
        if (!panel) {
            if (!tools && !state.status) return;
            const win = new BrowserWindow({
                width: 320,
                height: 50,
                frame: false,
                show: false,
                skipTaskbar: true,
                resizable: false,
                maximizable: false,
                minimizable: false,
                fullscreenable: false,
                transparent: true,
                hasShadow: false,
                backgroundColor: "#00000000",
                webPreferences: {
                    nodeIntegration: true,
                    contextIsolation: false,
                },
            });
            win.setMenu(null);
            win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
            win.webContents.on("will-navigate", (e) => e.preventDefault());
            win.setAlwaysOnTop(true, "screen-saver", 1);
            const reposition = () => {
                const panel = panels.get(state.id);
                if (
                    !panel ||
                    owner.isDestroyed() ||
                    panel.owner !== owner.webContents
                )
                    return;
                const origin = owner.getContentBounds(),
                    r = panel.state.rect,
                    z = panel.owner.getZoomFactor();
                panel.anchor = {
                    x: Math.round(origin.x + r.x * z),
                    y: Math.round(origin.y + r.y * z),
                    width: Math.round(r.width * z),
                    height: Math.round(r.height * z),
                };
                paint(panel);
            };
            const ownerClosed = () => close(state.id);
            owner.on("move", reposition);
            owner.on("closed", ownerClosed);
            const unwatch = () => {
                owner.off("move", reposition);
                owner.off("closed", ownerClosed);
            };
            panel = {
                win,
                owner: event.sender,
                state,
                anchor,
                tools,
                revision: 0,
                ready: false,
                unwatch,
            };
            panels.set(state.id, panel);
            const p = panel;
            win.webContents.once("did-finish-load", () => {
                if (!win.isDestroyed()) {
                    p.ready = true;
                    paint(p);
                }
            });
            win.on("closed", () => {
                p.unwatch();
                clearTimeout(p.timer);
                if (panels.get(state.id) === p) panels.delete(state.id);
            });
            load(win);
        }
        panel.owner = event.sender;
        panel.state = state;
        panel.anchor = anchor;
        clearTimeout(panel.timer);
        panel.tools = tools || (state.compact && panel.tools);
        if (!panel.tools && !state.status) {
            close(state.id);
            return;
        }
        paint(panel);
        if (!tools && panel.tools) deferHide(panel);
    });
    mainOn("pinPanelAction", ([id, action], event) => {
        const panel = panels.get(id);
        if (
            !panel ||
            panel.win.webContents !== event.sender ||
            panel.owner.isDestroyed()
        )
            return;
        mainSend(panel.owner, "pinPanelDispatch", [id, action]);
    });
    return close;
}
