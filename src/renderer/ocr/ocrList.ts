import { noI18n } from "dkh-ui";

export const defaultOcrId = "0";

export function ocrList(
    store: typeof import("../../../lib/store/renderStore")["default"],
) {
    return [
        ...store.get("离线OCR").map((i) => ({
            value: i.id,
            name: i.id === defaultOcrId ? i.name : noI18n(i.name),
        })),
        ...store
            .get("AI.在线模型")
            .filter((i) => i.supportVision)
            .map((i) => ({ value: `ai-${i.name}`, name: noI18n(i.name) })),
        { value: "baidu", name: "百度" },
        { value: "youdao", name: "有道" },
    ];
}
