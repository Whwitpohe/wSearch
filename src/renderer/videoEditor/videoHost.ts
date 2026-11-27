import { renderSend, renderSendSync } from "../../../lib/ipc";

export { renderOn, renderSend } from "../../../lib/ipc";

import { typedEntries } from "../../../lib/utils";

const fs = require("node:fs") as typeof import("node:fs");
const { join } = require("node:path") as typeof import("node:path");
const { uIOhook, UiohookKey } =
    require("uiohook-napi") as typeof import("uiohook-napi");
type KeyCode = keyof typeof UiohookKey;
export type InputMark = {
    keydown?: KeyCode;
    keyup?: KeyCode;
    mousedown?: 0 | 1 | 2;
    mouseup?: 0 | 1 | 2;
    wheel?: boolean;
};
export function getFreeMemory() {
    const mem = process.getSystemMemoryInfo();
    const sysFree = (mem.free + mem.swapFree) * 1024;
    // @ts-ignore
    const processFree = performance.memory.jsHeapSizeLimit;
    return Math.min(sysFree, processFree);
}

export function startInput(
    push: (event: InputMark) => void,
    move: (pos: { x: number; y: number }) => void,
) {
    const keyCodeMap = new Map<number, KeyCode>();
    for (const [i, v] of typedEntries(UiohookKey)) {
        keyCodeMap.set(v, String(i) as KeyCode);
    }

    uIOhook.on("keydown", (e) => {
        const k = keyCodeMap.get(e.keycode);
        if (k)
            push({
                keydown: k,
            });
    });

    uIOhook.on("keyup", (e) => {
        const k = keyCodeMap.get(e.keycode);
        if (k)
            push({
                keyup: k,
            });
    });

    const map = { 1: 0, 2: 1, 3: 2 } as const;

    uIOhook.on("mousedown", (e) => {
        push({
            mousedown: map[e.button as 1 | 2 | 3],
        });
    });
    uIOhook.on("mouseup", (e) => {
        push({
            mouseup: map[e.button as 1 | 2 | 3],
        });
    });

    uIOhook.on("wheel", (e) => {
        console.log(e.direction, e.rotation);
        push({ wheel: true });
    });

    uIOhook.on("mousemove", (e) => {
        move({ x: e.x, y: e.y });
        push({});
    });

    uIOhook.start();
    return () => uIOhook.stop();
}

export async function pickExport(type: string) {
    const path = renderSendSync("save_file_path", [
        type,
        type === "mp4" || type === "webm",
    ]);
    if (type === "png" && path) fs.mkdirSync(path, { recursive: true });
    return path;
}
export async function writeExport(
    path: string,
    data: ArrayBuffer | Uint8Array,
    frame?: number,
) {
    await fs.promises.writeFile(
        frame === undefined ? path : join(path, `${frame}.png`),
        data instanceof Uint8Array ? data : new Uint8Array(data),
    );
}
export async function editFrame(blob: Blob) {
    renderSend("edit_pic", [Buffer.from(await blob.arrayBuffer())]);
}
export async function captureStream(sourceId: string, wantSysAudio: boolean) {
    let stream: MediaStream | undefined;
    const videoConstraint = {
        mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId,
        },
    };
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            audio: wantSysAudio
                ? {
                      // @ts-ignore
                      mandatory: {
                          chromeMediaSource: "desktop",
                      },
                  }
                : false,
            // @ts-ignore
            video: videoConstraint,
        });
    } catch (e) {
        console.error(e);
    }
    if (!stream && wantSysAudio) {
        // 系统内录获取失败时回退为纯视频，保证录制可用
        console.warn("超级录屏：获取系统音频失败，回退为无音频");
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: false,
                // @ts-ignore
                video: videoConstraint,
            });
        } catch (e) {
            console.error(e);
        }
    }
    return stream;
}

export function releaseSource(stream: MediaStream) {
    for (const track of stream.getTracks()) track.stop();
}
