import type store from "./store/renderStore";

export function screenshotTarget(
    storeReader: Pick<typeof store, "get">,
    language = "auto",
) {
    if (language && language !== "auto") return language;
    return (
        storeReader.get("屏幕翻译.语言.to") ||
        storeReader.get("语言.语言") ||
        "zh-Hans"
    );
}
