import { ele } from "dkh-ui";
import { renderInvoke } from "../../../lib/ipc";
import { screenshotTarget } from "../../../lib/screenshotLanguage";
import store from "../../../lib/store/renderStore";
import { t } from "../../../lib/translate/translate";
import { loadImage, paintOcrLayer, recognizeImage } from "./ocr";
import { paintVisionLayer } from "./translationOverlay";

export async function comparisonImage(
    originalUrl: string,
    translatedUrl: string,
) {
    const [original, translated] = await Promise.all([
        loadImage(originalUrl),
        loadImage(translatedUrl),
    ]);
    const canvas = ele("canvas").attr({
        width: original.naturalWidth + translated.naturalWidth,
        height: Math.max(original.naturalHeight, translated.naturalHeight),
    }).el;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error(t("无法绘制截图"));
    ctx.drawImage(original, 0, 0);
    ctx.drawImage(translated, original.naturalWidth, 0);
    return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
            (blob) =>
                blob ? resolve(blob) : reject(Error(t("无法复制对照图"))),
            "image/png",
        ),
    );
}

export async function translateImage(
    id: number,
    url: string,
    vision: boolean,
    retry: boolean,
    status: (message: string) => void,
    target = screenshotTarget(store),
    recognize = recognizeImage,
) {
    status(t(vision ? "正在翻译..." : "正在OCR识别..."));
    const original = await loadImage(url);
    let layer: HTMLCanvasElement, lines: string[], sourceLines: string[];
    if (vision) {
        const reply = await renderInvoke("translateScreenshotImage", [
            id,
            retry,
            target,
        ]);
        if ("error" in reply) throw Error(reply.error);
        layer = paintVisionLayer(original, reply.regions);
        sourceLines = reply.regions.map((region) => region.source);
        lines = reply.regions.map((region) => region.text);
    } else {
        const paragraphs = await recognize(url);
        sourceLines = paragraphs.map((p) => p.parse.text);
        status(t("正在翻译..."));
        ({ layer, lines } = await paintOcrLayer(original, paragraphs, target));
    }
    const composite = ele("canvas").attr({
        width: layer.width,
        height: layer.height,
    }).el;
    const ctx = composite.getContext("2d");
    if (!ctx) throw Error(t("无法绘制截图"));
    ctx.drawImage(original, 0, 0);
    ctx.drawImage(layer, 0, 0);
    return { layer, composite, lines, sourceLines, target };
}
