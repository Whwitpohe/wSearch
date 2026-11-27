import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
    BrowserWindow,
    GlobalShortcut,
    PATHS,
    Tray,
    Utils,
} from "electrobun/bun";

const benchDir = process.env.WSEARCH_TRIAL_BENCH_DIR;
function marker(name: string, value: string) {
    if (benchDir) writeFileSync(join(benchDir, name), value);
}

let capturing = false;
async function capture() {
    if (capturing) return;
    capturing = true;
    try {
        const name =
            process.platform === "win32"
                ? "wsearch-capture.exe"
                : "wsearch-capture";
        const helper = join(PATHS.RESOURCES_FOLDER, "app", "helpers", name);
        const child = Bun.spawn([helper], {
            stdin: "ignore",
            stdout: "ignore",
            stderr: "inherit",
        });
        const code = await child.exited;
        if (code !== 0 && code !== 1) console.error("Capture exited", code);
        marker("completed", String(code));
    } catch (error) {
        console.error(error);
        marker("completed", String(error));
    } finally {
        capturing = false;
    }
}
let info: BrowserWindow | undefined;
function showInfo() {
    if (info) {
        info.activate();
        return;
    }
    info = new BrowserWindow({
        title: "wSearch · Electrobun",
        url: "views://home/index.html",
        frame: { x: 120, y: 120, width: 520, height: 280 },
    });
    info.on("close", () => {
        info = undefined;
    });
}
const registered = GlobalShortcut.register("Control+Alt+Shift+S", () => {
    void capture();
});
const tray = new Tray({
    title: "wSearch · Electrobun",
    image: "views://home/tray.png",
    template: false,
});
tray.setMenu([
    {
        label: registered ? "截图  Ctrl+Alt+Shift+S" : "截图（快捷键被占用）",
        action: "capture",
    },
    { label: "使用说明", action: "info" },
    { label: "退出", action: "exit" },
]);
tray.on("tray-clicked", (event) => {
    if (!event || typeof event !== "object" || !("data" in event)) return;
    const data = event.data;
    if (!data || typeof data !== "object" || !("action" in data)) return;
    switch (data.action) {
        case "capture":
            void capture();
            break;
        case "info":
            showInfo();
            break;
        case "exit":
            Utils.quit();
            break;
    }
});
if (benchDir)
    GlobalShortcut.register("Control+Alt+Shift+F7", () => {
        Utils.quit();
    });
if (process.env.WSEARCH_TRIAL_SHOW_UI) showInfo();
marker("ready", registered ? "registered" : "unavailable");
