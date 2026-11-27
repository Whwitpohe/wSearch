const LANG_ALIAS: Record<string, string> = {
    zh: "zh-Hans",
    "zh-CN": "zh-Hans",
    "zh-SG": "zh-Hans",
    "zh-TW": "zh-Hant",
    "zh-HK": "zh-Hant",
    "zh-HANS": "zh-Hans",
    "zh-HANT": "zh-Hant",
    "ZH-HANS": "zh-Hans",
    "ZH-HANT": "zh-Hant",
    "pt-BR": "pt",
    "pt-Pt": "pt",
    "pt-Br": "pt",
    "pt-PT": "pt",
    no: "nb",
    nn: "nb",
    iw: "he",
    in: "id",
    fil: "tl",
    "en-GB": "en",
    "en-US": "en",
    "en-Gb": "en",
    "en-Us": "en",
    "fa-AF": "fa",
    "fa-Af": "fa",
    "sr-Latn": "sr",
    "sr-Cyrl": "sr",
    yue: "zh-Hant",
};
export function normalizeSource(code: string) {
    return LANG_ALIAS[code] ?? code;
}

export function detectSource(texts: string[]) {
    const text = texts.join("\n");
    if (/[\u3040-\u30ff]/.test(text)) return "ja";
    if (/[\uac00-\ud7af]/.test(text)) return "ko";
    if (/[\u0400-\u04ff]/.test(text)) return "ru";
    if (/[\u0600-\u06ff]/.test(text)) return "ar";
    if (/[\u0590-\u05ff]/.test(text)) return "he";
    if (/[\u0900-\u097f]/.test(text)) return "hi";
    if (/[\u0e00-\u0e7f]/.test(text)) return "th";
    if (/[\u0370-\u03ff]/.test(text)) return "el";
    if (/[\u4e00-\u9fff]/.test(text)) return "zh-Hans";
    return "en";
}
