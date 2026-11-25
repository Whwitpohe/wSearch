import { addClass, button, type ElType, image, pack, view } from "dkh-ui";
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
import { defaultOcrId, loadOCR } from "../ocr/ocr";
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
    if (!OCR) return;
    const data = await screenshot(screenId, rect);
    if (!data) return;
    document.body.style.opacity = "1";

    const ocrData = await OCR.ocr(data);

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
    await translate(textL);
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
    .class(Class.smallSize, Class.screenBar)
    .add([
        playEl,
        runEl,
        button(iconEl("copy"))
            .attr({ title: "复制" })
            .on("click", () => {
                const text = textEl.el.innerText;
                writeText(text);
            }),
        button(iconEl("close"))
            .attr({ title: "关闭" })
            .on("click", () => renderSend("windowClose", [])),
    ]);

let OCR: Awaited<ReturnType<typeof import("esearch-ocr").init>> | null = null;

const ocrX = loadOCR(store, store.get("OCR.类型") || defaultOcrId);

OCR = ocrX ? await ocrX.ocr.init(ocrX.config) : null;

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
mainEl.add([textEl]);

mainEl.addInto();

mainEl.add(toolsEl);

renderOn("translatorInit", ([id, _display, _rect]) => {
    display = _display;
    screenId = id;
    rect = _rect;
    void refresh();
});
