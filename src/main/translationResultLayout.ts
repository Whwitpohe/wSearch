import type { Rectangle } from "electron";
import type { TranslationResultView } from "../ShareTypes";

export function translationResultLayout(
    rect: TranslationResultView["rect"],
    compare: boolean,
    zoom: number,
    screen: Rectangle,
) {
    const x = Math.round(rect.x),
        y = Math.round(rect.y);
    const originalWidth = Math.max(1, Math.round(rect.x + rect.w) - x);
    const originalHeight = Math.max(1, Math.round(rect.y + rect.h) - y);
    if (!compare && zoom === 1)
        return {
            bounds: { x, y, width: originalWidth, height: originalHeight },
            originalOnRight: false,
            scale: 1,
        };
    const columns = compare ? 2 : 1;
    const fit = Math.min(
        zoom,
        screen.width / (columns * originalWidth),
        screen.height / originalHeight,
    );
    const imageWidth = Math.max(1, Math.floor(originalWidth * fit));
    const width = columns * imageWidth,
        height = Math.max(1, Math.floor(originalHeight * fit));
    const right = screen.x + screen.width;
    const originalOnRight =
        compare && x + width > right && x - imageWidth >= screen.x;
    const left = originalOnRight ? x - imageWidth : x;
    return {
        bounds: {
            x: Math.max(screen.x, Math.min(right - width, left)),
            y: Math.max(
                screen.y,
                Math.min(screen.y + screen.height - height, y),
            ),
            width,
            height,
        },
        originalOnRight,
        scale: imageWidth / originalWidth,
    };
}
