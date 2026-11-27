import {
    addClass,
    button,
    type ElType,
    ele,
    image,
    noI18n,
    pack,
    view,
} from "dkh-ui";
import initScreenShots from "../screenShot/screenShot";

function iconEl(src: IconType) {
    return image(getImgUrl(`${src}.svg`), "icon").class("icon");
}

import { renderOn, renderSend } from "../../../lib/ipc";
import store from "../../../lib/store/renderStore";
import { t } from "../../../lib/translate/translate";
import type { IconType } from "../../iconTypes";
import { writeText } from "../lib/clipboard";
import { loadTranslator } from "../lib/translate";
import { defaultOcrId, idleOcr, loadOCR } from "../ocr/ocr";
import { Class, getImgUrl, initStyle, setTitle } from "../root/root";

initStyle(store);

setTitle(t("屏幕翻译"));

const screenShots = initScreenShots(
    {
        c: store.get("额外截屏器.命令"),
        path: store.get("额外截屏器.位置"),
    },
    undefined,
    undefined,
    store.get("使用XDGDesktopPortal"),
);

const translateE = loadTranslator(store) || (async (input: string[]) => input);

type Rect = { x: number; y: number; w: number; h: number };
let rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

let screenId = Number.NaN;

let display: Electron.Display[];

const frequencyTime: number = store.get("屏幕翻译.dTime") || 3000;
const bgColor = store.get("屏幕翻译.color.bg") || "rgb(255,255,255,0.5)";
const textColor = store.get("屏幕翻译.color.text") || "#000";

let pause = false;
let sourceText = "";
let translatedText = "";

const cropCanvas = document.createElement("canvas");
const cropContext = cropCanvas.getContext("2d", { willReadFrequently: true });
async function screenshot(id: number, rect: Rect) {
    const l = (await screenShots(display)).screen;
    const screen = l.find((i) => i.id === id) || l[0];
    if (!screen) return null;
    const img = (await screen.capture()).toImageData();
    if (!img) return null;
    if (!cropContext || rect.w <= 0 || rect.h <= 0) return null;
    if (cropCanvas.width !== rect.w || cropCanvas.height !== rect.h) {
        cropCanvas.width = rect.w;
        cropCanvas.height = rect.h;
    } else {
        cropContext.clearRect(0, 0, rect.w, rect.h);
    }
    cropContext.putImageData(
        img,
        -rect.x,
        -rect.y,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
    );
    return cropContext.getImageData(0, 0, rect.w, rect.h);
}

const tCache: Map<string, string> = new Map();

async function translate(text: { text: string; el: ElType<HTMLDivElement> }[]) {
    const missing = new Map<string, ElType<HTMLDivElement>[]>();
    for (const item of text) {
        const cached = tCache.get(item.text);
        if (cached !== undefined) item.el.el.textContent = cached;
        else {
            const targets = missing.get(item.text);
            if (targets) targets.push(item.el);
            else missing.set(item.text, [item.el]);
        }
    }
    if (!missing.size) return;
    const keys = Array.from(missing.keys());
    const translated = await translateE(keys);
    keys.forEach((key, index) => {
        const value = translated[index];
        if (value === undefined) return;
        tCache.set(key, value);
        for (const el of missing.get(key)!) el.el.textContent = value;
    });
}

const sl = () =>
    new Promise((resolve) => {
        setTimeout(() => {
            resolve("");
        }, 100);
    });

async function run() {
    const ocrData = await localOcr.run(async (runner) => {
        const data = await screenshot(screenId, rect);
        if (!data) return null;
        document.body.style.opacity = "1";
        return runner.ocr(data);
    });
    if (!ocrData) return;

    textEl.clear();
    const textL: { text: string; el: ElType<HTMLDivElement> }[] = [];
    for (const _i of ocrData.columns.flatMap((c) => c.parragraphs)) {
        const lineHeight = _i.src
            .map((i) => i.box[3][1] - i.box[0][1])
            .reduce((a, b) => (a + b) / 2);
        const i = _i.parse;
        const text = i.text;
        const x0 = i.box[0][0];
        const y0 = i.box[0][1];
        const x1 = i.box[2][0];
        const y1 = i.box[2][1];
        const item = view().style({
            position: "absolute",
            left: `${x0}px`,
            top: `${y0}px`,
            width: `${x1 - x0}px`,
            height: `${y1 - y0}px`,
            lineHeight: `${lineHeight}px`,
            fontSize: `${lineHeight}px`,
            color: textColor,
        });
        textEl.add(item);
        textL.push({ el: item, text });
    }
    sourceText = textL.map((item) => item.text).join("\n\n");
    translatedText = "";
    updateCopyOptions();
    await translate(textL);
    translatedText = textL.map((i) => i.el.el.textContent ?? "").join("\n\n");
    comparisonText.el.textContent = translatedText;
    updateCopyOptions();
}

let refreshTimer: null | ReturnType<typeof setTimeout> = null;
let currentRun: Promise<void> | undefined;
function refresh(manual = false) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    if (currentRun || (pause && !manual)) return currentRun;
    currentRun = run()
        .catch((error) => console.error(error))
        .finally(() => {
            currentRun = undefined;
            if (!pause)
                refreshTimer = setTimeout(() => refresh(), frequencyTime);
        });
    return currentRun;
}

pack(document.body).style({
    overflow: "hidden",
});

const playIcon = iconEl("pause");
const playEl = button(playIcon)
    .attr({ title: "暂停" })
    .on("click", () => {
        pause = !pause;
        playEl.attr({ title: pause ? "继续" : "暂停" });
        playIcon.el.src = pause
            ? getImgUrl("recume.svg")
            : getImgUrl("pause.svg");
        void refresh();
    });

const runEl = button(iconEl("ocr"))
    .attr({ title: "文字识别" })
    .on("click", async () => {
        mainEl.el.style.opacity = "0";
        await sl();
        await sl();
        await refresh(true);
        mainEl.el.style.opacity = "1";
    });

let compare = false;
const compareButton = button(iconEl("compare"))
    .attr({ title: "并排对照", ariaPressed: "false" })
    .on("click", () => {
        compare = !compare;
        compareButton.el.setAttribute("aria-pressed", String(compare));
        comparison.el.hidden = !compare;
        textEl.el.hidden = compare;
    });
const copyMenu = view()
    .class("live-copy-menu")
    .attr({ popover: "auto", role: "group", ariaLabel: t("复制") })
    .addInto();
const copyChoices = [
    { label: "复制原文", icon: "text", value: () => sourceText },
    { label: "复制译文", icon: "translate", value: () => translatedText },
] as const;
const copyOptions = copyChoices.map((choice) =>
    button()
        .add([iconEl(choice.icon), noI18n(t(choice.label))])
        .on("click", () => {
            const text = choice.value();
            if (!text) return;
            void writeText(text);
            copyMenu.el.hidePopover();
        }),
);
copyMenu.add(copyOptions);
function updateCopyOptions() {
    copyOptions.forEach((option, i) => {
        option.el.disabled = !copyChoices[i].value();
    });
}
const copyButton = button(iconEl("copy"))
    .attr({ title: "复制", ariaExpanded: "false" })
    .on("click", () => {
        if (copyMenu.el.matches(":popover-open")) {
            copyMenu.el.hidePopover();
            return;
        }
        updateCopyOptions();
        copyMenu.el.showPopover();
        const rect = copyButton.el.getBoundingClientRect();
        const top =
            rect.bottom + copyMenu.el.offsetHeight + 4 <= innerHeight
                ? rect.bottom + 4
                : Math.max(0, rect.top - copyMenu.el.offsetHeight - 4);
        copyMenu.style({
            top: `${top}px`,
            left: `${Math.max(0, Math.min(innerWidth - copyMenu.el.offsetWidth, rect.right - copyMenu.el.offsetWidth))}px`,
        });
    });
copyMenu.el.addEventListener("toggle", () =>
    copyButton.el.setAttribute(
        "aria-expanded",
        String(copyMenu.el.matches(":popover-open")),
    ),
);

const toolsEl = view("x")
    .style({ position: "absolute", right: 0, top: 0 })
    .class(
        addClass(
            {},
            {
                "&>*": {
                    // @ts-ignore
                    "-webkit-app-region": "no-drag",
                },
            },
        ),
    )
    .class(Class.smallSize, "live-translation-bar")
    .add([
        compareButton,
        playEl,
        runEl,
        copyButton,
        button(iconEl("close"))
            .attr({ title: "关闭" })
            .on("click", () => renderSend("windowClose", [])),
    ]);

const localOcr = idleOcr(async () => {
    const model = await loadOCR(store, store.get("OCR.类型") || defaultOcrId);
    if (!model) return null;
    return {
        runner: await model.ocr.init(model.config),
        release: model.release,
    };
});
ele("style")
    .add(
        noI18n(`
.live-copy-menu[popover] { inset:auto;margin:0;padding:4px;border:1px solid light-dark(#0002,#fff2);border-radius:6px;background:light-dark(#f7f7f7,#2c2c2c);color:light-dark(#191919,#fafafa);max-width:100vw;max-height:100vh;overflow:auto; }
.live-copy-menu:popover-open { display:grid;gap:2px; }
.live-copy-menu button { display:flex;align-items:center;gap:8px;width:auto;min-height:28px;padding:2px 8px;border:0;background:transparent; }
.live-copy-menu button:enabled:hover {background:light-dark(#0001,#fff2)}
.live-copy-menu button:disabled {opacity:.4}
.live-translation-bar {
    display: flex;
    gap: 2px;
    align-items: center;
    padding: 3px;
    max-width: 100%;
    flex-wrap: wrap;
    border: 1px solid light-dark(#0002, #fff2);
    border-radius: 6px;
    background: light-dark(#f7f7f7, #2c2c2c);
    box-shadow: 0 1px 3px #0002;
    color-scheme: light dark;
}
.live-translation-bar button {
    appearance: none;
    background: transparent;
    border: 0;
    outline: 0;
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 4px;
}
.live-translation-bar button:hover,
.live-translation-bar button[aria-pressed="true"] {
    background: light-dark(#0001, #fff2);
}
.live-translation-bar button:focus-visible {
    outline: 2px solid Highlight;
}
.live-compare {
    box-sizing: border-box;
    width: 100vw;
    height: 100vh;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1px;
    background: light-dark(#dedede, #444);
    color-scheme: light dark;
}
.live-compare[hidden] {
    display: none;
}
.live-compare > div {
    min-width: 0;
    overflow: auto;
    background: light-dark(#fafafa, #252525);
    color: light-dark(#202020, #f6f6f6);
    padding: 6px;
}
.live-compare canvas {
    width: 100%;
    height: 100%;
    object-fit: contain;
}
.live-compare-text {
    white-space: pre-wrap;
    font:
        14px / 1.6 "Segoe UI Variable Text",
        "Segoe UI",
        "Microsoft YaHei UI",
        sans-serif;
    user-select: text;
    overflow-wrap: anywhere;
}
`),
    )
    .addInto(document.head);
const comparisonText = view().class("live-compare-text");
const comparison = view()
    .class("live-compare")
    .add([view().add(cropCanvas), comparisonText]);
comparison.el.hidden = true;
const mainEl = view().style({
    position: "absolute",
    overflow: "hidden",
    width: "100vw",
    height: "100vh",
});
const textEl = view().style({
    position: "relative",
    // @ts-ignore
    "-webkit-app-region": "drag",
    width: "100vw",
    height: "100vh",
    background: bgColor,
    color: textColor,
});
mainEl.add([textEl, comparison]);

mainEl.addInto();

mainEl.add(toolsEl);

renderOn("translatorInit", ([id, _display, _rect]) => {
    display = _display;
    screenId = id;
    rect = _rect;
    void refresh();
});
