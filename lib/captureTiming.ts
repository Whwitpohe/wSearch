export type CaptureEntry = "shortcut" | "tray" | "command" | "capture";

type CaptureStage =
    | "entry"
    | "waitStart"
    | "windowReady"
    | "ipcSend"
    | "rendererReceived"
    | "enumerated"
    | "grabStart"
    | "grabEnd"
    | "pixelsReady"
    | "canvasReady"
    | "showRequested"
    | "mainShow"
    | "shown";

export type CaptureTiming = {
    id: number;
    source: CaptureEntry;
    windowState?: "new" | "loading" | "ready";
    stages: Partial<Record<CaptureStage, number>>;
};

// 主进程和截屏渲染进程共用操作系统的单调时钟，记录值的单位是毫秒。
export function markCapture(
    trace: CaptureTiming | undefined,
    stage: CaptureStage,
) {
    if (trace) trace.stages[stage] = Number(process.hrtime.bigint()) / 1e6;
}
