import type { setting } from "../src/ShareTypes";
export type ToolbarLayout = NonNullable<setting["工具栏"]["布局"]>;
export type ToolbarLane = keyof ToolbarLayout;
export const lanes = ["capture", "draw", "hidden"] as const;
export function toolbarLayout(
    saved: ToolbarLayout | null,
    capture: string[],
    draw: string[],
    available: string[],
): ToolbarLayout {
    const source = saved ?? { capture, draw, hidden: [] };
    const remaining = new Set(available);
    const take = (keys: unknown) =>
        Array.isArray(keys)
            ? keys.filter(
                  (key): key is string =>
                      typeof key === "string" && remaining.delete(key),
              )
            : [];
    const layout = {
        capture: take(source.capture),
        draw: take(source.draw),
        hidden: take(source.hidden),
    };
    layout.hidden.push(...remaining);
    return layout;
}
