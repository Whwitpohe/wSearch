import type { setting } from "../src/ShareTypes";

type SavedLayout = setting["工具栏"]["布局"];
export type ToolbarLayout = Required<NonNullable<SavedLayout>>;
export type ToolbarLane = keyof ToolbarLayout;
export const lanes = ["capture", "draw", "more", "hidden"] as const;

export function toolbarLayout(
    saved: SavedLayout,
    capture: string[],
    draw: string[],
    captureKeys: string[],
    drawKeys: string[],
): ToolbarLayout {
    const remaining = new Set([...captureKeys, ...drawKeys]);
    const take = (keys: string[]) =>
        Array.isArray(keys) ? keys.filter((key) => remaining.delete(key)) : [];
    const captureBar = take(saved?.capture ?? capture);
    const drawBar = take(saved?.draw ?? draw);
    // Older versions populated More from the drawing catalog in its built-in order.
    const more = take(saved?.more ?? drawKeys);
    const hidden = take(saved?.hidden ?? []);
    return {
        capture: captureBar,
        draw: drawBar,
        more,
        hidden: [...hidden, ...remaining],
    };
}
