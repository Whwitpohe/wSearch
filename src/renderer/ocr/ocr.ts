import type { InitOcrBase } from "esearch-ocr";
import { renderInvoke } from "../../../lib/ipc";
import { defaultOcrId } from "./ocrList";

const path = require("node:path") as typeof import("path");
const fs = require("node:fs") as typeof import("fs");

export { defaultOcrId, idleOcr, loadOCR };

type LocalOcr = Awaited<ReturnType<typeof import("esearch-ocr").init>>;

/** 用时加载本地 OCR，空闲后释放 ONNX 会话占用的内存 */
function idleOcr(
    load: () => Promise<{
        runner: LocalOcr;
        release: () => Promise<unknown>;
    } | null>,
    idleMs = 30_000,
) {
    let loading: ReturnType<typeof load> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let active = 0;
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
            if (active || !loading) return;
            const current = loading;
            loading = undefined;
            const loaded = await current.catch(() => null);
            await loaded?.release();
        }, idleMs);
    };
    return {
        async run<T>(task: (runner: LocalOcr) => Promise<T>) {
            clearTimeout(timer);
            active++;
            try {
                loading ??= load().catch((error: unknown) => {
                    loading = undefined;
                    throw error;
                });
                const loaded = await loading;
                if (!loaded) {
                    loading = undefined;
                    return null;
                }
                return await task(loaded.runner);
            } finally {
                active--;
                if (!active) schedule();
            }
        },
    };
}

async function loadOCR(
    store: typeof import("../../../lib/store/renderStore")["default"],
    type: string,
    op?: {
        docCls?: boolean;
    },
) {
    const ocrList = store.get("离线OCR");
    const defaultPaths = {
        det: "ppocr6_small_det.onnx",
        rec: "ppocr6_small_rec.onnx",
        dic: "dic.txt",
        docCls: "doc_cls.onnx",
    };
    const globalDetPath = store.get("OCR.全局det路径") || defaultPaths.det;
    const defaultOcr = ocrList.find((i) => i.id === defaultOcrId);
    if (defaultOcr) {
        defaultOcr.detPath = globalDetPath;
        defaultOcr.recPath = defaultPaths.rec;
        defaultOcr.dicPath = defaultPaths.dic;
    } else {
        ocrList.push({
            id: defaultOcrId,
            name: "",
            detPath: globalDetPath,
            recPath: defaultPaths.rec,
            dicPath: defaultPaths.dic,
            scripts: ["zh-HANS", "en"],
            accuracy: "low",
            speed: "fast",
        });
    }
    const l = ocrList.find((i) => i.id === type);
    if (!l) return null;
    const bundledDir = path.join(__dirname, "../../assets/onnx/ppocr");
    let downloadedDir = "";
    function ocrPath(p: string) {
        if (!p) return "";
        if (path.isAbsolute(p)) return fs.existsSync(p) ? p : "";
        const bundled = path.join(bundledDir, p);
        if (fs.existsSync(bundled)) return bundled;
        if (downloadedDir) {
            const cached = path.join(downloadedDir, p);
            if (fs.existsSync(cached)) return cached;
        }
        return "";
    }
    if (
        !(
            ocrPath(l.detPath) ||
            ocrPath(globalDetPath) ||
            ocrPath(defaultPaths.det)
        ) ||
        !(ocrPath(l.recPath) || ocrPath(defaultPaths.rec)) ||
        !(ocrPath(l.dicPath) || ocrPath(defaultPaths.dic)) ||
        (op?.docCls && !ocrPath(defaultPaths.docCls))
    ) {
        downloadedDir = await renderInvoke("defaultOcrDirectory", []);
    }
    const detp =
        ocrPath(l.detPath) ||
        ocrPath(globalDetPath) ||
        ocrPath(defaultPaths.det);
    const recp = ocrPath(l.recPath) || ocrPath(defaultPaths.rec);
    const 字典 = ocrPath(l.dicPath) || ocrPath(defaultPaths.dic);
    const docCls = op?.docCls ? ocrPath(defaultPaths.docCls) : undefined;
    console.log(detp, recp, 字典);
    if (!detp || !recp || !字典) {
        console.error("OCR路径错误");
        return null;
    }
    const [localOCR, { default: ort }] = await Promise.all([
        import("esearch-ocr"),
        import("../lib/ort"),
    ]);
    const provider = store.get("AI.运行后端") || "cpu";
    console.log("ocr provider", provider);
    // esearch-ocr 不暴露会话，经由传入的 ort 记录下来以便释放
    const sessions: { release(): Promise<void> }[] = [];
    const trackedOrt = {
        ...ort,
        InferenceSession: {
            create: async (
                ...args: Parameters<typeof ort.InferenceSession.create>
            ) => {
                const session = await ort.InferenceSession.create(...args);
                sessions.push(session);
                return session;
            },
        },
    } as typeof ort;

    return {
        ocr: localOCR,
        release: () =>
            Promise.allSettled(sessions.splice(0).map((s) => s.release())),
        config: {
            det: {
                input: detp,
                ratio: 0.75,
            },
            rec: {
                input: recp,
                decodeDic: fs.readFileSync(字典).toString(),
                optimize: {
                    space: l.optimize?.space,
                },
            },
            ...(docCls
                ? {
                      docCls: {
                          input: docCls,
                      },
                  }
                : {}),
            ort: trackedOrt,
            ortOption: { executionProviders: [{ name: provider }] },
        } as InitOcrBase,
    };
}
