import { ele } from "dkh-ui";
import { t } from "../../../lib/translate/translate";
import type { ScreenshotRegion } from "../../ShareTypes";

function backgroundAt(
    pixels: ImageData,
    x: number,
    y: number,
    width: number,
    height: number,
) {
    // Sample the perimeter and take the dominant color cluster to avoid glyph strokes.
    const bins = new Map<number, number[]>();
    function sample(px: number, py: number) {
        const col = Math.max(0, Math.min(pixels.width - 1, Math.round(px)));
        const row = Math.max(0, Math.min(pixels.height - 1, Math.round(py)));
        const i = (row * pixels.width + col) * 4;
        const [r, g, b] = pixels.data.subarray(i, i + 3);
        const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        const bin = bins.get(key) || [0, 0, 0, 0];
        bin[0]++;
        bin[1] += r;
        bin[2] += g;
        bin[3] += b;
        bins.set(key, bin);
    }
    for (let i = 0; i < 16; i++) {
        const part = (i + 0.5) / 16;
        sample(x + width * part, y);
        sample(x + width * part, y + height - 1);
        sample(x, y + height * part);
        sample(x + width - 1, y + height * part);
    }
    const [n, r, g, b] = Array.from(bins.values()).sort(
        (a, b) => b[0] - a[0],
    )[0];
    return [r, g, b].map((value) => Math.round(value / n));
}

const words = new Intl.Segmenter(undefined, { granularity: "word" });
const glyphs = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function wrap(ctx: CanvasRenderingContext2D, text: string, width: number) {
    const lines = [];
    for (const paragraph of text.split(/\r?\n/)) {
        let line = "";
        for (const { segment } of words.segment(paragraph)) {
            if (line && ctx.measureText(line + segment).width > width) {
                lines.push(line.trimEnd());
                line = "";
            }
            const token = line ? segment : segment.trimStart();
            if (ctx.measureText(token).width <= width) {
                line += token;
                continue;
            }
            for (const { segment: glyph } of glyphs.segment(token)) {
                if (line && ctx.measureText(line + glyph).width > width) {
                    lines.push(line);
                    line = "";
                }
                line += glyph;
            }
        }
        if (line || !paragraph) lines.push(line.trimEnd());
    }
    return lines;
}

function paintRegion(
    ctx: CanvasRenderingContext2D,
    source: ImageData,
    region: ScreenshotRegion,
) {
    const [x1, y1, x2, y2] = region.box.map((n, i) =>
        Math.round(n * (i % 2 ? source.height : source.width)),
    );
    const w = x2 - x1,
        h = y2 - y1;
    if (w < 1 || h < 1) return;
    const pad = Math.min(2, w * 0.035);
    const available = Math.max(1, w - 2 * pad);
    const bg = backgroundAt(source, x1, y1, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x1, y1, w, h);
    ctx.clip();
    ctx.fillStyle = `rgb(${bg.join(",")})`;
    ctx.fillRect(x1, y1, w, h);
    const linear = bg.map((c) =>
        c / 255 <= 0.04045
            ? c / 255 / 12.92
            : ((c / 255 + 0.055) / 1.055) ** 2.4,
    );
    ctx.fillStyle =
        0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2] > 0.179
            ? "#111"
            : "#fff";
    const font = (size: number) =>
        `${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
    let lo = 1,
        hi = Math.max(1, Math.floor(h / 1.08)),
        size = 1;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        ctx.font = font(mid);
        if (wrap(ctx, region.text, available).length * mid * 1.08 <= h) {
            size = mid;
            lo = mid + 1;
        } else hi = mid - 1;
    }
    ctx.font = font(size);
    ctx.textBaseline = "middle";
    const lines = wrap(ctx, region.text, available);
    const lineHeight = size * 1.08;
    const top = y1 + (h - lines.length * lineHeight) / 2;
    for (const [i, line] of lines.entries()) {
        ctx.fillText(line, x1 + pad, top + (i + 0.5) * lineHeight, available);
    }
    ctx.restore();
}

export function paintScreenshotTranslation(
    image: HTMLImageElement,
    regions: ScreenshotRegion[],
) {
    const canvas = ele("canvas").el;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !canvas.width || !canvas.height) throw Error(t("无法绘制截图"));
    ctx.drawImage(image, 0, 0);
    if (regions.length) {
        const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
        for (const region of regions) paintRegion(ctx, original, region);
    }
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    return canvas;
}
