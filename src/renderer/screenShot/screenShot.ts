const { ipcRenderer, nativeImage, shell, dialog } =
    require("electron") as typeof import("electron");

import type { MessageBoxSyncOptions, NativeImage } from "electron";
import { renderSendSync } from "../../../lib/ipc";
import { tryxAwait } from "../../../lib/utils";
import { getSessionBusPath } from "../../../lib/wayland";
import { waylandShotInit } from "./waylandShot";

type WindowData = {
    /** node-screenshots 的原始矩形 */
    rect: { x: number; y: number; w: number; h: number };
    /** 虚拟桌面 DIP 矩形 */
    dipRect: { x: number; y: number; w: number; h: number };
    id: number;
    pid: number;
    appName: string;
    title: string;
    z: number;
    minimized: boolean;
    displayId: number | null;
};

type ReturnData = {
    bounds: { x: number; y: number; width: number; height: number };
    size: { width: number; height: number };
    scaleFactor: number;
    id: number;
    capture: () => Promise<{
        toImageData: () => ImageData;
        toNativeImage: () => Electron.NativeImage;
    }>;
};

function d(op: MessageBoxSyncOptions) {
    if (ipcRenderer) {
        return renderSendSync("dialogMessage", [op]);
    }
    return dialog.showMessageBoxSync(op);
}

let _t: (t: string) => string = (t) => t;

let Screenshots: typeof import("node-screenshots");

function getCenterDistance(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
): number {
    const centerA = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
    const centerB = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    return Math.sqrt(
        (centerA.x - centerB.x) ** 2 + (centerA.y - centerB.y) ** 2,
    );
}

function displayOfMonitor(
    monitor: ReturnType<
        ReturnType<
            typeof import("node-screenshots").Window.all
        >[number]["currentMonitor"]
    >,
    displays: Electron.Display[],
    winRect: { x: number; y: number; w: number; h: number },
): { display: Electron.Display; f: number } | null {
    let best: { display: Electron.Display; f: number } | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    const mw = monitor.width();
    const mh = monitor.height();
    if (!(mw > 0) || !(mh > 0)) return null;
    const monitorAspect = mw / mh;
    for (const display of displays) {
        const f = mw / display.bounds.width;
        if (!Number.isFinite(f) || f <= 0) continue;
        const cand = {
            x: display.bounds.x + (winRect.x - monitor.x()) / f,
            y: display.bounds.y + (winRect.y - monitor.y()) / f,
            w: winRect.w / f,
            h: winRect.h / f,
        };
        const iw =
            Math.min(cand.x + cand.w, display.bounds.x + display.bounds.width) -
            Math.max(cand.x, display.bounds.x);
        const ih =
            Math.min(
                cand.y + cand.h,
                display.bounds.y + display.bounds.height,
            ) - Math.max(cand.y, display.bounds.y);
        const inter = iw > 0 && ih > 0 ? iw * ih : 0;
        // 监视器 id 能对上时直接采用；否则用换算后的窗口相交面积和宽高比
        const aspectDiff = Math.abs(
            monitorAspect - display.bounds.width / display.bounds.height,
        );
        const score =
            (monitor.id() === display.id ? 1e15 : 0) +
            inter -
            aspectDiff * 1e6 -
            Math.abs(Math.log(f));
        if (score > bestScore) {
            bestScore = score;
            best = { display, f };
        }
    }
    return best;
}

export function getWindowInfos(
    displays?: Electron.Display[],
    list?: ReturnType<typeof Screenshots.Window.all>,
): WindowData[] {
    if (!list) {
        try {
            if (!Screenshots) Screenshots = require("node-screenshots");
            list = Screenshots.Window.all();
        } catch {
            return [];
        }
    }
    return list.map((win) => {
        const rect = {
            x: win.x(),
            y: win.y(),
            w: win.width(),
            h: win.height(),
        };
        let dipRect = rect;
        let displayId: number | null = null;
        if (displays?.length) {
            try {
                const monitor = win.currentMonitor();
                const matched = displayOfMonitor(monitor, displays, rect);
                if (matched) {
                    const { display, f } = matched;
                    dipRect = {
                        x: display.bounds.x + (rect.x - monitor.x()) / f,
                        y: display.bounds.y + (rect.y - monitor.y()) / f,
                        w: rect.w / f,
                        h: rect.h / f,
                    };
                    displayId = display.id;
                }
            } catch {
                dipRect = rect;
            }
        }
        return {
            rect,
            dipRect,
            id: win.id(),
            pid: win.pid(),
            appName: win.appName(),
            title: win.title(),
            z: win.z(),
            minimized: win.isMinimized(),
            displayId,
        };
    });
}

function init(
    command: { c: string; path?: string },
    feedback?: (m: string) => string,
    t?: (t: string) => string,
    useXDGDesktopPortal = false,
) {
    if (t) _t = t;
    if (!command.c)
        try {
            Screenshots = require("node-screenshots");
        } catch (error) {
            if (process.platform === "win32") {
                const id = d({
                    message: `${_t("截屏需要VS运行库才能正常使用")}\n${_t("是否需要从微软官网（https://aka.ms/vs）下载？")}`,
                    buttons: [_t("取消"), _t("下载")],
                    defaultId: 1,
                } as MessageBoxSyncOptions);
                if (id === 1) {
                    shell.openExternal(
                        `https://aka.ms/vs/17/release/vc_redist.${process.arch}.exe`,
                    );
                }
            } else {
                const me =
                    error && typeof error === "object" && "message" in error
                        ? (error.message as string)
                        : String(error);
                let m = `${_t("截屏库加载时遇到错误：")}\n${me}`;
                if (me.includes("GLIBC_")) {
                    m = `${_t("需要glibc")}${me.match(/GLIBC_([0-9.]+)/)?.[1]}\n${_t("请尝试更新glibc版本")}\n${_t("或者设置外部截屏器")}`;
                }
                const id = d({
                    message: m,
                    buttons: [_t("取消"), _t("反馈")],
                    defaultId: 1,
                });
                const f =
                    feedback ??
                    ((m: string) =>
                        renderSendSync("feedbackBug", [
                            {
                                title: "截屏库调用错误",
                                main: "截屏库调用错误",
                                steps: "截屏",
                                more: m,
                            },
                        ]));

                if (id === 1) {
                    shell.openExternal(f(me));
                }
            }
        }
    return (
        displays?: Electron.Display[],
        imgBuffer?: Buffer,
        includeWindowRects = false,
        excludeWindowId?: number,
    ) =>
        displayToScreen(
            command,
            useXDGDesktopPortal,
            includeWindowRects,
            excludeWindowId,
            displays,
            imgBuffer,
        );
}

async function displayToScreen(
    command: { c: string; path?: string },
    useXDGDesktopPortal: boolean,
    includeWindowRects: boolean,
    excludeWindowId: number | undefined,
    displays?: Electron.Display[],
    imgBuffer?: Buffer,
): Promise<{
    screen: ReturnData[];
    windowRects: WindowData["rect"][];
    type: "normal" | "img" | "command";
}> {
    let buffer = imgBuffer;

    if (!buffer && command.c) {
        const fs = require("node:fs") as typeof import("node:fs");
        const { execSync } =
            require("node:child_process") as typeof import("node:child_process");
        const x: ReturnData = {
            bounds: displays?.[0]?.bounds ?? {
                x: 0,
                y: 0,
                width: 0,
                height: 0,
            },
            size: displays?.[0]?.bounds ?? { width: 0, height: 0 },
            scaleFactor: displays?.[0]?.scaleFactor ?? 1,
            id: displays?.[0]?.id ?? -1,
            capture: async () => {
                try {
                    const path = command.path || "/dev/shm/esearch-img.png";
                    fs.rm(path, () => {});
                    execSync(command.c, {});
                    buffer = fs.readFileSync(path);
                    fs.rm(path, () => {});
                } catch (error) {
                    d({
                        message: _t("命令运行出错，无法读取截屏，请检查设置"),
                        buttons: [_t("确定")],
                    } as MessageBoxSyncOptions);

                    return {
                        toImageData: () => emptyImageData(),
                        toNativeImage: () => nativeImage.createEmpty(),
                    };
                }

                const data = toCanvas(buffer);
                const image = data.image;
                const s = image.getSize();
                x.bounds = { x: 0, y: 0, width: s.width, height: s.height };
                x.size = { width: s.width, height: s.height };
                x.scaleFactor = 1;
                return {
                    toImageData: () => data.data,
                    toNativeImage: () => data.image,
                };
            },
        };
        return { screen: [x], windowRects: [], type: "command" };
    }
    if (buffer) {
        const data = toCanvas(buffer);
        const image = data.image;
        const s = image.getSize();
        return {
            screen: [
                {
                    bounds: { x: 0, y: 0, width: s.width, height: s.height },
                    size: { width: s.width, height: s.height },
                    scaleFactor: 1,
                    id: -1,
                    capture: async () => ({
                        toImageData: () => data.data,
                        toNativeImage: () => data.image,
                    }),
                },
            ],
            windowRects: [],
            type: "img",
        };
    }

    if (process.platform === "linux" && useXDGDesktopPortal) {
        const fs =
            require("node:fs/promises") as typeof import("node:fs/promises");
        const c = await waylandShotInit(
            ipcRenderer
                ? renderSendSync("dbusSessionBusPath", [])
                : getSessionBusPath(),
        );
        const allScreens: ReturnData[] = [];
        const empty = {
            toImageData: () => emptyImageData(),
            toNativeImage: () => nativeImage.createEmpty(),
        };
        if (displays)
            for (const d of displays) {
                const x: ReturnData = {
                    bounds: d.bounds,
                    size: d.size,
                    scaleFactor: d.scaleFactor,
                    id: d.id,
                    capture: async () => {
                        const imgPath = await c.capture();
                        if (!imgPath) return empty;

                        const [imgBuffer] = await tryxAwait(() =>
                            fs.readFile(imgPath),
                        );
                        if (imgBuffer === null) return empty;
                        const data = toCanvas(imgBuffer);
                        const image = data.image;
                        fs.rm(imgPath);
                        // 在kde和gnome上，其他桌面环境也如此，获取的是多屏拼接图像
                        // 存在不同缩放时，会保证任何屏幕物理像素都被截取，缩放后几何关系表留
                        // 即选取缩放数值最大的作为基准，其物理像素不能舍去，其他屏幕放大（得到更多像素）
                        // 存在放大后缩小的模糊问题
                        const globalScale = Math.max(
                            ...displays.map((i) => i.scaleFactor),
                        );
                        const pix = {
                            x: d.bounds.x * globalScale,
                            y: d.bounds.y * globalScale,
                            height: d.bounds.height * globalScale,
                            width: d.bounds.width * globalScale,
                        };
                        const pixScreen = image.crop(pix);
                        const phy = pixScreen.resize({
                            width: d.bounds.width * d.scaleFactor,
                            height: d.bounds.height * d.scaleFactor,
                            quality: "best",
                        });

                        return {
                            toImageData: () => nImage2Imagedata(phy).data,
                            toNativeImage: () => {
                                return pixScreen;
                            },
                        };
                    },
                };
                allScreens.push(x);
            }
        else {
            allScreens.push({
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                size: { width: 0, height: 0 },
                scaleFactor: 1,
                id: -1,
                capture: async () => empty,
            });
        }
        return { screen: allScreens, type: "normal", windowRects: [] };
    }

    const screens = Screenshots.Monitor.all();
    const windowRects: WindowData["rect"][] = [];
    if (includeWindowRects) {
        try {
            for (const win of Screenshots.Window.all()) {
                if (
                    excludeWindowId !== undefined &&
                    win.id() === excludeWindowId
                )
                    continue;
                windowRects.push({
                    x: win.x(),
                    y: win.y(),
                    w: win.width(),
                    h: win.height(),
                });
            }
        } catch (error) {
            console.error(error);
        }
    }

    const allScreens: ReturnData[] = [];

    // 使用displays作为参考，优化匹配方式

    if (screens.length === 0) {
        allScreens.push({
            bounds: { x: 0, y: 0, width: 0, height: 0 },
            size: { width: 0, height: 0 },
            scaleFactor: 1,
            id: -1,
            capture: async () => ({
                toImageData: () => emptyImageData(),
                toNativeImage: () => nativeImage.createEmpty(),
            }),
        });
    } else if (
        (displays?.length ?? 0) > 0 &&
        displays?.length === screens.length
    ) {
        // 以displays为基准进行匹配

        // 先尝试id匹配
        const byId = new Map(screens.map((monitor) => [monitor.id(), monitor]));
        const displayIds = new Set(displays.map((display) => display.id));
        const unmatched = screens.filter(
            (monitor) => !displayIds.has(monitor.id()),
        );
        for (const display of displays) {
            const matched =
                byId.get(display.id) ??
                takeNearestMonitor(unmatched, display.bounds);
            allScreens.push({
                bounds: display.bounds,
                size: display.size,
                scaleFactor: display.scaleFactor,
                id: display.id,
                capture: () => captureMonitor(matched),
            });
        }
    } else {
        // 如果没有displays，使用screens（但信息可能不正确）
        for (const screen of screens) {
            const x: ReturnData = {
                bounds: {
                    x: screen.x(),
                    y: screen.y(),
                    width: screen.width(),
                    height: screen.height(),
                },
                size: { width: screen.width(), height: screen.height() },
                scaleFactor: screen.scaleFactor(),
                id: screen.id(),
                capture: () => captureMonitor(screen),
            };
            allScreens.push(x);
        }
    }

    return {
        screen: allScreens,
        windowRects,
        type: "normal",
    };
}

type Monitor = ReturnType<typeof Screenshots.Monitor.all>[number];

function takeNearestMonitor(monitors: Monitor[], bounds: Electron.Rectangle) {
    let nearest = 0;
    let minDistance = Number.POSITIVE_INFINITY;
    for (const [index, monitor] of monitors.entries()) {
        const distance = getCenterDistance(bounds, {
            x: monitor.x(),
            y: monitor.y(),
            width: monitor.width(),
            height: monitor.height(),
        });
        if (distance < minDistance) {
            nearest = index;
            minDistance = distance;
        }
    }
    return monitors.splice(nearest, 1)[0];
}

async function captureMonitor(monitor: Monitor) {
    const data = await monitor.captureImage();
    return {
        toImageData: () => {
            const pixels = data.toRawSync(true);
            return new ImageData(
                new Uint8ClampedArray(
                    pixels.buffer,
                    pixels.byteOffset,
                    pixels.byteLength,
                ),
                data.width,
                data.height,
            );
        },
        toNativeImage: () => nativeImage.createFromBuffer(data.toPngSync(true)),
    };
}

function emptyImageData() {
    return {
        width: 0,
        height: 0,
        data: new Uint8ClampedArray(0),
        colorSpace: "srgb",
    } as const;
}

function toCanvas(img: Buffer) {
    const image = nativeImage.createFromBuffer(img);
    return nImage2Imagedata(image);
}

function nImage2Imagedata(image: NativeImage) {
    const { width: w, height: h } = image.getSize();

    if (typeof ImageData === "undefined")
        return { data: emptyImageData(), image };
    const bitmap = image.toBitmap();
    const x = new Uint8ClampedArray(bitmap.length);
    for (let i = 0; i < bitmap.length; i += 4) {
        // 交换R和B通道的值，同时复制G和Alpha通道的值
        x[i] = bitmap[i + 2];
        x[i + 1] = bitmap[i + 1];
        x[i + 2] = bitmap[i];
        x[i + 3] = bitmap[i + 3];
    }
    const d = new ImageData(x, w, h);
    return { data: d, image };
}

export default init;
