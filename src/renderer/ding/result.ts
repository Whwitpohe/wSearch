import { addStyle, image, view } from "dkh-ui";
import { renderOn, renderSend, renderSendSync } from "../../../lib/ipc";
import { screenshotTarget } from "../../../lib/screenshotLanguage";
import store from "../../../lib/store/renderStore";
import { t } from "../../../lib/translate/translate";
import type { IconType } from "../../iconTypes";
import type {
    PinPanelState,
    TranslationCopyKind,
    TranslationResultView,
} from "../../ShareTypes";
import { writeImage } from "../lib/clipboard";
import { screenshotLanguageCodes } from "../lib/translate";
import { getImgUrl, setTitle } from "../root/root";
import { copyDing, type DingItemData, editDing, saveDing } from "./item";
import { type OcrResult, recognizeImage, UnConfigTranslateError } from "./ocr";
import { comparisonImage, translateImage } from "./translateImage";

export function initTranslationResult() {
    setTitle(t("截图翻译"));
    document.body.classList.add("translation-result");
    addStyle({
        "html:has(body.translation-result), body.translation-result": {
            margin: 0,
            padding: 0,
            background: "transparent",
            overflow: "hidden",
        },
        ".translation-images": {
            width: "100vw",
            height: "100vh",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gridTemplateRows: "minmax(0, 1fr)",
            padding: 0,
            gap: 0,
            userSelect: "none",
        },
        ".translation-images > img": {
            display: "block",
            gridRow: "1",
            gridColumn: "1",
            width: "100%",
            minWidth: 0,
            maxWidth: "none",
            height: "100%",
            objectFit: "contain",
            border: "none",
            outline: "none",
            borderRadius: 0,
            boxShadow: "none",
            pointerEvents: "none",
        },
        '.translation-images[data-mode="compare"]': {
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        },
        '.translation-images[data-mode="compare"] > img:last-child, .translation-images[data-mode="compare"].original-right > img:first-child':
            { gridColumn: "2" },
        '.translation-images[data-mode="compare"].original-right > img:last-child':
            { gridColumn: "1" },
        ".translation-images > img[hidden]": { display: "none" },
        "body.translation-result.is-hovered::after": {
            content: '""',
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            boxShadow:
                "inset 0 0 0 1px rgb(48 136 218 / 70%), inset 0 0 0 2px rgb(255 255 255 / 35%)",
        },
    });
    renderOn("translationResultInit", ([info]) => render(info));
}

function render(info: TranslationResultView) {
    const { id, url, rect } = info;
    const data: DingItemData = {
        id: String(id),
        rect: [rect.x, rect.y, rect.w, rect.h],
        url,
        translation: "",
        isTranslate: false,
    };
    const original = image(url, t("原图")).attr({ draggable: false });
    const translated = image("", t("译图")).attr({ draggable: false });
    const surface = view()
        .class("translation-images")
        .add([original, translated])
        .addInto();
    let result = info.completed;
    let sourceLines = info.completed?.sourceLines ?? [];
    let compare = !!info.completed || info.preferences.并排对照;
    const codes = screenshotLanguageCodes(
        info.vision,
        store.get("翻译.翻译器")[0]?.type,
    );
    let automaticTarget = screenshotTarget(store);
    const locale = store.get("语言.语言") || navigator.language;
    const languageNames = new Intl.DisplayNames(locale, { type: "language" });
    function supported(code: string) {
        if (codes.includes(code)) return code;
        if (code === "zh-Hans" && codes.includes("zh")) return "zh";
        if (code === "zh" && codes.includes("zh-Hans")) return "zh-Hans";
        return undefined;
    }
    let recent = info.preferences.最近语言;
    function quickLanguages() {
        const values = new Set(
            recent
                .map(supported)
                .filter((code): code is string => !!code && code !== "auto"),
        );
        for (const fallback of ["zh-Hans", "en"]) {
            if (values.size >= 2) break;
            const code = supported(fallback);
            if (code) values.add(code);
        }
        const quick = [{ value: "auto", label: t("自动") }];
        for (const code of [...values].slice(0, 4)) {
            const label =
                code === "zh-Hans" || code === "zh"
                    ? t("中文")
                    : code === "en"
                      ? t("英文")
                      : (languageNames.of(code) ?? code);
            quick.push({ value: code, label });
        }
        return quick;
    }
    const selector = {
        label: t("译文语言"),
        locale,
        codes,
        searchLabel: t("搜索语言"),
        emptyLabel: t("无结果，尝试其他关键词"),
    };
    let language = supported(info.preferences.译文语言) ?? "auto";
    let currentTarget = result?.target ?? screenshotTarget(store, language);
    if (
        result &&
        currentTarget.toLowerCase() !==
            screenshotTarget(store, language).toLowerCase()
    )
        language =
            currentTarget === automaticTarget
                ? "auto"
                : (supported(currentTarget) ?? "auto");
    type Result = NonNullable<TranslationResultView["completed"]>;
    const translations = new Map<string, Result>();
    const inFlight = new Map<string, Promise<Result>>();
    if (result) translations.set(currentTarget.toLowerCase(), result);
    let ocr: Promise<OcrResult> | undefined;
    function recognize(url: string) {
        ocr ??= recognizeImage(url)
            .then((paragraphs) => {
                if (!closed) {
                    sourceLines = paragraphs.map((p) => p.parse.text);
                    updatePanel();
                }
                return paragraphs;
            })
            .catch((error: unknown) => {
                ocr = undefined;
                throw error;
            });
        return ocr;
    }
    let revision = 0;
    let hovered = false,
        failed = false,
        closed = false;
    let status = "",
        zoom = 1,
        opacity = 100;

    function controls() {
        return [
            {
                label: compare ? "覆盖" : "并排对照",
                icon: "compare",
                show: true,
                run: () => switchMode(!compare),
            },
            {
                label: "复制",
                icon: "copy",
                show: true,
                copies: [
                    {
                        value: "source",
                        label: t("复制原文"),
                        disabled: !sourceLines.length,
                    },
                    {
                        value: "translation",
                        label: t("复制译文"),
                        disabled: !result?.lines.length,
                    },
                    {
                        value: "originalImage",
                        label: t("复制原图"),
                        disabled: false,
                    },
                    { value: "image", label: t("复制译图"), disabled: !result },
                    {
                        value: "comparison",
                        label: t("复制对照图"),
                        disabled: !result,
                    },
                ],
            },
            {
                label: "保存",
                icon: "save",
                show: true,
                disabled: !result,
                run: () => void saveDing(data),
            },
            {
                label: "编辑",
                icon: "free_draw",
                show: true,
                disabled: !result,
                run: () => editDing(data),
            },
            {
                label: "贴图",
                icon: "ding",
                show: true,
                disabled: !result,
                run: () => {
                    renderSend("clip_ding", [data.translation, "ding", rect]);
                    renderSend("windowClose", []);
                },
            },
            {
                label: "重试",
                icon: "reload",
                show: failed,
                run: () => void translate(),
            },
            {
                label: "关闭",
                icon: "close",
                show: true,
                run: () => renderSend("windowClose", []),
            },
        ] satisfies {
            label: string;
            icon: IconType;
            show: boolean;
            run?: () => void;
            disabled?: boolean;
            copies?: {
                value: TranslationCopyKind;
                label: string;
                disabled: boolean;
            }[];
        }[];
    }
    function updatePanel() {
        if (closed) return;
        const state: PinPanelState = {
            id,
            rect: { x: 0, y: 0, width: innerWidth, height: innerHeight },
            compact: true,
            hoverOnly: true,
            hovered,
            status,
            language: {
                ...selector,
                quick: quickLanguages(),
                value: language,
                defaultTarget: automaticTarget,
            },
            buttons: controls().flatMap((c, index) =>
                c.show
                    ? [
                          {
                              index,
                              label: t(c.label),
                              icon: getImgUrl(`${c.icon}.svg`),
                              pressed: index === 0 ? compare : undefined,
                              disabled: c.disabled,
                              copies: c.copies,
                          },
                      ]
                    : [],
            ),
            zoom: Math.round(zoom * 100),
            opacity,
            zoomLabel: t("缩放"),
            opacityLabel: t("不透明度"),
            closeLabel: t("关闭"),
        };
        renderSend("pinPanelState", [state]);
    }
    function showImages() {
        surface.el.dataset.mode = compare ? "compare" : "overlay";
        original.el.hidden = !compare && !(info.keepSource && !result);
        translated.el.hidden = !result;
        if (result) {
            const src =
                compare || info.keepSource ? result.image : result.layer;
            if (translated.el.src !== src) translated.el.src = src;
        }
    }
    function layout(scale: number, remember = false) {
        showImages();
        const placement = renderSendSync("translationResultLayout", [
            id,
            compare,
            scale,
            remember,
        ]);
        if (placement) {
            zoom = placement.scale;
            surface.el.classList.toggle(
                "original-right",
                placement.originalOnRight,
            );
        }
        updatePanel();
    }
    function switchMode(value: boolean) {
        if (compare === value) return;
        compare = value;
        layout(1, true);
    }
    async function translate() {
        if (closed) return;
        const request = ++revision;
        const target = screenshotTarget(store, language);
        const key = target.toLowerCase();
        currentTarget = target;
        failed = false;
        function display(ready: Result) {
            result = ready;
            if (!sourceLines.length) sourceLines = ready.sourceLines;
            data.translation = ready.image;
            data.isTranslate = true;
            status = ready.lines.length ? "" : t("图中没有需要翻译的文字");
            showImages();
        }
        const cached = translations.get(key);
        if (cached) {
            translations.delete(key);
            translations.set(key, cached);
            display(cached);
            updatePanel();
            return;
        }
        status = t("正在翻译...");
        result = undefined;
        data.translation = "";
        data.isTranslate = false;
        showImages();
        let pending = inFlight.get(key);
        if (!pending) {
            pending = translateImage(
                id,
                url,
                info.vision,
                true,
                (message) => {
                    if (!closed && currentTarget.toLowerCase() === key) {
                        status = message;
                        updatePanel();
                    }
                },
                target,
                recognize,
            )
                .then((output) => {
                    const ready = {
                        image: output.composite.toDataURL("image/png"),
                        layer: output.layer.toDataURL("image/png"),
                        lines: output.lines,
                        sourceLines: output.sourceLines,
                        target: output.target,
                    };
                    translations.set(key, ready);
                    // 每项包含两张全尺寸 PNG，仅保留最近使用的三个目标语言。
                    if (translations.size > 3) {
                        const oldest = translations.keys().next();
                        if (!oldest.done) translations.delete(oldest.value);
                    }
                    return ready;
                })
                .finally(() => inFlight.delete(key));
            inFlight.set(key, pending);
        }
        updatePanel();
        try {
            const ready = await pending;
            if (closed || revision !== request) return;
            display(ready);
        } catch (error) {
            if (closed || revision !== request) return;
            failed = true;
            status =
                error instanceof UnConfigTranslateError
                    ? t("未配置翻译引擎")
                    : error instanceof Error
                      ? error.message
                      : t("翻译失败");
        } finally {
            if (revision === request) updatePanel();
        }
    }
    renderOn("translationResultHover", ([over]) => {
        hovered = over;
        document.body.classList.toggle("is-hovered", over);
        if (over) {
            recent = store.get("屏幕翻译.截图偏好.最近语言");
            const target = screenshotTarget(store);
            const changed = target !== automaticTarget;
            automaticTarget = target;
            if (changed && language === "auto") {
                void translate();
                return;
            }
        }
        updatePanel();
    });
    renderOn("pinPanelDispatch", ([target, action]) => {
        if (target !== id || closed) return;
        switch (action.type) {
            case "language":
                automaticTarget = screenshotTarget(store);
                if (action.value !== "auto" && !codes.includes(action.value))
                    return;
                recent =
                    renderSendSync("rememberTranslationLanguage", [
                        id,
                        action.value,
                    ]) ?? recent;
                if (
                    language !== action.value ||
                    currentTarget !== screenshotTarget(store, action.value)
                ) {
                    language = action.value;
                    void translate();
                } else updatePanel();
                break;
            case "copy":
                if (action.value === "originalImage") {
                    void copyDing(data, url);
                } else if (action.value === "image") {
                    if (result) void copyDing(data, result.image);
                } else if (action.value === "comparison") {
                    if (result)
                        void comparisonImage(url, result.image)
                            .then(writeImage)
                            .catch(() => {
                                status = t("无法复制对照图");
                                updatePanel();
                            });
                } else {
                    const text = (
                        action.value === "source" ? sourceLines : result?.lines
                    )?.join("\n\n");
                    if (text) renderSend("copyTranslationText", [id, text]);
                }
                break;
            case "button": {
                const c = controls()[action.value];
                if (c?.show && !c.disabled) c.run?.();
                break;
            }
            case "close":
                renderSend("windowClose", []);
                break;
            case "dismiss":
                status = "";
                updatePanel();
                break;
            case "zoom":
                if (Number.isFinite(action.value)) layout(action.value / 100);
                break;
            case "opacity":
                if (Number.isFinite(action.value)) {
                    opacity = Math.max(0, Math.min(100, action.value));
                    surface.el.style.opacity = String(opacity / 100);
                    updatePanel();
                }
                break;
        }
    });
    window.addEventListener("resize", updatePanel);
    window.addEventListener(
        "beforeunload",
        () => {
            closed = true;
        },
        { once: true },
    );
    if (result) {
        data.translation = result.image;
        data.isTranslate = true;
    }
    layout(1);
    if (!result) void translate();
}
