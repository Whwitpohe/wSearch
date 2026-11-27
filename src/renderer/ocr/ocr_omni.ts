import { idleOcr, loadOCR } from "./ocr";
import { ocrOnline } from "./ocr_online";

type ocrResult = {
    text: string;
    box: /** lt,rt,rb,lb */ [
        [number, number],
        [number, number],
        [number, number],
        [number, number],
    ];
}[];

export function ocrOmniLoad(
    store: typeof import("../../../lib/store/renderStore")["default"],
    type: string,
): { ocr: (img: string) => Promise<string[]> } | null {
    if (type === "baidu" || type === "youdao" || type.startsWith("ai-")) {
        return {
            ocr: async (img: string) => {
                return new Promise<string[]>((resolve, reject) => {
                    ocrOnline(
                        store,
                        type.startsWith("ai-") ? type.slice(3) : type,
                        img,
                        (err, result) => {
                            if (err) {
                                reject(err);
                            } else if (result) {
                                resolve(result.text.split("\n"));
                            } else {
                                reject(new Error("未知错误"));
                            }
                        },
                    );
                });
            },
        };
    }
    const local = idleOcr(async () => {
        const x = await loadOCR(store, type);
        if (!x) throw new Error("不支持的 OCR 类型");
        return x.init();
    });
    return {
        ocr: async (img: string) => {
            const res = await local.run((runner) => runner.ocr(img));
            if (!res) throw new Error("不支持的 OCR 类型");
            return res.columns
                .flatMap((c) => c.parragraphs)
                .map((p) => p.parse.text);
        },
    };
}

export function ocrOmni(
    store: typeof import("../../../lib/store/renderStore")["default"],
    type: string,
    arg: string,
    callback: (
        err: Error | null,
        result: { raw: ocrResult; text: string } | null,
    ) => void,
) {
    if (type === "baidu" || type === "youdao") {
        ocrOnline(store, type, arg, callback);
    } else if (type.startsWith("ai-")) {
        const ntype = type.slice(3);
        ocrOnline(store, ntype, arg, callback);
    } else {
        callback(new Error("不支持的 OCR 类型"), null);
    }
}
