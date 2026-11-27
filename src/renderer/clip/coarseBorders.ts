import type { Border } from "edge_det";

export function coarseBorders(
    pixels: Uint8Array,
    width: number,
    height: number,
    lowThreshold: number,
    highThreshold: number,
): Border[] {
    // Coarse edges use a single RGB difference, calibrated to 18 at the default 50/150 settings.
    const contrast = Math.max(
        1,
        Math.round((18 * (lowThreshold + highThreshold)) / 200),
    );
    const stride = width + 2;
    const edges = new Uint8Array(stride * (height + 2));
    const rowBytes = width * 4;
    for (let y = 0; y < height; y++) {
        let index = y * rowBytes;
        let cell = (y + 1) * stride + 1;
        for (let x = 0; x < width; x++, index += 4, cell++) {
            const r = pixels[index],
                g = pixels[index + 1],
                b = pixels[index + 2];
            const left = index - 4,
                above = index - rowBytes;
            if (
                (x > 0 &&
                    Math.max(
                        Math.abs(r - pixels[left]),
                        Math.abs(g - pixels[left + 1]),
                        Math.abs(b - pixels[left + 2]),
                    ) >= contrast) ||
                (y > 0 &&
                    Math.max(
                        Math.abs(r - pixels[above]),
                        Math.abs(g - pixels[above + 1]),
                        Math.abs(b - pixels[above + 2]),
                    ) >= contrast)
            )
                edges[cell] = 1;
        }
    }

    // An empty one-pixel border lets the eight-neighbour walk use the same offsets at every pixel.
    const neighbours = [
        -stride - 1,
        -stride,
        -stride + 1,
        -1,
        1,
        stride - 1,
        stride,
        stride + 1,
    ];
    const queue = new Int32Array(width * height);
    const borders: Border[] = [];
    for (let start = stride + 1; start < edges.length - stride; start++) {
        if (!edges[start]) continue;
        edges[start] = 0;
        queue[0] = start;
        let count = 1;
        const top = Math.floor(start / stride) - 1;
        let bottom = top,
            left = width,
            right = 0;
        for (let head = 0; head < count; head++) {
            const cell = queue[head];
            const row = Math.floor(cell / stride);
            const x = cell - row * stride - 1;
            left = Math.min(left, x);
            right = Math.max(right, x);
            bottom = Math.max(bottom, row - 1);
            for (const offset of neighbours) {
                const next = cell + offset;
                if (edges[next]) {
                    edges[next] = 0;
                    queue[count++] = next;
                }
            }
        }
        // A difference is located at the boundary between samples, including the far edge.
        if (count >= 6 && right - left >= 2 && bottom - top >= 2)
            borders.push({ x: left, y: top, w: right - left, h: bottom - top });
    }
    return borders;
}
