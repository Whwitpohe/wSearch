import { describe, expect, it, vi } from "vitest";
import { isDrawingAction, selectionTools } from "../lib/captureTools";
import { selectionShortcuts } from "../lib/selectionShortcuts";
import type { setting } from "../src/ShareTypes";

type Rules = setting["全局工具快捷键"];
function fixture() {
    const callbacks = new Map<string, () => void>(),
        blocked = new Set<string>();
    const host = {
        register: vi.fn((key: string, f: () => void) => {
            if (blocked.has(key) || callbacks.has(key)) return false;
            callbacks.set(key, f);
            return true;
        }),
        unregister: (key: string) => {
            callbacks.delete(key);
        },
        isRegistered: (key: string) => callbacks.has(key),
    };
    const dispatch = vi.fn();
    return {
        callbacks,
        blocked,
        host,
        dispatch,
        keys: selectionShortcuts(host, dispatch),
    };
}
describe("after-selection shortcuts", () => {
    it("loads existing bindings and routes a reused chord to the newly selected tool", () => {
        const { keys, callbacks, dispatch, host } = fixture();
        expect(
            keys.apply({ translate: "Control+Alt+D" } as Rules, {
                startup: true,
            }),
        ).toBe(true);
        callbacks.get("Control+Alt+D")?.();
        expect(dispatch).toHaveBeenLastCalledWith("translate", "Control+Alt+D");
        expect(
            keys.apply({
                "draw.free": "Control+Alt+D",
                translate: "",
            } as Rules),
        ).toBe(true);
        callbacks.get("Control+Alt+D")?.();
        expect(dispatch).toHaveBeenLastCalledWith("draw.free", "Control+Alt+D");
        expect(host.register).toHaveBeenCalledTimes(1);
        expect(keys.apply({ translate: "" } as Rules)).toBe(true);
        expect(callbacks.size).toBe(0);
    });
    it("retains old bindings when a new shortcut is unavailable or settings cannot be saved", () => {
        const { keys, callbacks, blocked } = fixture();
        keys.apply({ translate: "Control+Alt+D" } as Rules);
        blocked.add("Alt+X");
        expect(
            keys.apply({
                "shape.arrow": "Alt+A",
                "draw.free": "Alt+X",
            } as Rules),
        ).toBe(false);
        expect([...callbacks.keys()]).toEqual(["Control+Alt+D"]);
        expect(
            keys.apply({ "filter.blur": "Alt+B" } as Rules, {
                save: () => {
                    throw Error("disk");
                },
            }),
        ).toBe(false);
        expect([...callbacks.keys()]).toEqual(["Control+Alt+D"]);
    });
    it("rejects duplicate chords and supports another shortcut when an old saved one is in conflict", () => {
        const { keys, blocked } = fixture();
        blocked.add("Alt+Q");
        expect(
            keys.apply({ ocr: "Alt+Q", translate: "Ctrl+Alt+D" } as Rules, {
                startup: true,
            }),
        ).toBe(true);
        expect(keys.registered("ocr")).toBe(false);
        expect(
            keys.apply({
                ocr: "Alt+Q",
                translate: "Ctrl+Alt+D",
                "draw.free": "Alt+Control+d",
            } as Rules),
        ).toBe(false);
        expect(
            keys.apply({
                ocr: "Alt+Q",
                translate: "Ctrl+Alt+D",
                "draw.free": "Ctrl+Alt+B",
            } as Rules),
        ).toBe(true);
        blocked.clear();
        expect(keys.apply({ ocr: "Alt+Q" } as Rules, { retry: "ocr" })).toBe(
            true,
        );
        expect(keys.registered("ocr")).toBe(true);
    });
    it("offers distinct actions applicable to a fresh selection", () => {
        const ids = selectionTools.map((t) => t.key);
        expect(new Set(ids).size).toBe(ids.length);
        for (const key of [
            "draw.free",
            "shape.text",
            "shape.arrow",
            "filter.blur",
            "translate",
            "copy",
            "save",
        ])
            expect(ids).toContain(key);
        for (const key of ["screens", "close", "action.undo", "position.front"])
            expect(ids).not.toContain(key);
        expect(isDrawingAction("draw.free")).toBe(true);
        expect(isDrawingAction("action.delete")).toBe(false);
    });
});
