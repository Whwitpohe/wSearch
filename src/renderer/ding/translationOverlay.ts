import { ele } from "dkh-ui";
import { t } from "../../../lib/translate/translate";
import type { ScreenshotRegion } from "../../ShareTypes";

import {
    type Accent,
    enclosingBox,
    foreground,
    inkLines,
    sameBackground,
    type TextBox,
    trailingAccent,
} from "./translationInk";

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
    const lines: string[] = [];
    for (const paragraph of text.split(/\r?\n/)) {
        let line = "";
        for (const { segment } of words.segment(paragraph.trim())) {
            if (!segment.trim()) {
                line += segment;
                continue;
            }
            if (ctx.measureText(line + segment).width <= width) {
                line += segment;
                continue;
            }
            if (line.trimEnd()) lines.push(line.trimEnd());
            line = "";
            if (ctx.measureText(segment).width <= width) {
                line = segment;
                continue;
            }
            for (const { segment: glyph } of glyphs.segment(segment)) {
                if (line && ctx.measureText(line + glyph).width > width) {
                    lines.push(line);
                    line = "";
                }
                line += glyph;
            }
        }
        lines.push(line.trimEnd());
    }
    return lines;
}

function translationFont(size: number) {
    return `${size}px "Segoe UI", "Microsoft YaHei", sans-serif`;
}

function measure(
    ctx: CanvasRenderingContext2D,
    text: string,
    width: number,
    size: number,
    leading: number,
) {
    ctx.font = translationFont(size);
    const lines = wrap(ctx, text, width);
    const metrics = lines.map((line) => ctx.measureText(line));
    const ascent = Math.max(
        1,
        ...metrics.map((m) => m.actualBoundingBoxAscent),
    );
    const descent = Math.max(
        0,
        ...metrics.map((m) => m.actualBoundingBoxDescent),
    );
    const step = Math.max(
        Math.round(size * leading),
        ascent + descent + Math.max(2, Math.round(size * 0.15)),
    );
    return {
        lines,
        size,
        ascent,
        step,
        height: ascent + descent + (lines.length - 1) * step,
        width: Math.max(0, ...metrics.map((m) => m.width)),
    };
}

function roomToRight(
    pixels: ImageData,
    box: TextBox,
    obstacles: TextBox[],
    limit: number,
    bg: number[],
) {
    let end = Math.min(pixels.width, limit);
    for (const b of obstacles) {
        if (
            b !== box &&
            b.bottom > box.top &&
            b.top < box.bottom &&
            b.right > box.right
        )
            end = Math.min(end, b.left - 2);
    }
    for (let x = box.right; x < end; x++) {
        for (let y = box.top; y < box.bottom; y++) {
            if (!sameBackground(pixels, x, y, bg, 20))
                return Math.max(box.right, x - 1);
        }
    }
    return Math.max(box.right, end);
}

function roomVertically(
    pixels: ImageData,
    box: TextBox,
    right: number,
    obstacles: TextBox[],
    extra: number,
    margin: number,
    bg: number[],
) {
    let top = Math.max(0, box.top - extra),
        bottom = Math.min(pixels.height, box.bottom + extra);
    const gutter = (gap: number) =>
        Math.min(margin, Math.max(2, Math.floor(gap * 0.45)));
    for (const b of obstacles) {
        if (b === box || b.left >= right || b.right <= box.left) continue;
        if (b.top < box.top)
            top = Math.max(
                top,
                Math.min(box.top, b.bottom + gutter(box.top - b.bottom)),
            );
        if (b.bottom > box.bottom)
            bottom = Math.min(
                bottom,
                Math.max(box.bottom, b.top - gutter(b.top - box.bottom)),
            );
    }
    function clearRow(y: number) {
        for (let x = box.left; x < right; x++) {
            if (!sameBackground(pixels, x, y, bg, 20)) return false;
        }
        return true;
    }
    let end = box.bottom;
    while (end < bottom && clearRow(end)) end++;
    let start = box.top;
    if (end - box.bottom < extra) {
        while (start > top && clearRow(start - 1)) start--;
    }
    return { top: start, bottom: end };
}

export function drawTranslation(
    ctx: CanvasRenderingContext2D,
    pixels: ImageData,
    box: TextBox,
    obstacles: TextBox[],
    text: string,
    bg: number[],
    preferred: number,
    accent?: Accent,
    columnRight = pixels.width,
) {
    const cjk = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    text = text
        .trim()
        .replace(
            /(\S)[ \t]*\r?\n(?![-*•]\s|\d+[.)]\s)(?=(\S))/gu,
            (_, last: string, next: string) =>
                cjk.test(last) && cjk.test(next) ? last : `${last} `,
        );
    const height = box.bottom - box.top;
    const compact =
        height <= preferred * 1.6 &&
        obstacles.some(
            (other) =>
                other !== box &&
                Math.abs(other.left - box.left) < preferred / 2 &&
                ((other.top >= box.bottom &&
                    other.top - box.bottom < preferred) ||
                    (other.bottom <= box.top &&
                        box.top - other.bottom < preferred)),
        );
    const fitAt = (width: number, size: number) =>
        measure(ctx, text, width, size, compact ? 1.15 : 1.38);
    const pad = Math.min(1, (box.right - box.left) / 8);
    const widthAt = (right: number) => Math.max(1, right - box.left - 2 * pad);
    ctx.textBaseline = "alphabetic";
    let best = fitAt(widthAt(box.right), preferred);
    let area = { ...box };
    if (best.height > height || best.width > widthAt(box.right)) {
        const longest = Math.max(
            ...text.split(/\r?\n/).map((line) => ctx.measureText(line).width),
        );
        const end = roomToRight(
            pixels,
            box,
            obstacles,
            Math.min(columnRight, Math.ceil(box.left + longest + 2 * pad)),
            bg,
        );
        const widths = new Set([end, box.right]);
        // Keep short status labels on one baseline alongside their icons when a small size adjustment fits.
        const single = Math.min(
            preferred,
            Math.floor((preferred * widthAt(end)) / Math.max(1, longest)),
        );
        if (
            text.length <= 32 &&
            !text.includes("\n") &&
            height <= preferred * 1.65 &&
            single >= preferred * 0.78
        ) {
            const label = fitAt(widthAt(end), single);
            if (label.lines.length === 1 && label.height <= height) {
                best = label;
                area.right = end;
                widths.clear();
            }
        }
        let bestSize = 0;
        // A wider line can hit a neighboring control that a narrower column clears vertically.
        for (const right of widths) {
            const width = widthAt(right);
            const full = fitAt(width, preferred);
            const space = roomVertically(
                pixels,
                box,
                right,
                obstacles,
                Math.max(0, Math.ceil(full.height - height)),
                compact ? 2 : Math.max(4, Math.round(preferred * 0.65)),
                bg,
            );
            const fits = (layout: typeof full) =>
                layout.height <= space.bottom - space.top &&
                layout.width <= width;
            if (fits(full)) {
                best = full;
                area = { left: box.left, right, ...space };
                break;
            }
            let lo = Math.max(1, bestSize + 1),
                hi = Math.max(1, preferred - 1);
            while (lo <= hi) {
                const mid = Math.floor((lo + hi) / 2);
                const layout = fitAt(width, mid);
                if (fits(layout) || mid === 1) {
                    best = layout;
                    bestSize = mid;
                    area = { left: box.left, right, ...space };
                    lo = mid + 1;
                } else hi = mid - 1;
            }
        }
    }
    const extra = best.height - height;
    const above = box.top - area.top;
    const below = area.bottom - box.bottom;
    const anchor =
        extra > 0 && below < extra
            ? box.top - Math.min(above, Math.ceil(extra - below / 2))
            : box.top + Math.max(0, -extra / 2);
    const y = Math.max(area.top, Math.min(area.bottom - best.height, anchor));
    ctx.save();
    ctx.beginPath();
    ctx.rect(
        area.left,
        area.top,
        area.right - area.left,
        area.bottom - area.top,
    );
    ctx.clip();
    ctx.font = translationFont(best.size);
    const normal = ctx.fillStyle;
    const accentStart = accent ? text.lastIndexOf(accent.text) : -1;
    let cursor = 0;
    for (const [i, line] of best.lines.entries()) {
        const pos = text.indexOf(line, cursor);
        const x = box.left + pad,
            baseline = y + best.ascent + i * best.step;
        const split =
            accent && accentStart >= 0
                ? Math.max(0, accentStart - pos)
                : line.length;
        ctx.fillStyle = normal;
        if (split >= line.length)
            ctx.fillText(line, x, baseline, widthAt(area.right));
        else {
            const prefix = line.slice(0, split);
            if (prefix) ctx.fillText(prefix, x, baseline);
            ctx.fillStyle = accent!.color;
            ctx.fillText(
                line.slice(split),
                x + ctx.measureText(prefix).width,
                baseline,
            );
        }
        cursor = pos + line.length;
    }
    ctx.restore();
    if (
        best.width + 2 * pad > box.right - box.left ||
        y < box.top ||
        y + best.height > box.bottom
    ) {
        obstacles.push({
            left: box.left,
            top: Math.floor(y),
            right: Math.min(
                area.right,
                Math.ceil(box.left + best.width + 2 * pad),
            ),
            bottom: Math.min(area.bottom, Math.ceil(y + best.height)),
        });
    }
}

function readBlock(pixels: ImageData, region: ScreenshotRegion) {
    const [left, top, right, bottom] = region.box.map((n, i) =>
        Math.round(n * (i % 2 ? pixels.height : pixels.width)),
    );
    if (left >= right || top >= bottom) return;
    const bg = backgroundAt(pixels, left, top, right - left, bottom - top);
    const lines = inkLines(pixels, { left, top, right, bottom }, bg);
    const box = enclosingBox(lines);
    const ink = foreground(pixels, lines, bg);
    const heights = lines
        .map((l) => l.bottom - l.top - 2)
        .sort((a, b) => a - b);
    const size = Math.max(
        1,
        Math.round(heights[Math.floor(heights.length / 2)] * 1.06),
    );
    return {
        region,
        box,
        bg,
        ink,
        lines,
        size,
        text: region.text,
        accent: trailingAccent(
            pixels,
            lines[lines.length - 1],
            bg,
            ink,
            region.source,
            region.text,
        ),
    };
}

export function paintVisionLayer(
    image: HTMLImageElement,
    regions: ScreenshotRegion[],
) {
    const canvas = ele("canvas").el;
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx || !canvas.width || !canvas.height) throw Error(t("无法绘制截图"));
    if (regions.length) {
        ctx.drawImage(image, 0, 0);
        const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const blocks = regions
            .map((r) => readBlock(original, r))
            .filter((b) => b !== undefined)
            .sort((a, b) => a.box.top - b.box.top || a.box.left - b.box.left);
        const changed = blocks.filter(
            (b) => b.region.source.trim() !== b.text.trim(),
        );
        const nested = new Set<(typeof blocks)[number]>();
        for (const parent of changed) {
            if (parent.lines.length < 2) continue;
            const last = parent.lines[parent.lines.length - 1];
            for (const child of blocks) {
                if (
                    child === parent ||
                    child.lines.length !== 1 ||
                    child.box.left <= parent.box.left + parent.size ||
                    child.box.left >= parent.box.right ||
                    Math.abs(last.bottom - child.box.bottom) > 3 ||
                    child.box.left > last.right + parent.size ||
                    child.box.right < last.right - parent.size ||
                    !child.ink.some((v, c) => Math.abs(v - parent.ink[c]) > 50)
                )
                    continue;
                if (!parent.text.trimEnd().endsWith(child.text))
                    parent.text = `${parent.text.trimEnd()} ${child.text}`;
                parent.accent = {
                    text: child.text,
                    color: `rgb(${child.ink.join(",")})`,
                };
                parent.lines.push(child.box);
                parent.box = enclosingBox(parent.lines);
                nested.add(child);
            }
        }
        const obstacles = blocks
            .filter((b) => !nested.has(b))
            .map((b) => b.box);
        // Erase every source line before drawing any translation. Overlapping model boxes cannot wipe the next paragraph.
        for (const block of changed) {
            ctx.fillStyle = `rgb(${block.bg.join(",")})`;
            for (const l of block.lines)
                ctx.fillRect(l.left, l.top, l.right - l.left, l.bottom - l.top);
        }
        for (const block of changed) {
            if (nested.has(block)) continue;
            const peers = changed.filter(
                (b) =>
                    b !== block &&
                    !nested.has(b) &&
                    Math.abs(b.box.left - block.box.left) <= block.size &&
                    b.box.right - b.box.left > 16 * block.size,
            );
            const columnRight = peers.length
                ? Math.max(block.box.right, ...peers.map((b) => b.box.right))
                : original.width;
            ctx.fillStyle = `rgb(${block.ink.join(",")})`;
            drawTranslation(
                ctx,
                original,
                block.box,
                obstacles,
                block.text,
                block.bg,
                block.size,
                block.accent,
                columnRight,
            );
        }
    }
    canvas.style.position = "absolute";
    canvas.style.pointerEvents = "none";
    return canvas;
}
