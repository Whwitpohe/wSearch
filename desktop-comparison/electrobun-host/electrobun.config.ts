import type { ElectrobunConfig } from "electrobun";

const helper =
    process.platform === "win32" ? "wsearch-capture.exe" : "wsearch-capture";
export default {
    app: {
        name: "wSearch Electrobun Trial",
        identifier: "local.wsearch.electrobuntrial",
        version: "0.1.0",
    },
    runtime: { exitOnLastWindowClosed: false },
    build: {
        mainProcess: "bun",
        bun: { entrypoint: "src/bun/index.ts" },
        copy: {
            "../ui/index.html": "views/home/index.html",
            "../tauri-host/tray.png": "views/home/tray.png",
            [`../native/bin/${process.platform}-${process.arch}/${helper}`]: `helpers/${helper}`,
        },
    },
} satisfies ElectrobunConfig;
