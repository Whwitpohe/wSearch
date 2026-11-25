import { matchFitLan } from "xtranslator";
import { Class, cssColor, getImgUrl, initStyle, setTitle } from "../root/root";

const fs = require("node:fs") as typeof import("fs");

import {
    button,
    ele,
    frame,
    image,
    p,
    pack,
    pText,
    spacer,
    txt,
    view,
} from "dkh-ui";

import store from "../../../lib/store/renderStore";
import { t } from "../../../lib/translate/translate";
import type { IconType } from "../../iconTypes";
import { writeText } from "../lib/clipboard";
import { getEngineLans, getTranslators } from "../lib/translate";

initStyle(store);

setTitle(t("翻译"));

function iconButton(img: IconType) {
    return button(image(getImgUrl(`${img}.svg`), "icon").class("icon"));
}

pack(document.body)
    .class("translation-window")
    .style({
        display: "flex",
        flexDirection: "column",
        height: "100vh",
    })
    .class(Class.gap);

const input = ele("textarea")
    .class("translation-source")
    .attr({ ariaLabel: t("原文"), placeholder: t("输入要翻译的文字") })
    .style({
        width: "100%",
        padding: "8px",
        border: "none",
        // @ts-ignore
        "field-sizing": "content",
        "min-height": "4lh",
        maxHeight: "50%",
        outline: "none",
        transition: "none",
        flexShrink: 0,
    });
const lans = view("x")
    .class("translation-languages")
    .style({
        justifyContent: "center",
    })
    .class(Class.gap);

const setLan = (el: HTMLSelectElement, lan: string) => {
    const supportLans = Array.from(el.querySelectorAll("option")).map(
        (i) => i.value,
    );
    const matchLan = matchFitLan(lan, supportLans) ?? supportLans[0];
    el.value = matchLan;
};

const lansFrom = ele("select")
    .attr({ title: "原文语言" })
    .on("change", () => {
        ++inputRevision;
        clearTimeout(lastTrans);
        translate(input.el.value);
    })
    .bindGet((el) => el.value)
    .bindSet((lan: string, el) => setLan(el, lan));
const lansTo = ele("select")
    .attr({ title: "译文语言" })
    .on("change", () => {
        ++inputRevision;
        clearTimeout(lastTrans);
        translate(input.el.value);
    })
    .bindGet((el) => el.value)
    .bindSet((lan: string, el) => setLan(el, lan));

const results = view("y").class("translation-results").style({
    gap: "16px",
    padding: "8px",
    overflow: "auto",
});

lans.add([lansFrom, ele("span").attr({ ariaHidden: "true" }).add("→"), lansTo]);

input.addInto();
lans.addInto();
results.addInto();

type saveData = {
    from: string;
    to: string;
    fromT: string;
    toT: string;
    engine: string;
};

function translate(_text: string) {
    results.clear();
    const text = _text.trim();
    if (!fyq.length) {
        results.add(p(t("请在设置添加翻译器")));
        return;
    }
    if (!text) return;

    const fromLan = lansFrom.gv;
    const toLan = lansTo.gv;

    for (const i of fyq) {
        const copy = iconButton("copy").attr({ title: "复制" });
        const save = iconButton("star")
            .attr({ title: "收藏" })
            .style({
                display:
                    showCang.fetch.length || showCang.文件.length ? "" : "none",
            });
        const reTry = iconButton("reload")
            .attr({ title: "翻译" })
            .on("click", () => {
                f();
            });
        const checkEl = iconButton("replace")
            .attr({ title: "反向翻译" })
            .style({
                display: fromLan === "auto" ? "none" : "", // todo 读取自动语言
            });
        const e = frame(`result${i.id}`, {
            _: view().class("translation-result").style({ width: "100%" }),
            title: {
                _: view("x")
                    .style({ "align-items": "center" })
                    .class(Class.smallSize)
                    .class(Class.gap),
                copy,
                save,
                reTry,
                checkEl,
                _spacer: spacer(),
                name: txt(i.name).style({ opacity: 0.5 }),
            },
            content: pText(""),
            reTrans: pText("").style({
                marginBlockStart: "8px",
                color: cssColor.font.light,
            }),
        });
        results.add(e.el);
        const c = e.els.content;
        let attempt = 0;
        const f = () => {
            const current = ++attempt;
            c.el.onclick = null;
            e.els.reTrans.sv("");
            const ff = fanyiqi.get(i.id);
            if (!ff) throw `翻译器"${i.id}"不存在`;
            ff
                // @ts-ignore
                .run(text, fromLan, toLan)
                .then((_ttext: string) => {
                    if (current !== attempt || !e.el.el.isConnected) return;
                    e.el.style({ order: 0 });
                    const ttext = _ttext.trim();
                    c.sv(ttext);
                    copy.el.onclick = () => writeText(ttext);
                    save.el.onclick = () => {
                        saveW({
                            from: fromLan,
                            to: toLan,
                            fromT: text,
                            toT: ttext,
                            engine: i.name,
                        });
                    };
                    checkEl.el.onclick = async () => {
                        const t = await ff
                            // @ts-ignore
                            .run(ttext, toLan, fromLan);
                        if (current === attempt) e.els.reTrans.sv(t);
                    };
                })
                .catch((err: Error) => {
                    if (current !== attempt || !e.el.el.isConnected) return;
                    console.error(err);
                    e.el.style({ order: 1 });
                    if (err.message.includes("[1]")) {
                        c.sv(
                            `${t("不支持输入语言")} ${getLansName([fromLan])[0].text}`,
                        );
                    } else if (err.message.includes("[2]")) {
                        c.sv(
                            `${t("不支持输出语言")} ${getLansName([toLan])[0].text}`,
                        );
                    } else if (i.type === "bergamot") {
                        c.sv(err.message);
                    } else
                        c.sv(t("翻译失败，请重试，点击查看错误信息")).on(
                            "click",
                            () => {
                                c.sv(String(err));
                            },
                            { once: true },
                        );
                });
        };
        f();
    }
    const cl = c常用语言.filter((i) => i !== fromLan && i !== toLan);
    store.set(
        "翻译.常用语言",
        [toLan, fromLan, ...cl].filter((i) => i !== "auto").slice(0, 5),
    );
}

function saveW(obj: saveData) {
    try {
        saveFile(obj);
    } catch (error) {
        console.error("保存到文件失败", error);
    }
    try {
        saveFetch(obj);
    } catch (error) {
        console.error("保存到网络失败", error);
    }
    // todo 提示
}

function saveTemplate(t: string, obj: saveData) {
    return t
        .replaceAll("${from}", obj.from)
        .replaceAll("${to}", obj.to)
        .replaceAll("${fromT}", obj.fromT)
        .replaceAll("${toT}", obj.toT)
        .replaceAll("${engine}", obj.engine);
}

function saveFile(obj: saveData) {
    const filesx = showCang.文件;
    for (const i of filesx) {
        fs.appendFile(i.path, `\n${saveTemplate(i.template, obj)}`, () => {});
    }
}

function saveFetch(obj: saveData) {
    const webx = showCang.fetch;
    for (const i of webx) {
        fetch(saveTemplate(i.url, obj), {
            method: i.method,
            body: saveTemplate(i.body, obj),
            headers: i.headers,
        });
    }
}

const mainLan = store.get("语言.语言");
const trans = new Intl.DisplayNames(mainLan, { type: "language" });
const languageOrder = new Intl.Collator(mainLan);
function getLansName(l: string[]) {
    const lansName = l.map((i) => ({
        text: i === "auto" ? t("自动") : (trans.of(i) ?? i),
        lan: i,
    }));
    return lansName.toSorted((a, b) => languageOrder.compare(a.text, b.text));
}

function pick2First(list: { text: string; lan: string }[], toPick: string[]) {
    const baseList = list.filter((i) => !toPick.includes(i.lan));
    const first = toPick.map(
        (i) => list.find((j) => j.lan === i) || { text: i, lan: i },
    );
    return first.concat(baseList);
}

async function loadDetector() {
    const { initFastText } = await import("@xushengfeng/fasttext_wasm");
    return (await initFastText()).FastText().loadModel();
}
let detector: ReturnType<typeof loadDetector> | undefined;
let inputRevision = 0;
let lastTrans: ReturnType<typeof setTimeout>;
async function detectAndTranslate(text: string, revision: number) {
    if (!text.trim() || !fyq.length) {
        translate(text);
        return;
    }
    let fromLan = "auto";
    try {
        detector ??= loadDetector().catch((error) => {
            detector = undefined;
            throw error;
        });
        fromLan = (await detector).identify(text)?.alpha2 ?? "auto";
    } catch (error) {
        console.warn("Language detection unavailable", error);
    }
    if (revision !== inputRevision) return;

    const m = matchFitLan(fromLan, c常用语言);
    const toLan =
        c常用语言.filter((i) => i !== m).at(0) ?? store.get("语言.语言");
    lansFrom.sv(fromLan);
    lansTo.sv(toLan);
    translate(text);
}

const inputText = decodeURIComponent(
    new URLSearchParams(location.search).get("text") || "",
).trim();

const fyq = store.get("翻译.翻译器");
const fanyiqi = new Map(
    fyq.map((f) => {
        const e = getTranslators(store, f);
        return [f.id, e];
    }),
);

const showCang = store.get("翻译.收藏");

const allFromLan = Array.from(
    new Set(fyq.flatMap((f) => getEngineLans(f.type)?.lan ?? [])),
);
const allToLan = Array.from(
    new Set(fyq.flatMap((f) => getEngineLans(f.type)?.targetLan ?? [])),
);

console.log("allFromLan", allFromLan);
console.log("allToLan", allToLan);

const c常用语言 = store.get("翻译.常用语言");

lansFrom.add(
    pick2First(getLansName(allFromLan), ["auto", ...c常用语言]).map((v) =>
        ele("option").add(txt(v.text)).attr({ value: v.lan }),
    ),
);
lansTo.add(
    pick2First(getLansName(allToLan), c常用语言).map((v) =>
        ele("option").add(txt(v.text)).attr({ value: v.lan }),
    ),
);

input.el.value = inputText;

lansFrom.sv("auto");
lansTo.sv(mainLan);
if (!fyq.length) {
    lans.el.hidden = true;
    translate("");
} else if (inputText) void detectAndTranslate(inputText, ++inputRevision);

function scheduleTranslation() {
    const revision = ++inputRevision;
    clearTimeout(lastTrans);
    const text = input.el.value;
    if (!text.trim()) {
        translate("");
        return;
    }
    lastTrans = setTimeout(() => void detectAndTranslate(text, revision), 2000);
}
input
    .on("compositionstart", () => {
        ++inputRevision;
        clearTimeout(lastTrans);
    })
    .on("compositionend", scheduleTranslation)
    .on("input", (event) => {
        if (!(event as InputEvent).isComposing) scheduleTranslation();
    });
