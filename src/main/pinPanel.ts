import {
    BrowserWindow,
    type Point,
    type Rectangle,
    screen,
    type WebContents,
} from "electron";
import { mainOn, mainSend } from "../../lib/ipc";
import type { PinPanelPlacement, PinPanelState } from "../ShareTypes";

const panelGap = 4;

function inside(point: Point, rect: Rectangle, padding = 0) {
    return (
        point.x >= rect.x - padding &&
        point.x < rect.x + rect.width + padding &&
        point.y >= rect.y - padding &&
        point.y < rect.y + rect.height + padding
    );
}

export function outsidePin(
    pin: Rectangle,
    work: Rectangle,
    width: number,
    height: number,
): Rectangle | null {
    const right = work.x + work.width,
        bottom = work.y + work.height;
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
        { x, y: pin.y + pin.height + panelGap },
        { x, y: pin.y - height - panelGap },
        { x: pin.x + pin.width + panelGap, y },
        { x: pin.x - width - panelGap, y },
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
    dock?: Rectangle;
    ready: boolean;
    tools: boolean;
    revision: number;
    rendered?: string;
    placement?: PinPanelPlacement;
    toolbar?: { width: number; height: number };
    editing?: boolean;
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
    function containsPointer(id: number, point: Point) {
        const p = panels.get(id);
        if (!p?.tools || !p.dock || !p.win.isVisible()) return false;
        const interactive =
            p.editing || p.state.status ? p.win.getBounds() : p.dock;
        return (
            inside(point, interactive) ||
            (inside(point, p.dock, panelGap) &&
                inside(point, p.anchor, panelGap))
        );
    }
    function close(id: number) {
        const p = panels.get(id);
        if (!p) return;
        panels.delete(id);
        clearTimeout(p.timer);
        p.unwatch();
        if (!p.win.isDestroyed()) p.win.destroy();
        trayStatus("");
    }
    function position(p: Panel, notify = true): PinPanelPlacement | null {
        if (!p.size || (!p.tools && !p.state.status)) return null;
        const work = screen.getDisplayMatching(p.anchor).workArea;
        const base = p.tools && p.toolbar ? p.toolbar : p.size;
        let dock = outsidePin(p.anchor, work, base.width, base.height);
        if (!dock && p.state.hoverOnly && p.tools) {
            dock = {
                x: Math.max(
                    work.x,
                    Math.min(
                        work.x + work.width - base.width,
                        p.anchor.x + p.anchor.width - base.width,
                    ),
                ),
                y: Math.max(
                    work.y,
                    Math.min(work.y + work.height - base.height, p.anchor.y),
                ),
                ...base,
            };
        }
        p.dock = dock ?? undefined;
        if (!dock) {
            p.win.hide();
            if (p.state.status) trayStatus(p.state.status);
            return null;
        }

        // 固定命令栏的屏幕坐标，提示、状态和菜单只向空间较大的一侧扩展。
        const up = dock.y - work.y;
        const down = work.y + work.height - dock.y - dock.height;
        const above = up > down;
        const room = Math.max(up, down);
        const height = Math.min(p.size.height, base.height + room);
        const width = p.size.width;
        const x = Math.round(
            Math.max(
                work.x,
                Math.min(
                    work.x + work.width - width,
                    dock.x + (dock.width - width) / 2,
                ),
            ),
        );
        const zoom = p.win.webContents.getZoomFactor();
        const extraHeight = Math.floor(room / zoom);
        const barShift = (dock.x + (dock.width - width) / 2 - x) / zoom;
        const rect = {
            x,
            y: above ? dock.y + dock.height - height : dock.y,
            width,
            height,
        };
        const placement = {
            above,
            extraHeight,
            barShift,
            height: height / zoom,
        };
        const changed =
            p.placement?.above !== above ||
            p.placement.extraHeight !== extraHeight ||
            p.placement.barShift !== barShift ||
            p.placement.height !== placement.height;
        p.placement = placement;
        const current = p.win.getBounds();
        if (
            current.x !== rect.x ||
            current.y !== rect.y ||
            current.width !== rect.width ||
            current.height !== rect.height
        )
            p.win.setBounds(rect);
        if (notify && changed)
            mainSend(p.win.webContents, "pinPanelPlacement", [placement]);
        if (!p.win.isVisible()) p.win.showInactive();
        return placement;
    }
    function paint(p: Panel) {
        if (!p.ready) return;
        const available = screen.getDisplayMatching(p.anchor).workArea;
        const zoom = p.win.webContents.getZoomFactor();
        const maxWidth = Math.min(available.width / zoom, p.tools ? 510 : 360);
        const maxHeight = available.height / zoom;
        const key = JSON.stringify([
            maxWidth,
            maxHeight,
            p.state.status,
            p.state.closeLabel,
            p.tools,
            p.tools
                ? [
                      p.state.buttons,
                      p.state.language,
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
                maxHeight,
            ]);
        } else position(p);
    }
    mainOn("pinPanelSize", ([id, revision, w, h, editing, toolbar], event) => {
        const p = panels.get(id);
        if (
            !p ||
            event.sender !== p.win.webContents ||
            event.senderFrame !== event.sender.mainFrame ||
            revision !== p.revision
        )
            return null;
        const work = screen.getDisplayMatching(p.anchor).workArea;
        if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0)
            return null;
        const zoom = p.win.webContents.getZoomFactor();
        p.toolbar =
            toolbar &&
            Number.isFinite(toolbar.width) &&
            Number.isFinite(toolbar.height) &&
            toolbar.width > 0 &&
            toolbar.height > 0
                ? {
                      width: Math.min(
                          Math.ceil(toolbar.width * zoom),
                          work.width,
                      ),
                      height: Math.min(
                          Math.ceil(toolbar.height * zoom),
                          work.height,
                      ),
                  }
                : undefined;
        p.editing = editing === true;
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
        return position(p, false);
    });
    function deferHide(p: Panel) {
        clearTimeout(p.timer);
        p.timer = setTimeout(
            () => {
                if (p.win.isDestroyed()) return;
                const mouse = screen.getCursorScreenPoint();
                if (
                    p.state.compact &&
                    (containsPointer(p.state.id, mouse) ||
                        inside(mouse, p.anchor) ||
                        (p.editing && p.win.isFocused()))
                ) {
                    deferHide(p);
                    return;
                }
                if (p.state.hoverOnly || !p.state.status) {
                    p.tools = false;
                    p.win.hide();
                    p.timer = setTimeout(() => close(p.state.id), 20000);
                    return;
                }
                p.tools = false;
                paint(p);
            },
            p.state.hoverOnly ? 180 : 500,
        );
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
            if (!tools && (state.hoverOnly || !state.status)) return;
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
        if (!panel.tools && (state.hoverOnly || !state.status)) {
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
    return { close, containsPointer };
}
