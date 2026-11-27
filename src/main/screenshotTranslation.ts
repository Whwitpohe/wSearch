import { nativeImage, net } from "electron";
import { mainHandle } from "../../lib/ipc";
import { screenshotTarget } from "../../lib/screenshotLanguage";
import type Store from "../../lib/store/store";
import { t } from "../../lib/translate/translate";
import { selectedVisionModel } from "../../lib/visionModel";
import { translateVision } from "../../lib/visionTranslation";
import type {
    ScreenshotRegion,
    ScreenshotTranslation,
    setting,
} from "../ShareTypes";

type Model = setting["AI"]["在线模型"][number];
type Capture = {
    model: Model;
    url: string;
    from: string;
    controller: AbortController;
    requests: Map<
        string,
        { promise: Promise<ScreenshotTranslation>; failed: boolean }
    >;
};

function prepareImage(url: string) {
    const screenshot = nativeImage.createFromDataURL(url);
    if (screenshot.isEmpty()) throw Error(t("截图为空，请重新截图"));
    const original = screenshot.getSize();
    // Stay within the standard vision tier to keep returned pixel coordinates aligned.
    let scale = Math.min(1, 1568 / Math.max(original.width, original.height));
    let width: number, height: number;
    do {
        width = Math.max(1, Math.floor(original.width * scale));
        height = Math.max(1, Math.floor(original.height * scale));
        scale *= 0.99;
    } while (Math.ceil(width / 28) * Math.ceil(height / 28) > 1568);
    const view =
        width === original.width && height === original.height
            ? screenshot
            : screenshot.resize({ width, height, quality: "best" });
    let buffer = view.toPNG();
    let media_type = "image/png";
    if (buffer.length > 4500000) {
        buffer = view.toJPEG(90);
        media_type = "image/jpeg";
    }
    return {
        width,
        height,
        source: { type: "base64", media_type, data: buffer.toString("base64") },
    };
}

async function translateScreenshot(
    capture: Capture,
    target: string,
    signal: AbortSignal,
): Promise<ScreenshotRegion[]> {
    return translateVision(
        capture.model,
        capture.from,
        prepareImage(capture.url),
        target,
        signal,
        (url, init) => net.fetch(url.toString(), init),
        t,
    );
}

export function registerScreenshotTranslation(
    store: Store,
    allowSender: (id: number, event: Electron.IpcMainInvokeEvent) => boolean,
) {
    const captures = new Map<number, Capture>();
    mainHandle(
        "translateScreenshotImage",
        async ([id, retry, requestedTarget], event) => {
            const capture = captures.get(id);
            if (!capture || !allowSender(id, event))
                return { error: t("截图已关闭，请重新截图") };
            const target =
                typeof requestedTarget === "string" && requestedTarget
                    ? requestedTarget
                    : screenshotTarget(store);
            const key = target.toLowerCase();
            const prior = capture.requests.get(key);
            if (prior && !(retry && prior.failed)) return prior.promise;
            const signal = AbortSignal.any([
                capture.controller.signal,
                AbortSignal.timeout(120000),
            ]);
            const request = {
                failed: false,
                promise: translateScreenshot(capture, target, signal)
                    .then((regions) => ({ regions }))
                    .catch((error: unknown) => {
                        request.failed = true;
                        return {
                            error:
                                error instanceof Error
                                    ? error.message
                                    : t("翻译失败"),
                        };
                    }),
            };
            capture.requests.set(key, request);
            return request.promise;
        },
    );
    return {
        register(id: number, url: string) {
            const model = selectedVisionModel(
                store.get("OCR.类型"),
                store.get("AI.在线模型"),
            );
            if (!model) return false;
            captures.set(id, {
                model,
                url,
                requests: new Map(),
                from: store.get("屏幕翻译.语言.from"),
                controller: new AbortController(),
            });
            return true;
        },
        close(id: number) {
            captures.get(id)?.controller.abort();
            captures.delete(id);
        },
    };
}
