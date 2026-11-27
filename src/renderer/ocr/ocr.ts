import type { InitOcrBase } from "esearch-ocr";
import { renderInvoke } from "../../../lib/ipc";
import { defaultOcrId } from "./ocrList";

const path = require("node:path") as typeof import("path");
const fs = require("node:fs") as typeof import("fs");

export { defaultOcrId, loadOCR };

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

    return {
        ocr: localOCR,
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
            ort,
            ortOption: { executionProviders: [{ name: provider }] },
        } as InitOcrBase,
    };
}
