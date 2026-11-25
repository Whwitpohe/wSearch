import type { SelectionAction, setting } from "../src/ShareTypes";
import { isSelectionAction } from "./captureTools";

type Bindings = setting["全局工具快捷键"];
type Route = { key: string; action: SelectionAction };
type Host = {
    register: (key: string, callback: () => void) => boolean;
    unregister: (key: string) => void;
    isRegistered: (key: string) => boolean;
};

function acceleratorId(key: string) {
    const aliases: Record<string, string> = {
        ctrl: "control",
        option: "alt",
        cmd: "command",
        cmdorctrl: process.platform === "darwin" ? "command" : "control",
        commandorcontrol: process.platform === "darwin" ? "command" : "control",
    };
    return key
        .toLowerCase()
        .split("+")
        .map((s) => aliases[s.trim()] ?? s.trim())
        .sort()
        .join("+");
}

export function selectionShortcuts(
    host: Host,
    dispatch: (action: SelectionAction, key: string) => void,
) {
    let active = new Map<string, Route>();
    let requested = new Map<string, Route>();
    function apply(
        bindings: Bindings,
        options: {
            startup?: boolean;
            retry?: SelectionAction;
            save?: () => void;
        } = {},
    ) {
        const desired = new Map<string, Route>(),
            next = new Map<string, Route>();
        if (
            !bindings ||
            typeof bindings !== "object" ||
            Array.isArray(bindings)
        )
            return false;
        for (const [action, key] of Object.entries(bindings)) {
            if (!key) continue;
            if (!isSelectionAction(action) || typeof key !== "string") {
                if (options.startup) continue;
                return false;
            }
            const id = acceleratorId(key);
            if (
                !id ||
                id
                    .split("+")
                    .every((part) =>
                        [
                            "control",
                            "command",
                            "shift",
                            "alt",
                            "super",
                            "meta",
                            "altgr",
                            "",
                        ].includes(part),
                    ) ||
                desired.has(id)
            ) {
                if (options.startup) continue;
                return false;
            }
            desired.set(id, { key, action });
        }
        // Reserve new accelerators first. Existing callbacks look up their current action at invocation time.
        const acquired: string[] = [];
        try {
            for (const [id, route] of desired) {
                const existing = active.get(id);
                if (existing && host.isRegistered(existing.key)) {
                    next.set(id, { action: route.action, key: existing.key });
                    continue;
                }
                if (
                    !options.startup &&
                    requested.get(id)?.action === route.action &&
                    options.retry !== route.action
                )
                    continue;
                let registered = false;
                try {
                    registered = host.register(route.key, () => {
                        const current = active.get(id);
                        if (current) dispatch(current.action, current.key);
                    });
                } catch {}
                if (!registered) {
                    if (options.startup) continue;
                    throw Error("Shortcut unavailable");
                }
                acquired.push(route.key);
                next.set(id, route);
            }
            options.save?.();
        } catch {
            for (const key of acquired) host.unregister(key);
            return false;
        }
        for (const [id, route] of active)
            if (!next.has(id)) host.unregister(route.key);
        active = next;
        requested = desired;
        return true;
    }
    function registered(action: string) {
        for (const route of active.values())
            if (route.action === action) return host.isRegistered(route.key);
        return false;
    }
    return {
        apply,
        registered,
        actions: () =>
            Array.from(active.values())
                .filter((route) => host.isRegistered(route.key))
                .map((route) => route.action),
    };
}
