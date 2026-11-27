export type TextBox = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

export function sameBackground(
    pixels: ImageData,
    x: number,
    y: number,
    bg: number[],
    tolerance: number,
) {
    const i = (y * pixels.width + x) * 4,
        p = pixels.data;
    return (
        Math.max(
            Math.abs(p[i] - bg[0]),
            Math.abs(p[i + 1] - bg[1]),
            Math.abs(p[i + 2] - bg[2]),
        ) <= tolerance
    );
}

export function enclosingBox(boxes: TextBox[]): TextBox {
    return {
        left: Math.min(...boxes.map((b) => b.left)),
        right: Math.max(...boxes.map((b) => b.right)),
        top: Math.min(...boxes.map((b) => b.top)),
        bottom: Math.max(...boxes.map((b) => b.bottom)),
    };
}

// Vision boxes are approximate. Follow the glyphs cut by an edge, stopping at the gutter before another label.
export function inkLines(pixels: ImageData, box: TextBox, bg: number[]) {
    const lines: TextBox[] = [];
    const pad = Math.min(8, Math.ceil((box.bottom - box.top) / 3));
    const top = Math.max(0, box.top - pad),
        bottom = Math.min(pixels.height, box.bottom + pad);
    let start = top;
    function inkAt(x: number, y: number) {
        return !sameBackground(pixels, x, y, bg, 10);
    }
    for (let y = top; y <= bottom; y++) {
        let ink = false;
        for (let x = box.left; y < bottom && x < box.right; x++) {
            if (inkAt(x, y)) {
                ink = true;
                break;
            }
        }
        if (ink) continue;
        if (start < y && start < box.bottom && y > box.top) {
            const reach = Math.min(28, y - start + 5);
            const gap = Math.min(4, Math.max(2, Math.round((y - start) / 5)));
            const left = Math.max(0, box.left - reach),
                right = Math.min(pixels.width, box.right + reach);
            const columns: number[] = [];
            for (let x = left; x < right; x++) {
                for (let row = start; row < y; row++) {
                    if (inkAt(x, row)) {
                        columns.push(x);
                        break;
                    }
                }
            }
            let first = columns.findIndex((x) => x >= box.left);
            let last = columns.findLastIndex((x) => x < box.right);
            if (first >= 0 && last >= first) {
                while (
                    first > 0 &&
                    columns[first] - columns[first - 1] <= gap + 1
                )
                    first--;
                while (
                    last + 1 < columns.length &&
                    columns[last + 1] - columns[last] <= gap + 1
                )
                    last++;
                // A stripe reaching the edge of the search area may be a panel or a picture.
                lines.push({
                    left:
                        columns[first] === left && left > 0
                            ? box.left
                            : Math.max(0, columns[first] - 1),
                    right:
                        columns[last] === right - 1 && right < pixels.width
                            ? box.right
                            : Math.min(pixels.width, columns[last] + 2),
                    top:
                        start === top && top > 0
                            ? box.top
                            : Math.max(0, start - 1),
                    bottom:
                        y === bottom && bottom < pixels.height
                            ? box.bottom
                            : Math.min(pixels.height, y + 1),
                });
            }
        }
        start = y + 1;
    }
    return lines.length ? lines : [box];
}

function delta(p: Uint8ClampedArray, i: number, bg: number[]) {
    return Math.max(
        Math.abs(p[i] - bg[0]),
        Math.abs(p[i + 1] - bg[1]),
        Math.abs(p[i + 2] - bg[2]),
    );
}

function toneDistance(a: number[], b: number[]) {
    return Math.max(
        Math.abs(a[0] - b[0]),
        Math.abs(a[1] - b[1]),
        Math.abs(a[2] - b[2]),
    );
}

// Antialiased edges lie between the background and the ink. Group by color direction and sample solid strokes.
export function foreground(
    pixels: ImageData,
    boxes: TextBox[],
    bg: number[],
    fallback?: number[],
) {
    const colors: { tone: number[]; samples: number[] }[] = [];
    const p = pixels.data;
    for (const box of boxes) {
        const step = Math.max(
            1,
            Math.floor(
                ((box.right - box.left) * (box.bottom - box.top)) / 8000,
            ),
        );
        for (let y = box.top; y < box.bottom; y++) {
            for (let x = box.left; x < box.right; x += step) {
                const i = (y * pixels.width + x) * 4,
                    d = delta(p, i, bg);
                if (d < 12) continue;
                const tone = bg.map((v, c) => (p[i + c] - v) / d);
                let group = colors.find(
                    (g) => toneDistance(g.tone, tone) < 0.44,
                );
                if (!group) {
                    group = { tone, samples: [] };
                    colors.push(group);
                }
                group.samples.push(i);
            }
        }
    }
    const samples = colors.sort(
        (a, b) => b.samples.length - a.samples.length,
    )[0]?.samples;
    if (!samples)
        return (
            fallback ??
            bg.map(() =>
                bg[0] * 0.21 + bg[1] * 0.72 + bg[2] * 0.07 > 140 ? 17 : 250,
            )
        );
    const strength = (i: number) =>
        Math.abs(p[i] - bg[0]) +
        Math.abs(p[i + 1] - bg[1]) +
        Math.abs(p[i + 2] - bg[2]);
    samples.sort((a, b) => strength(a) - strength(b));
    const solid = samples.slice(Math.floor(samples.length * 0.92));
    return bg.map((_, c) =>
        Math.round(solid.reduce((s, i) => s + p[i + c], 0) / solid.length),
    );
}

export type Accent = { text: string; color: string };

const sentences = new Intl.Segmenter(undefined, { granularity: "sentence" });

export function trailingAccent(
    pixels: ImageData,
    line: TextBox,
    bg: number[],
    ink: number[],
    source: string,
    text: string,
): Accent | undefined {
    const tail = (s: string) => {
        const parts = [...sentences.segment(s.trim())];
        return parts.length > 1 ? parts.at(-1)?.segment.trim() : undefined;
    };
    const phrase = tail(source),
        translated = tail(text);
    if (!phrase || !translated) return;
    const h = line.bottom - line.top;
    const last = foreground(
        pixels,
        [{ ...line, left: Math.max(line.left, line.right - h * 2) }],
        bg,
    );
    if (toneDistance(ink, last) < 55) return;
    const direction = (rgb: number[]) => {
        const dist = toneDistance(rgb, bg) || 1;
        return rgb.map((v, c) => (v - bg[c]) / dist);
    };
    const accentTone = direction(last),
        bodyTone = direction(ink);
    // Verify that the complete trailing phrase has this ink, not just its final punctuation or an icon.
    let left = line.right,
        gap = 0;
    for (let x = line.right - 1; x >= line.left; x--) {
        let matches = 0,
            others = 0;
        for (let y = line.top; y < line.bottom; y++) {
            if (sameBackground(pixels, x, y, bg, 32)) continue;
            const p = pixels.data,
                i = (y * pixels.width + x) * 4;
            const d = delta(p, i, bg);
            const color = bg.map((v, c) => (p[i + c] - v) / d);
            if (toneDistance(color, accentTone) < toneDistance(color, bodyTone))
                matches++;
            else others++;
        }
        if (others > matches) break;
        if (matches) {
            left = x;
            gap = 0;
        } else if (++gap > h / 2) break;
    }
    const units = Array.from(phrase).reduce(
        (n, c) => n + (c.charCodeAt(0) > 255 ? 1 : 0.53),
        0,
    );
    const ratio = (line.right - left) / (units * h);
    if (ratio < 0.55 || ratio > 1.6) return;
    return { text: translated, color: `rgb(${last.join(",")})` };
}
