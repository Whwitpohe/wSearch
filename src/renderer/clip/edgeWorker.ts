import { type Border, detectBorders } from "edge_det";
import type { setting } from "../../ShareTypes";
import { coarseBorders } from "./coarseBorders";

export type EdgeWorkerMessage = {
    id: number;
    algorithm: setting["框选"]["自动框选"]["算法"];
    input: ImageBitmap | ImageData["data"]["buffer"];
    width: number;
    height: number;
    sourceWidth: number;
    sourceHeight: number;
    tile?: Border;
    lowThreshold: number;
    highThreshold: number;
};

export type EdgeWorkerResult = {
    id: number;
    borders: Border[];
    tile?: Border;
};

const ctx = self as unknown as {
    onmessage: ((e: MessageEvent<EdgeWorkerMessage>) => void) | null;
    postMessage: (m: EdgeWorkerResult) => void;
};

/** In a flat UI patch, a little extra contrast reveals faint button borders. */
function flatBackground(pixels: Uint8Array, width: number, height: number) {
    const counts = new Uint16Array(4096);
    let samples = 0,
        best = 0,
        at = 0;
    for (let y = 0; y < height; y += 4) {
        for (let x = 0; x < width; x += 4) {
            const i = (y * width + x) * 4;
            const bin =
                ((pixels[i] >> 4) << 8) |
                ((pixels[i + 1] >> 4) << 4) |
                (pixels[i + 2] >> 4);
            samples++;
            if (++counts[bin] > best) {
                best = counts[bin];
                at = i;
            }
        }
    }
    return best >= samples / 2 ? pixels.slice(at, at + 3) : undefined;
}

function readThumbnail(bitmap: ImageBitmap) {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    try {
        const context = canvas.getContext("2d", { willReadFrequently: true })!;
        context.drawImage(bitmap, 0, 0);
        return new Uint8Array(
            context.getImageData(0, 0, canvas.width, canvas.height).data.buffer,
        );
    } finally {
        bitmap.close();
        canvas.width = canvas.height = 1;
    }
}

ctx.onmessage = (e) => {
    const {
        id,
        algorithm,
        input,
        width,
        height,
        sourceWidth,
        sourceHeight,
        tile,
        lowThreshold,
        highThreshold,
    } = e.data;
    const pixels =
        input instanceof ImageBitmap
            ? readThumbnail(input)
            : new Uint8Array(input);
    const options = {
        lowThreshold,
        highThreshold,
        minArea: 3,
    };
    const found =
        tile || algorithm === "classic"
            ? detectBorders(pixels, width, height, options)
            : coarseBorders(pixels, width, height, lowThreshold, highThreshold);
    const background = tile && flatBackground(pixels, width, height);
    if (background) {
        // This buffer belongs to the worker; the frozen screenshot is untouched.
        const clamped = new Uint8ClampedArray(pixels.buffer);
        for (let i = 0; i < pixels.length; i += 4)
            for (let c = 0; c < 3; c++)
                clamped[i + c] =
                    background[c] + 1.5 * (pixels[i + c] - background[c]);
        const faint = detectBorders(pixels, width, height, options);
        const small = found.filter((r) => r.w <= 76 && r.h <= 76);
        for (const r of faint) {
            if (r.w < 6 || r.h < 6 || r.w > 72 || r.h > 72) continue;
            if (
                !small.some(
                    (s) =>
                        Math.abs(r.x - s.x) <= 2 &&
                        Math.abs(r.y - s.y) <= 2 &&
                        Math.abs(r.x + r.w - s.x - s.w) <= 2 &&
                        Math.abs(r.y + r.h - s.y - s.h) <= 2,
                )
            )
                found.push(r);
        }
    }
    const borders: Border[] = [];
    const area = tile ?? { x: 0, y: 0, w: sourceWidth, h: sourceHeight };
    for (const r of found) {
        // A local scan can cut a larger control in half. Only keep complete contours.
        if (
            tile &&
            ((tile.x > 0 && r.x <= 1) ||
                (tile.y > 0 && r.y <= 1) ||
                (tile.x + width < sourceWidth && r.x + r.w >= width - 1) ||
                (tile.y + height < sourceHeight && r.y + r.h >= height - 1))
        )
            continue;
        const x = Math.max(0, Math.round((r.x * area.w) / width));
        const y = Math.max(0, Math.round((r.y * area.h) / height));
        const right = Math.min(
            area.w,
            Math.round(((r.x + r.w) * area.w) / width),
        );
        const bottom = Math.min(
            area.h,
            Math.round(((r.y + r.h) * area.h) / height),
        );
        if (right > x && bottom > y)
            borders.push({
                x: area.x + x,
                y: area.y + y,
                w: right - x,
                h: bottom - y,
            });
    }
    ctx.postMessage({ id, borders, tile });
};
