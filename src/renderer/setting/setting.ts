import {
    a,
    addClass,
    addStyle,
    check,
    button as dkhButton,
    dynamicList,
    dynamicSelect,
    type ElType,
    ele,
    image,
    input,
    label,
    noI18n,
    p,
    pack,
    radioGroup,
    select,
    setProperties,
    setProperty,
    setTranslate,
    spacer,
    textarea,
    trackPoint,
    txt,
    view,
} from "dkh-ui";
import { Remarkable } from "remarkable";
import {
    fetchAppReleases,
    projectUrl,
    releasePage,
    releasePath,
} from "../../../lib/appRelease";
import {
    captureTools,
    clipDrawTools,
    isDrawingAction,
    selectionTools,
} from "../../../lib/captureTools";
import {
    endpoints,
    listModels,
    type Model,
    type Provider,
    providerOf,
} from "../../../lib/modelApi";
import type { GetValue, SettingPath } from "../../../lib/store/renderStore";
import store from "../../../lib/store/renderStore";
import {
    lanes,
    type ToolbarLane,
    type ToolbarLayout,
    toolbarLayout,
} from "../../../lib/toolbarLayout";
import { getLanName, getLans, lan, t } from "../../../lib/translate/translate";
import type {
    GithubUrlType,
    SelectionAction,
    setting,
    功能,
} from "../../ShareTypes";
import { colorPicker } from "../lib/colorPicker";
import { alert, confirm } from "../lib/messageDialog";
import {
    BERGAMOT_LANGS,
    BergamotTranslator,
    getEngineLans,
    getTranslators,
    ModelTranslator,
} from "../lib/translate";
import {
    Class,
    cssColor,
    cssVar,
    getImgUrl,
    initStyle,
    monoFont,
    setTitle,
} from "../root/root";

const { shell, webUtils } = require("electron") as typeof import("electron");
const path = require("node:path") as typeof import("path");
const os = require("node:os") as typeof import("os");
const fs = require("node:fs") as typeof import("fs");

import Fuse from "fuse.js";
import { hexToCSSFilter } from "hex-to-css-filter";
import translator, { matchFitLan } from "xtranslator";
import logoBlack from "../../../assets/logo/bw/32x32_black.png";
import logoWhite from "../../../assets/logo/bw/32x32_white.png";
import _package from "../../../package.json?raw";
import logo from "../assets/icon.svg";
import testPhoto from "../assets/sample_picture.svg";

const packageJson = JSON.parse(_package);

import { githubMirrorList } from "../../../lib/github_mirror";
import {
    renderInvoke,
    renderOn,
    renderSend,
    renderSendSync,
} from "../../../lib/ipc";
import {
    ele2jsKeyCode,
    jsKey2ele,
    jsKeyCodeDisplay,
    macKeyFomat,
} from "../../../lib/key.js";
import { xget, xset } from "../../../lib/store/parse";
import time_format from "../../../lib/time_format";
import { safeJSONParse, tryD, tryx } from "../../../lib/utils";
import type { IconType, RawIconType } from "../../iconTypes";
import { runAI } from "../lib/ai";
import { isDeepStrictEqual } from "../lib/isDeepStrictEqual";
import { defaultOcrId } from "../ocr/ocr";
import { ocrList } from "../ocr/ocr_omni";

let yauzl: typeof import("yauzl") | null = null;

export { isDeepStrictEqual };

type Engines = keyof typeof translator.e | "llm" | "bergamot";

type JustElmentK =
    | "_autostart"
    | "_qsq"
    | "_theme"
    | "_filename"
    | "_clear_history"
    | "_clear_browswer"
    | "_setting_file"
    | "_default_setting"
    | "_location"
    | "_logs"
    | "_inpaint"
    | "_version"
    | "_exit";

type KeyPath = JustElmentK | SettingPath;

type settingItem<t extends SettingPath> = {
    [key in t]: {
        name: string;
        desc?: string;
        el: (value: GetValue<setting, key>) => ElType<HTMLElement>;
    };
};

function button(content?: Parameters<typeof dkhButton>[0]) {
    return dkhButton(content).class("settings-btn");
}

const oldStore = store.getAll();
const nowStore = structuredClone(oldStore);
const nowStoreK = new Set<SettingPath>();

let defaultSetting: null | setting = null;

const settingMemKey = "设置记忆";

const mainLan = getSet("语言.语言");
const displayLan = new Intl.DisplayNames(mainLan, {
    type: "language",
});

const tools = captureTools.map((tool) => ({
    ...tool,
    title: t(tool.title),
    icon: getImgUrl(`${tool.icon}.svg`),
}));

function getToolsN(k: 功能) {
    return (tools.find((i) => i.key === k) as (typeof tools)[0]).title;
}

const drawTools = clipDrawTools.map((i) => ({
    key: i.key,
    icon: i.icon ? getImgUrl(`${i.icon}.svg` as RawIconType) : undefined,
    title: t(i.title),
}));

function drawingShortcutPath(key: string) {
    const [group, tool] = key.split(".");
    return `截屏编辑快捷键.${group}.副.${tool}` as Extract<
        SettingPath,
        `截屏编辑快捷键.${string}.副.${string}`
    >;
}
function drawingShortcutKeys(group: "draw" | "shape" | "filter") {
    return clipDrawTools
        .filter((t) => t.key.startsWith(`${group}.`))
        .map((t) => drawingShortcutPath(t.key));
}

const s: Partial<settingItem<SettingPath>> = {
    工具栏跟随: {
        name: "工具栏跟随",
        el: (v) =>
            xSelect<typeof v>(
                [{ value: "展示内容优先" }, { value: "效率优先" }],
                "工具栏跟随",
            ),
    },
    "工具栏.按钮大小": {
        name: "按钮大小",
        el: () => xNumber("px", { min: 4 }),
    },
    "工具栏.按钮图标比例": {
        name: "图标比例",
        el: () => xNumber("", { min: 0.01, max: 1, step: 0.01 }),
    },
    "工具栏.布局": {
        name: "按钮显示和排序",
        desc: "拖动按钮排序。放入“更多”的按钮只在展开时显示，放入“隐藏”的按钮不显示。",
        el: () => sortTool().class(blockSetting),
    },
    "工具栏.初始位置": {
        name: "工具栏位置",
        el: (v) => {
            const panel = view().class(blockSetting, "position-editor");
            const left = input().attr({ spellcheck: false }),
                top = input().attr({ spellcheck: false });
            const presets = view("x")
                .class("position-presets")
                .attr({ role: "group", ariaLabel: t("工具栏位置") });
            const leftPreset = button("左上"),
                rightPreset = button("右上");
            const marker = view().class("position-marker");
            const screen = view()
                .class("position-map")
                .attr({ ariaHidden: "true" })
                .add(marker);
            const horizontal = field("距左侧", left),
                vertical = field("距顶部", top);
            let right = false;
            function refresh() {
                leftPreset.el.setAttribute("aria-pressed", String(!right));
                rightPreset.el.setAttribute("aria-pressed", String(right));
                horizontal.el.querySelector("label")!.textContent = t(
                    right ? "距右侧" : "距左侧",
                );
                const offset = (css: string, size: number) => {
                    const value = parseFloat(css);
                    if (!Number.isFinite(value)) return 0;
                    return Math.max(
                        0,
                        Math.min(
                            1,
                            css.endsWith("%") || /v[wh]$/.test(css)
                                ? value / 100
                                : value / size,
                        ),
                    );
                };
                const x = Math.min(
                    86,
                    offset(left.gv, window.screen.width) * 100,
                );
                marker.style({
                    left: `${right ? 86 - x : x}%`,
                    top: `${Math.min(62, offset(top.gv, window.screen.height) * 100)}%`,
                });
            }
            function changed() {
                refresh();
                if (
                    CSS.supports("left", left.gv) &&
                    CSS.supports("top", top.gv)
                )
                    panel.el.dispatchEvent(new CustomEvent("input"));
            }
            leftPreset.on("click", () => {
                right = false;
                changed();
            });
            rightPreset.on("click", () => {
                right = true;
                changed();
            });
            left.on("input", changed);
            top.on("input", changed);
            panel.add([
                screen,
                view("y")
                    .class("position-fields")
                    .add([
                        presets.add([leftPreset, rightPreset]),
                        view()
                            .class("position-coordinates")
                            .add([horizontal, vertical]),
                    ]),
            ]);
            return panel
                .bindGet(() => ({
                    left: right
                        ? `calc(100vw - var(--bar-size) * 2 - 8px - ${left.gv})`
                        : left.gv,
                    top: top.gv,
                }))
                .bindSet((value: typeof v) => {
                    const stored =
                        /^calc\(100vw - var\(--bar-size\) \* 2 - 8px - (.+)\)$/.exec(
                            value.left,
                        );
                    const legacy =
                        /^calc\(100vw - 10px - [\d.]+(?:px)? \* 2 - 8px\)$/.test(
                            value.left,
                        ) ||
                        value.left ===
                            "calc(100vw - var(--bar-size) * 2 - 18px)";
                    right = Boolean(stored || legacy);
                    left.sv(stored?.[1] ?? (legacy ? "10px" : value.left));
                    top.sv(value.top);
                    refresh();
                });
        },
    },
    "工具栏.稍后出现": {
        name: "稍后出现",
        desc: "截屏时，工具栏和绘制栏都会隐藏，直到调整完框选",
        el: () => xSwitch(),
    },
    "鼠标跟随栏.显示": {
        name: "显示鼠标跟随栏",
        el: () => xSwitch(),
    },
    "取色器.显示": {
        name: "显示取色器",
        el: () => xSwitch(),
    },
    "取色器.大小": {
        name: "取色器大小",
        el: () => xNumber("", { min: 1, step: 2 }),
    },
    "取色器.像素大小": {
        name: "取色器像素大小",
        el: () => xNumber("px", { min: 1 }),
    },
    "取色器.默认格式": {
        name: "取色器默认格式",
        el: () =>
            xSelect(
                [
                    { value: "HEX", name: noI18n("HEX") },
                    { value: "RGB", name: noI18n("rgb") },
                    { value: "HSL", name: noI18n("hsl") },
                    { value: "HSV", name: noI18n("hsv") },
                    { value: "HWB", name: noI18n("hwb") },
                    { value: "LAB", name: noI18n("lab") },
                    { value: "LCH", name: noI18n("lch") },
                    { value: "OKLAB", name: noI18n("Oklab") },
                    { value: "OKLCH", name: noI18n("Oklch") },
                    { value: "CMYK", name: noI18n("CMYK") },
                ],
                "取色器默认格式",
            ),
    },
    "框选.颜色.遮罩": {
        name: "遮罩颜色",
        el: () => xColor(),
    },
    显示四角坐标: {
        name: "显示四角坐标",
        desc: "截屏框选附近除了框选大小，还会加上左上角和右下角坐标",
        el: () => xSwitch(),
    },
    框选后默认操作: {
        name: "框选后默认操作",
        desc: "框选完鼠标松开一瞬间，执行操作",
        el: () =>
            actionPicker<SelectionAction | "no">(
                () => [
                    {
                        value: "no",
                        name: t("无"),
                        group: t("框选后默认操作"),
                        icon: "close",
                    },
                    ...actionChoices(false),
                ],
                "no",
            ).class("post-action-picker"),
    },
    "框选.识别窗口": {
        name: "识别窗口",
        desc: "如果启用记忆框选，则不生效，除非按[S]键重新启用",
        el: () => xSwitch(),
    },
    "框选.自动框选.图像识别": {
        name: "框选图像识别",
        desc: "使用算法自动识别边缘轮廓",
        el: () => xSwitch(),
    },
    "框选.自动框选.最小阈值": {
        name: "最小阈值",
        el: () => xNumber("", { min: 0, max: 255 }),
    },
    "框选.自动框选.最大阈值": {
        name: "最大阈值",
        el: () => xNumber("", { min: 0, max: 255 }),
    },
    "框选.记忆.开启": {
        name: "记住框选大小",
        desc: "开启后默认不启用自动框选，除非按[S]键重新启用",
        el: () => xSwitch(),
    },
    "框选.参考线.选区": {
        name: "框选参考线",
        el: (_V) => {
            function x() {
                return input()
                    .bindSet((v: number[], el) => {
                        el.value = v.join(", ");
                        i();
                    })
                    .bindGet((el) =>
                        el.value
                            .split(/[,，]/)
                            .filter(Boolean)
                            .map((i) => Number(i)),
                    )
                    .on("input", i);
            }
            function i() {
                el.el.dispatchEvent(new CustomEvent("input"));
            }
            const xEl = x();
            const yEl = x();
            const el = xGroup("y")
                .class(blockSetting)
                .add([
                    xEl,
                    yEl,
                    xGroup("x").add([
                        button(txt("无")).on("click", () => {
                            xEl.sv([]);
                            yEl.sv([]);
                        }),
                        button(txt("九宫格")).on("click", () => {
                            const v = 0.333;
                            xEl.sv([v, 1 - v]);
                            yEl.sv([v, 1 - v]);
                        }),
                        button(txt("黄金比例")).on("click", () => {
                            const v = 0.618;
                            xEl.sv([v, 1 - v]);
                            yEl.sv([v, 1 - v]);
                        }),
                    ]),
                ])
                .bindGet(() => ({
                    x: xEl.gv,
                    y: yEl.gv,
                }))
                .bindSet((v: typeof _V) => {
                    xEl.sv(v.x);
                    yEl.sv(v.y);
                });
            return el;
        },
    },
    "框选.颜色.选区参考线": {
        name: "框选参考线颜色",
        el: () => xColor(),
    },
    "框选.参考线.光标": { name: "光标参考线", el: () => xSwitch() },
    "框选.颜色.光标参考线": { name: "光标参考线颜色", el: () => xColor() },
    "快速截屏.模式": {
        name: "快速截屏模式",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "clip", name: "剪贴板" },
                    { value: "path", name: "目录" },
                ],
                "快速截屏模式",
            ),
    },
    "快速截屏.路径": { name: "快速截屏路径", el: () => xPath(true) },
    "连拍.数": {
        name: "单次连拍数量",
        el: () => xNumber("", { min: 2, max: 25 }),
    },
    "连拍.间隔": {
        name: "连拍间隔时间",
        el: () => xNumber("ms", { min: 10, max: 1000 }),
    },
    "广截屏.模式": {
        name: "广截屏模式",
        el: (v) =>
            xSelect<typeof v>(
                [{ value: "自动" }, { value: "定时" }],
                "广截屏模式",
            ),
    },
    "广截屏.显示模式": {
        name: "广截屏显示模式",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "自动", name: "自动" },
                    { value: "覆盖", name: "覆盖" },
                    { value: "紧凑", name: "紧凑" },
                ],
                "广截屏显示模式",
            ),
    },
    "广截屏.t": {
        name: "广截屏定时间隔",
        el: () => xNumber("ms", { min: 10 }),
    },
    "鼠标快捷键.右键": {
        name: "鼠标右键",
        el: (v) =>
            xSelect<typeof v>(
                [{ value: "取色器" }, { value: "关闭" }],
                "鼠标右键",
            ),
    },
    "鼠标快捷键.双击": {
        name: "鼠标双击",
        el: (v) =>
            xSelect<typeof v>(
                [{ value: "复制" }, { value: "保存" }],
                "鼠标双击",
            ),
    },
    "图像编辑.复制偏移.x": {
        name: "复制偏移x轴",
        el: () => xNumber("px", { min: -50, max: 50 }),
    },
    "图像编辑.复制偏移.y": {
        name: "复制偏移y轴",
        el: () => xNumber("px", { min: -50, max: 50 }),
    },
    "OCR.类型": {
        name: "OCR类型",
        el: () => xSelect(ocrList(store), "OCR类型"),
    },
    "OCR.离线切换": {
        name: "OCR离线切换",
        desc: "离线时切换离线OCR",
        el: () => xSwitch(),
    },
    "OCR.识别段落": {
        name: "识别段落",
        desc: "通过排版识别算法分析段落和阅读顺序，如果遇到错误的段落顺序，可以尝试关闭",
        el: () => xSwitch(),
    },
    "OCR.整体方向识别": {
        name: "整体方向识别",
        desc: "识别整体方向并纠正，不适合竖排文字",
        el: () => xSwitch(),
    },
    "OCR.全局det路径": {
        name: "全局检测模型路径",
        desc: "所有离线OCR模型共用的检测模型路径，留空使用默认模型",
        el: () => xPath(false),
    },
    离线OCR: {
        name: "离线OCR",
        el: () => ocrEl(),
    },
    "在线OCR.baidu.url": {
        name: "百度OCR类型",
        desc: "位置版不起实质效果，但可以扩充免费使用次数:)",
        el: () =>
            xSelect(
                [
                    {
                        value: "https://aip.baidubce.com/rest/2.0/ocr/v1/general",
                        name: "标准含位置版",
                    },
                    {
                        value: "https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic",
                        name: "标准版",
                    },
                    {
                        value: "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate",
                        name: "高精度含位置版",
                    },
                    {
                        value: "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic",
                        name: "高精度版",
                    },
                    {
                        value: "https://aip.baidubce.com/rest/2.0/ocr/v1/formula",
                        name: "公式",
                    },
                    {
                        value: "https://aip.baidubce.com/rest/2.0/ocr/v1/handwriting",
                        name: "手写文字",
                    },
                    {
                        value: "https://aip.baidubce.com/rest/2.0/ocr/v1/table",
                        name: "表格",
                    },
                ],
                "百度OCR类型",
            ),
    },
    "在线OCR.baidu.id": {
        name: "API Key",
        el: () => xSecret(),
    },
    "在线OCR.baidu.secret": {
        name: "Secret Key",
        el: () => xSecret(),
    },
    "在线OCR.youdao.id": {
        name: "应用ID",
        el: () => xSecret(),
    },
    "在线OCR.youdao.secret": {
        name: "应用秘钥",
        el: () => xSecret(),
    },
    "AI.运行后端": {
        name: "运行后端",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "cpu", name: noI18n("CPU") },
                    { value: "webgpu", name: noI18n("WebGPU") },
                    ...(process.platform === "linux"
                        ? [{ value: "cuda" as const, name: noI18n("CUDA") }]
                        : []),
                    ...(process.platform === "darwin"
                        ? [{ value: "coreml" as const, name: noI18n("coreML") }]
                        : []),
                    ...(process.platform === "win32"
                        ? [
                              {
                                  value: "directml" as const,
                                  name: noI18n("DirectML"),
                              },
                          ]
                        : []),
                ],
                "运行后端",
            ),
    },
    "AI.在线模型": {
        name: "在线模型",
        el: (v) => sortList<(typeof v)[0]>((v) => v.name, modelDialog),
    },
    "录屏.提示.键盘.开启": {
        name: "录屏键盘提示",
        el: () => xSwitch(),
    },
    "录屏.提示.键盘.位置": {
        name: "键盘提示位置",
        el: (v) => {
            let nv: typeof v = { x: "+", y: "-", offsetX: 0, offsetY: 0 };
            const screenKeyTipEl = view().style({
                width: "500px",
                height: "200px",
                outline: `1px dashed ${cssColor.b}`,
                position: "relative",
            });
            const screenKeyTipKBD = view()
                .style({ position: "absolute", cursor: "move" })
                .add([
                    ele("kbd").add(noI18n("Ctrl")),
                    ele("kbd").add(noI18n("Shift")),
                    ele("kbd").add(noI18n("I")),
                ])
                .addInto(screenKeyTipEl);

            function setKeyTip() {
                const posi = nv;
                const px = posi.x === "+" ? "right" : "left";
                const py = posi.y === "+" ? "bottom" : "top";
                for (const x of ["left", "right", "top", "bottom"] as const) {
                    screenKeyTipKBD.el.style[x] = "";
                }
                screenKeyTipKBD.style({
                    [px]: `${posi.offsetX}px`,
                    [py]: `${posi.offsetY}px`,
                    fontSize: `${getSet("录屏.提示.键盘.大小") * 16}px`,
                });
            }

            trackPoint(screenKeyTipKBD, {
                start: () => {
                    return {
                        x: 0,
                        y: 0,
                        data: screenKeyTipEl.el.getBoundingClientRect(),
                    };
                },
                ing: (_p, e, { startData: pr }) => {
                    const x = (e.clientX - pr.left) / pr.width;
                    const y = (e.clientY - pr.top) / pr.height;
                    nv.x = x < 0.5 ? "-" : "+";
                    nv.y = y < 0.5 ? "-" : "+";
                    setKeyTip();
                },
                end: () => {
                    screenKeyTipEl.el.dispatchEvent(new CustomEvent("input"));
                },
            });

            return view()
                .class(blockSetting)
                .add(screenKeyTipEl)
                .bindGet(() => nv)
                .bindSet((v) => {
                    nv = v;
                    setKeyTip();
                });
        },
    },
    "录屏.提示.键盘.位置.offsetX": {
        name: "键盘提示偏移x",
        el: () => xNumber("px", { min: 0 }),
    },
    "录屏.提示.键盘.位置.offsetY": {
        name: "键盘提示偏移y",
        el: () => xNumber("px", { min: 0 }),
    },
    "录屏.提示.键盘.大小": {
        name: "键盘提示大小",
        el: () => xNumber("", { min: 0.25, max: 5, step: 0.25 }),
    },
    "录屏.提示.鼠标.开启": {
        name: "鼠标按键提示",
        el: () => xSwitch(),
    },
    "录屏.提示.光标.开启": {
        name: "开启光标提示",
        el: () => xSwitch(),
    },
    "录屏.提示.光标.样式": {
        name: "光标提示样式",
        el: () => ele("textarea").class(blockSetting),
    },
    "录屏.摄像头.开启": {
        name: "开启摄像头",
        el: () => xSwitch(),
    },
    "录屏.摄像头.镜像": {
        name: "镜像",
        el: () => xSwitch(),
    },
    "录屏.摄像头.背景.模式": {
        name: "摄像头背景",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "none", name: "正常" },
                    { value: "hide", name: "隐藏" },
                    { value: "blur", name: "模糊" },
                    { value: "img", name: "图片" },
                    { value: "video", name: "视频" },
                ],
                "摄像头背景",
            ),
    },
    "录屏.摄像头.背景.模糊": {
        name: "背景模糊程度",
        el: () => xNumber("px", { min: 1 }),
    },
    "录屏.摄像头.背景.imgUrl": { name: "背景图片路径", el: () => xPath(false) },
    "录屏.摄像头.背景.videoUrl": {
        name: "背景视频路径",
        el: () => xPath(false),
    },
    "录屏.摄像头.背景.fit": {
        name: "图片或视频填充模式",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "cover", name: "裁剪适应" },
                    { value: "fit", name: "拉伸填充" },
                ],
                "图片或视频填充模式",
            ),
    },
    "录屏.音频.启用系统内录": {
        name: "系统内录",
        desc: "开启才可以在界面进一步选择是否内录",
        el: () => xSwitch(),
    },
    "录屏.转换.码率": {
        name: "码率",
        el: () => xNumber("Mbps"),
    },
    "录屏.转换.帧率": {
        name: "帧率",
        el: () => xNumber("fps"),
    },
    "录屏.超级录屏.编码选择": {
        name: "编码选择",
        desc: "视具体硬件支持",
        el: (v) =>
            xSelect<typeof v>(
                [{ value: "性能优先" }, { value: "内存优先" }],
                "编码选择",
            ),
    },
    "录屏.超级录屏.关键帧间隔": {
        name: "关键帧间隔",
        desc: "越小处理速度越快，但会增加内存占用",
        el: () => xNumber("", { max: 500, min: 1 }),
    },
    "录屏.超级录屏.导出后关闭": {
        name: "导出后关闭",
        el: () => xSwitch(),
    },
    "保存名称.前缀": {
        name: "文件名称前缀",
        el: () => input(),
    },
    "保存名称.时间": {
        name: "文件名称时间",
        el: () => input(),
    },
    "保存名称.后缀": {
        name: "文件名称后缀",
        el: () => input(),
    },
    // 代码提示
    "保存.默认格式": {
        name: "截屏默认格式",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "png", name: "PNG" },
                    { value: "jpg", name: "JPG" },
                    { value: "webp", name: "WebP" },
                    { value: "bmp", name: "BMP" },
                    { value: "avif", name: "AVIF" },
                ],
                "截屏默认格式",
            ),
    },
    "保存.保存并复制": {
        name: "保存并复制",
        el: () => xSwitch(),
    },
    "保存.复制为文件": {
        name: "复制为文件",
        desc: "复制图片时写入缓存文件，可粘贴到文件夹，不再复制为图片",
        el: () => xSwitch(),
    },
    "保存.快速保存": {
        name: "快速保存",
        desc: "按下保存键后，默认保存到上次保存的位置，无需选择",
        el: () => xSwitch(),
    },
    "贴图.窗口.独立窗口": {
        name: "独立窗口",
        desc: "每个贴图使用独立的系统窗口，修改后对新贴图生效",
        el: () => xSwitch(),
    },
    "贴图.窗口.双击": {
        name: "双击",
        desc: "设定双击窗口行为",
        el: (v) =>
            xSelect<typeof v>(
                [{ value: "归位" }, { value: "关闭" }],
                "设定双击窗口行为",
            ),
    },
    "贴图.窗口.变换": {
        name: "窗口变换",
        desc: "为贴图添加如翻转、模糊等变换，通过数字键0-9切换",
        el: (v) =>
            sortList<(typeof v)[0]>(
                (v) => v.split("\n").at(0) ?? "",
                (v, m) => {
                    const { promise, resolve } =
                        Promise.withResolvers<typeof v>();

                    const sample = () =>
                        image(logo, noI18n("wSearch")).class(
                            "transform-sample",
                        );
                    const effect = sample();
                    const code = textarea()
                        .attr({
                            spellcheck: false,
                            placeholder: "transform: rotate(0deg);",
                        })
                        .class("transform-code")
                        .sv(v ?? "");
                    function update() {
                        effect.el.style.cssText = code.gv;
                    }
                    code.on("input", update);
                    update();
                    const comparison = view().class("transform-compare");
                    for (const [caption, graphic] of [
                        ["原图", sample()],
                        ["效果预览", effect],
                    ] as const) {
                        comparison.add(
                            view("y")
                                .class("transform-tile")
                                .add([
                                    txt(caption),
                                    view()
                                        .class("transform-stage")
                                        .add(graphic),
                                ]),
                        );
                    }
                    const refs = view("x", "wrap")
                        .class("transform-links")
                        .add([
                            txt("参考"),
                            a(
                                "https://developer.mozilla.org/zh-CN/docs/Web/CSS/transform",
                            ).add(noI18n("transform")),
                            a(
                                "https://developer.mozilla.org/zh-CN/docs/Web/CSS/filter",
                            ).add(noI18n("filter")),
                            a(
                                "https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_filters",
                            ).add(noI18n("SVG filters")),
                        ]);
                    dialogB(
                        m,
                        [comparison, field("CSS", code, true), refs],
                        () => resolve(null),
                        () => resolve(code.gv),
                    );

                    return promise;
                },
            ),
    },
    "贴图.窗口.提示": {
        name: "提示",
        desc: "使用阴影提示贴图窗口",
        el: () => xSwitch(),
    },
    "贴图.动态.帧率": {
        name: "动态贴图帧率",
        desc: "窗口视频流的帧率",
        el: () => xNumber("fps", { min: 1, max: 60 }),
    },
    "贴图.动态.最大数量": {
        name: "动态贴图数量上限",
        desc: "同时存在的动态贴图数量，超过后不再创建",
        el: () => xNumber("", { min: 1, max: 32 }),
    },
    "翻译.翻译器": {
        name: "翻译引擎",
        desc: "适用于屏幕翻译和搜索翻译，第一个为默认引擎",
        el: (v) =>
            sortList<(typeof v)[0]>(
                (v) => v.name,
                // @ts-ignore
                (el, d) => translatorD(el, d),
            ),
    },
    "翻译.Firefox本地模型": {
        name: "Firefox 本地模型",
        desc: "手动下载 Firefox 本地翻译模型",
        el: () => {
            const el = button(iconEl("down"))
                .on("click", openBergamotDialog)
                .attr({
                    title: t("下载/管理模型"),
                });
            return el;
        },
    },
    "屏幕翻译.语言.from": {
        name: "屏幕翻译语言来源",
        el: () => {
            const firstItem = getSet("翻译.翻译器").at(0);
            const e = getEngineLans(firstItem?.type ?? "");
            if (!e) return select([]);
            const fallback =
                matchFitLan("auto", e.lan) ??
                matchFitLan(getSet("语言.语言") ?? "", e.lan) ??
                matchFitLan("en", e.lan) ??
                e.lan[0] ??
                "";
            const list = select(
                getLansName(e.lan).map((i) => ({
                    value: i.lan,
                    name: noI18n(i.text),
                })),
            );
            return list.bindSet((v: string, el) => {
                el.value = matchFitLan(v, e.lan) ?? fallback;
            });
        },
    },
    "屏幕翻译.语言.to": {
        name: "屏幕翻译语言目标",
        el: () => {
            const firstItem = getSet("翻译.翻译器").at(0);
            const e = getEngineLans(firstItem?.type ?? "");
            if (!e) return select([]);
            const fallback =
                matchFitLan(getSet("语言.语言") ?? "", e.targetLan) ??
                matchFitLan("en", e.targetLan) ??
                e.targetLan[0] ??
                "";
            const list = select(
                getLansName(e.targetLan).map((i) => ({
                    value: i.lan,
                    name: noI18n(i.text),
                })),
            );
            return list.bindSet((v: string, el) => {
                el.value = matchFitLan(v, e.targetLan) ?? fallback;
            });
        },
    },
    "屏幕翻译.dTime": {
        name: "自动屏幕翻译定时",
        el: () => xNumber("ms"),
    },
    "屏幕翻译.color.bg": {
        name: "屏幕翻译背景色",
        el: () => xColor(),
    },
    "屏幕翻译.color.text": {
        name: "屏幕翻译文字颜色",
        el: () => xColor(),
    },
    "翻译.收藏.文件": {
        name: "文件生词本",
        el: (v) =>
            sortList<(typeof v)[0]>(
                (v) => path.basename(v.path),
                (el, d) => w文件生词本Dialog(el, d),
            ),
    },
    "翻译.收藏.fetch": {
        name: "在线生词本",
        el: (v) =>
            sortList<(typeof v)[0]>(
                (v) => v.name || new URL(v.url).host,
                (el, d) => z在线生词本Dialog(el, d),
            ),
    },
    "字体.大小": {
        name: "字体大小",
        el: () => xNumber("px", { min: 1 }),
    },
    "编辑器.自动换行": {
        name: "自动换行",
        el: () => xSwitch(),
    },
    "编辑器.拼写检查": {
        name: "拼写检查",
        el: () => xSwitch(),
    },
    "编辑器.行号": {
        name: "行号",
        el: () => xSwitch(),
    },
    "历史记录设置.保留历史记录": {
        name: "保留历史记录",
        el: () => xSwitch(),
    },
    "历史记录设置.自动清除历史记录": {
        name: "自动清除历史记录",
        el: () => xSwitch(),
    }, // todo 隐藏设置
    "历史记录设置.d": {
        name: "历史记录保存天数",
        el: () => xNumber(t("天"), { step: 0.5 }),
    },
    时间格式: {
        name: "时间格式",
        el: () => input(),
    },
    "主页面.显示图片区": {
        name: "显示图片区",
        desc: "OCR结果行数大于等于该值，自动显示图片区。0为不显示", // todo 再多一个设置
        el: () => xNumber("", { min: 0, max: 35, step: 1 }),
    },
    "主页面.自动复制OCR": {
        name: "自动复制OCR结果",
        el: () => xSwitch(),
    },
    "主页面.复制OCR后提示": {
        name: "复制OCR后提示",
        el: () => xSwitch(),
    },
    "主页面.复用后聚焦": {
        name: "复用后聚焦",
        desc: "使用OCR等操作复用窗口时，该窗口是否主动弹出聚焦",
        el: () => xSwitch(),
    },
    自动搜索: {
        name: "自动搜索",
        desc: "识屏或直接打开主页面，若文字为一行，则自动搜索",
        el: () => xSwitch(),
    },
    自动打开链接: {
        name: "自动打开链接",
        el: () => xSwitch(),
    },
    自动搜索中文占比: {
        name: "自动搜索中文占比",
        desc: "在中英混合中，数值越小，则整段文字越容易被程序认为是中文主要", // todo 用语言库 区分母语
        el: () => xNumber("", { min: 0.002, max: 1, step: 0.01 }),
    },
    "引擎.搜索": {
        name: "搜索引擎",
        el: (v) =>
            sortList<(typeof v)[0]>(
                (v) => v.name,
                (_v, d) => searchEngineDialog(_v, d),
            ),
    },
    "引擎.翻译": {
        name: "翻译引擎",
        el: (v) =>
            sortList<(typeof v)[0]>(
                (v) => v.name,
                (_v, d) => searchEngineDialog(_v, d),
            ),
    },
    浏览器中打开: {
        name: "浏览器中打开",
        desc: "点击搜索或翻译按钮后，将在系统默认浏览器打开搜索结果，否则在一个新的软件窗口打开",
        el: () => xSwitch(),
    },
    "浏览器.标签页.自动关闭": {
        name: "搜索窗口自动关闭",
        desc: "浏览器打开后自动关闭标签页",
        el: () => xSwitch(),
    },
    "浏览器.标签页.小": {
        name: "标签缩小",
        desc: "标签将只显示图标，悬浮查看标题，中键或右键关闭",
        el: () => xSwitch(),
    },
    "浏览器.标签页.灰度": {
        name: "标签图标灰度",
        desc: "标签图标将以灰度图片展示，减少多余颜色的干扰",
        el: () => xSwitch(),
    },
    "快捷键.自动识别.key": {
        name: "自动识别",
        el: () => globalHotkey("自动识别"),
    },
    "快捷键.截屏搜索.key": {
        name: "截屏搜索",
        el: () => globalHotkey("截屏搜索"),
    },
    "快捷键.选中搜索.key": {
        name: "选中搜索",
        el: () => globalHotkey("选中搜索"),
    },
    "快捷键.剪贴板搜索.key": {
        name: "剪贴板搜索",
        el: () => globalHotkey("剪贴板搜索"),
    },
    "快捷键.快速截屏.key": {
        name: "快速截屏",
        el: () => globalHotkey("快速截屏"),
    },
    "快捷键.连拍.key": {
        name: "连拍",
        el: () => globalHotkey("连拍"),
    },
    "快捷键.结束广截屏.key": {
        name: "结束广截屏",
        el: () => globalHotkey("结束广截屏"),
    },
    "快捷键.剪贴板贴图.key": {
        name: "剪贴板贴图",
        el: () => globalHotkey("剪贴板贴图"),
    },
    "快捷键.主页面.key": {
        name: "主页面",
        el: () => globalHotkey("主页面"),
    },
    全局工具快捷键: {
        name: "框选后执行（全局快捷键）",
        desc: "按快捷键框选区域，松开鼠标后执行所选动作。",
        el: () => selectionShortcutEditor(),
    },
    "工具快捷键.close": {
        name: getToolsN("close"),
        el: () => hotkeyP("close"),
    },
    "工具快捷键.ocr": {
        name: getToolsN("ocr"),
        el: () => hotkeyP("ocr"),
    },
    "工具快捷键.search": {
        name: getToolsN("search"),
        el: () => hotkeyP("search"),
    },
    "工具快捷键.QR": {
        name: getToolsN("QR"),
        el: () => hotkeyP("scan"),
    },
    "工具快捷键.open": {
        name: getToolsN("open"),
        el: () => hotkeyP("open"),
    },
    "工具快捷键.ding": {
        name: getToolsN("ding"),
        el: () => hotkeyP("ding"),
    },
    "工具快捷键.dingLive": {
        name: getToolsN("dingLive"),
        el: () => hotkeyP("live_ding"),
    },
    "工具快捷键.record": {
        name: getToolsN("record"),
        el: () => hotkeyP("record"),
    },
    "工具快捷键.long": {
        name: getToolsN("long"),
        el: () => hotkeyP("long_clip"),
    },
    "工具快捷键.copy": {
        name: getToolsN("copy"),
        el: () => hotkeyP("copy"),
    },
    "工具快捷键.save": {
        name: getToolsN("save"),
        el: () => hotkeyP("save"),
    },
    "工具快捷键.translate": {
        name: "截图窗口内翻译",
        desc: "仅在截图窗口中生效。桌面快捷键请在“框选后执行”中配置。",
        el: () => hotkeyP("translate"),
    },
    "工具快捷键.editor": {
        name: getToolsN("editor"),
        el: () => hotkeyP("super_edit"),
    },
    "截屏编辑快捷键.more.键": {
        name: "更多",
        el: () => hotkeyP("more"),
    },
    "截屏编辑快捷键.select.副.rect": {
        name: "矩形选择",
        el: () => hotkeyP("rect_select"),
    },
    "截屏编辑快捷键.select.副.free": {
        name: "自由选择",
        el: () => hotkeyP("free_select"),
    },
    "截屏编辑快捷键.select.副.draw": {
        name: "绘制",
        el: () => hotkeyP("draw_select"),
    },
    ...Object.fromEntries(
        clipDrawTools
            .filter((tool) => isDrawingAction(tool.key))
            .map((tool) => [
                drawingShortcutPath(tool.key),
                { name: tool.title, el: () => hotkeyP(tool.icon) },
            ]),
    ),
    "大小栏快捷键.左上x": {
        name: "左上x",
        el: () => hotkeyP(),
    },
    "大小栏快捷键.左上y": {
        name: "左上y",
        el: () => hotkeyP(),
    },
    "大小栏快捷键.右下x": {
        name: "右下x",
        el: () => hotkeyP(),
    },
    "大小栏快捷键.右下y": {
        name: "右下y",
        el: () => hotkeyP(),
    },
    "大小栏快捷键.宽": {
        name: "宽",
        el: () => hotkeyP(),
    },
    "大小栏快捷键.高": {
        name: "高",
        el: () => hotkeyP(),
    },
    "其他快捷键.复制颜色": {
        name: "复制颜色",
        el: () => hotkeyP(),
    },
    "其他快捷键.隐藏或显示栏": {
        name: "显示/隐藏工具栏、绘制栏",
        el: () => hotkeyP(),
    },
    "主页面快捷键.搜索": {
        name: "搜索",
        el: () => hotkeyP("search"),
    },
    "主页面快捷键.翻译": {
        name: "翻译",
        el: () => hotkeyP("translate"),
    },
    "主页面快捷键.打开链接": {
        name: "打开链接",
        el: () => hotkeyP("link"),
    },
    "主页面快捷键.删除换行": {
        name: "删除换行",
        el: () => hotkeyP("delete_enter"),
    },
    "主页面快捷键.图片区": {
        name: "图片区",
        el: () => hotkeyP("img"),
    },
    "主页面快捷键.关闭": {
        name: "关闭",
        el: () => hotkeyP("close"),
    },
    启动提示: {
        name: "启动提示",
        desc: "将通过系统通知提示启动",
        el: () => xSwitch(),
    },
    托盘: {
        name: "托盘",
        el: (v) => {
            const blackLogo = () =>
                image(logoBlack, noI18n("logo")).attr({ width: 32 });
            const whiteLogo = () =>
                image(logoWhite, noI18n("logo")).attr({ width: 32 });
            return xSelect<typeof v>(
                [
                    {
                        value: "彩色",
                        name: view().add([
                            image(logo, noI18n("logo")).attr({ width: 32 }),
                            "默认",
                        ]),
                    },
                    {
                        value: "黑",
                        name: view().add([blackLogo(), "黑"]),
                    },
                    {
                        value: "白",
                        name: view().add([whiteLogo(), "白"]),
                    },
                    {
                        value: "跟随系统",
                        name: view().add([
                            isDarkMode() ? blackLogo() : whiteLogo(),
                            "跟随系统",
                        ]),
                    },
                    {
                        value: "跟随系统反",
                        name: view().add([
                            isDarkMode() ? whiteLogo() : blackLogo(),
                            "反向跟随系统",
                        ]),
                    },
                    {
                        value: "无",
                        name: "无",
                    },
                ],
                "托盘",
            );
        },
    },
    "语言.语言": {
        name: "语言",
        el: () => {
            let lans: string[] = getLans();
            const systemLan = renderSendSync("systemLan", []);
            // 提前系统语言
            lans = [systemLan].concat(lans.filter((v) => v !== systemLan));
            const el = xGroup("y");
            const list = xSelect(
                lans.map((i) => ({
                    value: i,
                    name: noI18n(getLanName(i) ?? i),
                })),
                "语言",
            ).on("input", () => {
                lan(list.gv);
                el.el.dispatchEvent(new CustomEvent("input"));
            });
            return el
                .add([list])
                .bindGet(() => list.gv)
                .bindSet((v) => list.sv(v));
        },
    },
    "主搜索功能.自动搜索排除": {
        name: "自动搜索排除",
        desc: "若选中的文字符合文本框的规则，将使用截屏搜索而不是选择搜索",
        el: (_v) =>
            textarea()
                .class(blockSetting)
                .bindGet((el) => el.value.split("\n").filter((i) => i !== ""))
                .bindSet((v: typeof _v, el) => {
                    el.value = v.join("\n");
                }),
    },
    "主搜索功能.剪贴板选区搜索": {
        name: "剪贴板选区搜索",
        desc: "使用选区内容",
        el: () => xSwitch(),
    },
    "主搜索功能.截屏搜索延迟": {
        name: "拖盘截屏延迟",
        desc: "有些系统或桌面拖盘消失需要时间，可能会截进去，延迟用来避免这样的情况",
        el: () => xNumber("ms", { min: 0, step: 100 }),
    },
    "全局.主题": {
        name: "主题色",
        el: () => {
            function change() {
                el.el.dispatchEvent(new CustomEvent("input"));
            }
            const themeSelect = xGroup().add(
                themes.map((i, index) =>
                    button()
                        .class("theme-preset")
                        .add([
                            view()
                                .class("theme-swatch")
                                .style({
                                    backgroundColor: `light-dark(${i.light.emphasis}, ${i.dark.emphasis})`,
                                }),
                            txt(["中性灰", "雾蓝", "浅绿"][index]),
                        ])
                        .on("click", () => {
                            el.sv(i);
                            change();
                        }),
                ),
            );
            const emL = xColor();
            const emD = xColor();
            const brL = xColor();
            const brD = xColor();
            const bL = xColor();
            const bD = xColor();
            const fL = xColor();
            const fD = xColor();
            const fEL = xColor();
            const fED = xColor();
            const el = xGroup("y")
                .class(blockSetting)
                .add([
                    xGroup("y").add([
                        view().add(["强调色", xGroup().add([emL, emD])]),
                        view().add(["透明背景", xGroup().add([brL, brD])]),
                        view().add(["普通背景", xGroup().add([bL, bD])]),
                        view().add(["文字和图标颜色", xGroup().add([fL, fD])]),
                        view().add([
                            "强调色中的内容颜色",
                            xGroup().add([fEL, fED]),
                        ]),
                    ]),
                    themeSelect,
                ])
                .bindGet(() => {
                    const x = {
                        light: {
                            emphasis: emL.gv,
                            barbg: brL.gv,
                            bg: bL.gv,
                            fontColor: fL.gv,
                            fontInEmphasis: fEL.gv,
                            iconColor: "",
                        },
                        dark: {
                            emphasis: emD.gv,
                            barbg: brD.gv,
                            bg: bD.gv,
                            fontColor: fD.gv,
                            fontInEmphasis: fED.gv,
                            iconColor: "",
                        },
                    } satisfies Theme;
                    x.light.iconColor = getIconColor(x.light.fontColor);
                    x.dark.iconColor = getIconColor(x.dark.fontColor);
                    return x;
                })
                .bindSet((v: Theme2) => {
                    emL.sv(v.light.emphasis);
                    emD.sv(v.dark.emphasis);
                    brL.sv(v.light.barbg);
                    brD.sv(v.dark.barbg);
                    bL.sv(v.light.bg);
                    bD.sv(v.dark.bg);
                    fL.sv(v.light.fontColor);
                    fD.sv(v.dark.fontColor);
                    fEL.sv(v.light.fontInEmphasis);
                    fED.sv(v.dark.fontInEmphasis);
                });

            for (const i of [emL, emD, brL, brD, bL, bD, fL, fD, fEL, fED]) {
                i.on("input", () => change());
            }

            return el;
        },
    },
    "全局.模糊": {
        name: "模糊",
        el: () => xNumber("px", { min: 0, max: 50 }),
    },
    "全局.不透明度": {
        name: "不透明度",
        el: () => xNumber("", { min: 0, max: 1, step: 0.05 }),
    },
    "全局.深色模式": {
        name: "深色模式",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "system", name: "跟随系统" },
                    { value: "light", name: "浅色" },
                    { value: "dark", name: "深色" },
                ],
                "深色模式",
            ),
    },
    "全局.缩放": {
        name: "全局缩放",
        el: () => xNumber("", { min: 0.1, max: 3, step: 0.05 }),
    },
    "字体.主要字体": {
        name: "主要字体",
        desc: "适用于大部分文字字体",
        el: () => xFont(),
    },
    "字体.等宽字体": {
        name: "等宽字体",
        desc: "适用于数字、颜色代码等字体",
        el: () => xFont(),
    },
    "代理.mode": {
        name: "代理",
        el: (v) =>
            // @ts-ignore
            xSelect<typeof v>(
                [
                    { value: "system", name: "系统代理" },
                    { value: "fixed_servers", name: "固定服务器" },
                    { value: "pac_script", name: "PAC脚本" },
                    { value: "auto_detect", name: "自动检测" },
                    { value: "direct", name: "无代理" },
                ],
                "代理",
            ),
    },
    "代理.pacScript": {
        name: "PAC URL",
        el: () =>
            input().attr({
                placeholder: "https://…/proxy.pac",
                ariaLabel: "PAC URL",
                spellcheck: false,
            }),
    },
    "代理.proxyRules": {
        name: "规则",
        el: () => {
            const fields = (["http", "https", "ftp", "socks"] as const).map(
                (protocol) => {
                    const field = input().attr({
                        spellcheck: false,
                        placeholder: "host:port",
                    });
                    return {
                        protocol,
                        field,
                        label: label([
                            txt(protocol.toUpperCase(), true),
                            field,
                        ]),
                    };
                },
            );
            const raw = input().attr({
                ariaLabel: t("规则"),
                spellcheck: false,
            });
            const grid = view()
                .class("proxy-protocols")
                .add(fields.map((f) => f.label));
            const form = view().class("proxy-rules").add([grid, raw]);
            for (const field of [...fields.map((f) => f.field), raw])
                field.on("input", () =>
                    form.el.dispatchEvent(new Event("input")),
                );
            return form
                .bindGet(() =>
                    grid.el.hidden
                        ? raw.gv
                        : fields
                              .filter((f) => f.field.gv.trim())
                              .map((f) => `${f.protocol}=${f.field.gv.trim()}`)
                              .join(";"),
                )
                .bindSet((v: string) => {
                    const rules = new Map<string, string>();
                    const parts = v
                        .split(";")
                        .map((p) => p.trim())
                        .filter(Boolean);
                    const simple = parts.every((part) => {
                        const match = /^(http|https|ftp|socks)=(.+)$/i.exec(
                            part,
                        );
                        if (!match || rules.has(match[1].toLowerCase()))
                            return false;
                        rules.set(match[1].toLowerCase(), match[2]);
                        return true;
                    });
                    raw.sv(v);
                    raw.el.hidden = simple;
                    grid.el.hidden = !simple;
                    for (const f of fields)
                        f.field.sv(rules.get(f.protocol) ?? "");
                });
        },
    },
    "代理.proxyBypassRules": {
        name: "排除规则",
        el: () =>
            input().attr({
                placeholder: "localhost; *.example.com",
                ariaLabel: t("排除规则"),
                spellcheck: false,
            }),
    },
    "网络.github镜像.启用": {
        name: "GitHub镜像",
        desc: "加速Github有关网络访问",
        el: () => xSwitch(),
    },
    "网络.github镜像.base": {
        name: "基本",
        desc: "软件资源下载",
        el: () =>
            selectUrl(
                githubMirrorList.base.map((i) => ({
                    name: new URL(i).hostname,
                    url: i,
                })),
                "https://github.com/",
            ),
    },
    "网络.github镜像.api": {
        name: "api",
        desc: "检查更新",
        el: () =>
            selectUrl(
                githubMirrorList.api.map((i) => ({
                    name: new URL(i).hostname,
                    url: i,
                })),
                "https://api.github.com/",
            ),
    },
    硬件加速: {
        name: "硬件加速",
        el: () => xSwitch(),
    },
    "额外截屏器.命令": {
        name: "截屏命令",
        el: () => input(),
    },
    "额外截屏器.位置": {
        name: "截屏保存位置",
        el: () => xPath(false),
    },
    使用XDGDesktopPortal: {
        name: "使用 XDG Desktop Portal",
        desc: "在 Linux 上使用 XDG Desktop Portal 进行截屏，适用于 Wayland 等环境，但是在多屏分数缩放可能存在模糊",
        el: () => xSwitch(),
    },
    自定义屏幕属性: {
        name: "自定义屏幕属性",
        el: (v) =>
            sortList<(typeof v)[0]>(
                (v) => String(v.id),
                (_item, dialog) => {
                    const { promise, resolve } =
                        Promise.withResolvers<typeof _item>();
                    const item = _item || { id: Number.NaN, scaleFactor: 1 };
                    const screens = renderSendSync("getScreens", []);
                    const screenSelect = select(
                        screens.map((i) => ({
                            name: i.label || String(i.id),
                            value: String(i.id),
                        })),
                    ).sv(String(item.id));
                    const scaleFactor = xNumber("", { min: 0.1 }).sv(
                        item.scaleFactor,
                    );

                    dialogB(
                        dialog,
                        [screenSelect, view().add(["缩放比例", scaleFactor])],
                        () => resolve(null),
                        () =>
                            resolve({
                                id: Number(screenSelect.gv),
                                scaleFactor: scaleFactor.gv,
                            }),
                    );
                    return promise;
                },
            ),
    },
    保留截屏窗口: {
        name: "保留截屏窗口",
        desc: "内存占用多，截屏快；反之内存占用少，但截屏慢",
        el: () => xSwitch(),
    },
    "更新.频率": {
        name: "检查更新频率",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "manual", name: "手动检查" },
                    { value: "start", name: "启动时检查" },
                ],
                "检查更新频率",
            ),
    },
    "更新.模式": {
        name: "更新模式",
        desc: "适用于启动时检查",
        el: (v) =>
            xSelect<typeof v>(
                [
                    { value: "大版本", name: "大版本" },
                    { value: "小版本", name: "小版本" },
                    { value: "dev", name: "开发版" },
                ],
                "更新模式",
            ),
    },
    "更新.忽略版本": {
        name: "忽略版本",
        desc: "忽略版本号以跳过更新",
        el: () => input(),
    },
    dev: {
        name: "开发者模式",
        el: () => xSwitch(),
    },
};

const xs: Record<
    JustElmentK,
    { name: string; desc?: string; el: () => ElType<HTMLElement> }
> = {
    _autostart: {
        name: "开机自启动",
        el: () =>
            xSwitch()
                .on("input", (_e, el) => {
                    renderSend("setAutoStart", [el.gv]);
                })
                .sv(renderSendSync("getAutoStart", [])),
    },
    _qsq: {
        name: "取色器预览",
        el: () => {
            const colorSize = getSet("取色器.大小");
            const iSize = getSet("取色器.像素大小");
            const el = view("x", "wrap")
                .add(
                    Array.from({ length: colorSize ** 2 }).map(() => {
                        const l = Math.random() * 40 + 50;
                        return view().style({
                            backgroundColor: `hsl(0,0%,${l}%)`,
                            width: `${iSize}px`,
                            height: `${iSize}px`,
                        });
                    }),
                )
                .style({
                    width: `${iSize * colorSize}px`,
                    height: `${iSize * colorSize}px`,
                });
            return view().class(blockSetting).add(el);
        },
    },
    _inpaint: {
        name: "魔法橡皮模型",
        desc: "高级图片编辑中魔法橡皮使用的模型",
        el: () => inpaintEl(),
    },
    _theme: {
        name: "样式预览",
        el: () =>
            view()
                .class(blockSetting)
                .add(
                    view("x")
                        .style({
                            boxShadow: "var(--shadow)",
                            width: "max-content",
                            borderRadius: "var(--border-radius)",
                            overflow: "hidden",
                        })
                        .add([
                            view()
                                .style({
                                    height: "80px",
                                    backgroundColor: cssColor.bg,
                                })
                                .add([
                                    view().style({
                                        width: "20px",
                                        height: "20px",
                                        backgroundColor:
                                            "var(--emphasis-color)",
                                    }),
                                    view()
                                        .add(iconEl("search"))
                                        .style({ background: "transparent" }),
                                    txt("测试文字"),
                                    txt("42", true).class(Class.mono),
                                ]),
                            view()
                                .add([
                                    image(testPhoto, "").style({
                                        width: "80px",
                                    }),
                                    view().class(Class.glassBar).style({
                                        width: "80px",
                                        height: "80px",
                                        position: "absolute",
                                        top: 0,
                                    }),
                                ])
                                .style({ position: "relative" }),
                        ]),
                ),
    },
    _filename: {
        name: "文件名预览",
        el: () => {
            const saveTime = new Date();
            return txt(
                `${getSet("保存名称.前缀")}${time_format(getSet("保存名称.时间"), saveTime)}${getSet("保存名称.后缀")}`,
                true,
            ).class(Class.mono);
        },
    },
    _clear_history: {
        name: "清空所有文字记录",
        el: () =>
            button("清空")
                .class("danger-action")
                .on("click", async () => {
                    const c = await confirm(
                        "这将清除所有的历史记录\n且不能复原\n确定清除？",
                    );
                    const configPath = renderSendSync("userDataPath", []);
                    if (c)
                        fs.writeFileSync(
                            path.join(configPath, "history.json"),
                            JSON.stringify({ 历史记录: {} }, null, 2),
                        );
                }),
    },
    _clear_browswer: {
        name: "清除数据",
        el: () =>
            xGroup("x").add([
                button("Cookie 等存储数据")
                    .class("danger-action")
                    .on("click", () => {
                        renderSend("clearStorage", []);
                    }),
                button("缓存")
                    .class("danger-action")
                    .on("click", () => {
                        renderSend("clearCache", []);
                    }),
            ]),
    },
    _setting_file: {
        name: "设置源文件",
        desc: "直接编辑设置源文件，更多自定义设置",
        el: () =>
            button("打开设置源文件").on("click", () => {
                shell.openPath(
                    path.join(
                        renderSendSync("userDataPath", []),
                        "config.json",
                    ),
                );
            }),
    },
    _default_setting: {
        name: "恢复默认设置",
        el: () =>
            xGroup().add([
                button("恢复")
                    .class("danger-action")
                    .on("click", () => {
                        const defaultSetting = getDefaultSetting();
                        for (const [x] of Object.entries(s)) {
                            setSet(
                                x as SettingPath,
                                getFromStore(defaultSetting, x as SettingPath),
                            );
                        }
                    }),
                button("显示更改的设置").on("click", () => {
                    const defaultSetting = getDefaultSetting();
                    const ss = Object.entries(s).filter(
                        ([x]) =>
                            !isSettingItemSame(
                                getSet(x as SettingPath),
                                getFromStore(defaultSetting, x as SettingPath),
                            ),
                    );
                    renderSettingList(ss.map((i) => i[0]));
                }),
            ]),
    },
    _location: {
        name: "位置信息",
        el: () => {
            const configPath = renderSendSync("userDataPath", []);
            const runPath = renderSendSync("runPath", []);
            const portablePath = path.join(runPath, "portable");

            const portableConfigBtn = button("改为便携版");
            const pathInfo = view()
                .class(blockSetting)
                .add([
                    view().add([
                        "配置目录：",
                        "",
                        pathEl(configPath),
                        fs.existsSync(portablePath)
                            ? "便携版"
                            : portableConfigBtn,
                    ]),
                    view().add([
                        "文字记录：",
                        " ",
                        pathEl(path.join(configPath, "history.json")),
                    ]),
                    view().add([
                        "临时目录：",
                        " ",
                        pathEl(path.join(os.tmpdir(), "wSearch")),
                    ]),
                    view().add(["运行目录：", " ", pathEl(runPath)]),
                ]);
            portableConfigBtn.on("click", async () => {
                const c = await confirm("将转为便携版，并迁移数据，重启软件");
                if (!c) return;
                console.log(portablePath);
                try {
                    fs.mkdirSync(portablePath, { recursive: true });
                    renderSendSync("move_user_data", [portablePath]);
                    renderSend("reload", []);
                } catch (error) {
                    // @ts-ignore
                    if (error.code !== "EEXIST") {
                        throw error;
                    }
                    // @ts-ignore
                    alert(`${t("错误")}\n${error.toString()}`);
                }
            });
            return pathInfo;
        },
    },
    _logs: {
        name: "运行日志",
        el: () => {
            const output = textarea("点击“获取日志”查看记录")
                .class("log-output")
                .attr({
                    readOnly: true,
                    ariaLabel: t("运行日志"),
                    spellcheck: false,
                });
            const caption = txt("获取日志");
            const fetchButton = button([
                image(getImgUrl("reload.svg"), noI18n("")),
                caption,
            ])
                .class("log-fetch")
                .on("click", () => {
                    const entries = renderSendSync("getLogs", []);
                    output.sv(
                        entries.length ? JSON.stringify(entries, null, 2) : "",
                    );
                    output.el.placeholder = t("暂无日志");
                    output.el.rows = entries.length ? 7 : 2;
                    caption.el.textContent = t("刷新");
                });
            output.el.rows = 2;
            return view().class("log-controls").add([fetchButton, output]);
        },
    },
    _version: {
        name: "版本信息",
        el: () => {
            const versionL = ["electron", "node", "chrome", "v8"];
            const moreVersion = view()
                .class(blockSetting)
                .class(Class.mono)
                .add([
                    p(
                        `${t("本机系统内核：")} ${os.type()} ${os.release()}`,
                        true,
                    ),
                    ...versionL.map((i) =>
                        p(`${i}: ${process.versions[i]}`, true),
                    ),
                ]);
            return moreVersion;
        },
    },
    _exit: {
        name: "退出应用",
        el: () => button("退出").on("click", () => renderSend("exit", [])),
    },
};

// todo log没创建的key

const main: {
    pageName: string;
    icon: IconType;
    about?: boolean;
    settings?: KeyPath[];
    desc?: string;
    items?: { title: string; desc?: string; settings: KeyPath[] }[];
    isMemo?: boolean;
}[] = [
    { pageName: "常用", icon: "star", isMemo: true },
    {
        pageName: "截屏",
        icon: "rect_select",
        items: [
            {
                title: "工具栏",
                settings: [
                    "工具栏跟随",
                    "工具栏.按钮大小",
                    "工具栏.按钮图标比例",
                    "工具栏.布局",
                    "工具栏.初始位置",
                    "工具栏.稍后出现",
                ],
            },

            {
                title: "复制偏移",
                desc: "复制完一个元素后，为了分辨，可以让其偏移",
                settings: ["图像编辑.复制偏移.x", "图像编辑.复制偏移.y"],
            },
            { title: "鼠标跟随栏", settings: ["鼠标跟随栏.显示"] },
            {
                title: "取色器",
                settings: [
                    "取色器.显示",
                    "取色器.大小",
                    "取色器.像素大小",
                    "_qsq",
                    "取色器.默认格式",
                ],
            },
            {
                title: "框选",
                settings: [
                    "框选.颜色.遮罩",
                    "显示四角坐标",
                    "框选后默认操作",
                    "框选.识别窗口",
                    "框选.自动框选.图像识别",
                    "框选.自动框选.最小阈值",
                    "框选.自动框选.最大阈值",
                    "框选.记忆.开启",
                    "框选.参考线.选区",
                    "框选.颜色.选区参考线",
                ],
            },
            {
                title: "光标",
                settings: ["框选.参考线.光标", "框选.颜色.光标参考线"],
            },
            {
                title: "快速截屏",
                settings: ["快速截屏.模式", "快速截屏.路径"],
            },
            { title: "连拍", settings: ["连拍.数", "连拍.间隔"] },
            {
                title: "广截屏",
                settings: ["广截屏.模式", "广截屏.显示模式", "广截屏.t"],
            },
            {
                title: "截屏",
                settings: ["使用XDGDesktopPortal"],
            },
            {
                title: "外部截屏器",
                settings: [
                    "额外截屏器.命令",
                    "额外截屏器.位置",
                    "自定义屏幕属性",
                ],
            },
            { title: "后台", settings: ["保留截屏窗口"] },
            {
                title: "鼠标快捷键",
                settings: ["鼠标快捷键.右键", "鼠标快捷键.双击"],
            },
        ],
    },
    {
        pageName: "文字识别（OCR）",
        icon: "ocr",
        settings: [
            "OCR.类型",
            "OCR.离线切换",
            "主页面.自动复制OCR",
            "主页面.复制OCR后提示",
        ],
        items: [
            {
                title: "离线OCR",
                settings: [
                    "离线OCR",
                    "OCR.全局det路径",
                    "OCR.识别段落",
                    "OCR.整体方向识别",
                ],
            },
            {
                title: "百度OCR",
                settings: [
                    "在线OCR.baidu.url",
                    "在线OCR.baidu.id",
                    "在线OCR.baidu.secret",
                ],
            },
            {
                title: "有道OCR",
                settings: ["在线OCR.youdao.id", "在线OCR.youdao.secret"],
            },
        ],
    },
    {
        pageName: "人工智能",
        icon: "ai_check",
        desc: "配置OCR、录屏背景移除等人工智能",
        settings: ["AI.运行后端", "AI.在线模型"],
        items: [{ title: "魔法橡皮模型", settings: ["_inpaint"] }],
    },
    {
        pageName: "录屏",
        icon: "record",
        desc: "分为普通录屏和超级录屏，普通录屏固定位置和大小录制，超级录屏适合录制操作演示，提供自动运镜效果",
        items: [
            {
                title: "提示",
                settings: [
                    "录屏.提示.键盘.开启",
                    "录屏.提示.键盘.位置",
                    "录屏.提示.键盘.位置.offsetX",
                    "录屏.提示.键盘.位置.offsetY",
                    "录屏.提示.键盘.大小",
                    "录屏.提示.鼠标.开启",
                    "录屏.提示.光标.开启",
                    "录屏.提示.光标.样式",
                ],
            },
            {
                title: "摄像头",
                settings: [
                    "录屏.摄像头.开启",
                    "录屏.摄像头.镜像",
                    "录屏.摄像头.背景.模式",
                    "录屏.摄像头.背景.模糊",
                    "录屏.摄像头.背景.imgUrl",
                    "录屏.摄像头.背景.videoUrl",
                    "录屏.摄像头.背景.fit",
                ],
            },
            {
                title: "音频",
                settings: ["录屏.音频.启用系统内录"],
            },
            {
                title: "转换",
                settings: ["录屏.转换.码率", "录屏.转换.帧率"],
            },
            {
                title: "超级录屏",
                settings: [
                    "录屏.超级录屏.编码选择",
                    "录屏.超级录屏.关键帧间隔",
                    "录屏.超级录屏.导出后关闭",
                ],
            },
        ],
    },
    {
        pageName: "保存",
        icon: "save",
        settings: [
            "保存名称.前缀",
            "保存名称.时间",
            "保存名称.后缀",
            "_filename",
            "保存.保存并复制",
            "保存.复制为文件",
            "保存.快速保存",
            "保存.默认格式",
        ],
    },
    {
        pageName: "贴图",
        icon: "ding",
        settings: [
            "贴图.窗口.独立窗口",
            "贴图.窗口.双击",
            "贴图.窗口.变换",
            "贴图.窗口.提示",
            "贴图.动态.帧率",
            "贴图.动态.最大数量",
        ],
    },
    {
        pageName: "翻译",
        icon: "translate",
        settings: ["翻译.翻译器"],
        items: [
            {
                title: "本地模型",
                settings: ["翻译.Firefox本地模型"],
            },
            {
                title: "屏幕翻译",
                settings: [
                    "屏幕翻译.语言.from",
                    "屏幕翻译.语言.to",
                    "屏幕翻译.dTime",
                    "屏幕翻译.color.bg",
                    "屏幕翻译.color.text",
                ],
            },
            {
                title: "生词本",
                settings: ["翻译.收藏.文件", "翻译.收藏.fetch"],
            },
        ],
    },
    {
        pageName: "编辑器",
        icon: "text",
        items: [
            {
                title: "编辑器",
                settings: [
                    "字体.大小",
                    "编辑器.自动换行",
                    "编辑器.拼写检查",
                    "编辑器.行号",
                ],
            },
            {
                title: "历史记录",
                settings: [
                    "历史记录设置.保留历史记录",
                    "历史记录设置.自动清除历史记录",
                    "历史记录设置.d",
                    "时间格式",
                    "_clear_history",
                ],
            },
            {
                title: "界面",
                settings: ["主页面.显示图片区", "主页面.复用后聚焦"],
            },
        ],
    },
    {
        pageName: "搜索与浏览",
        icon: "browser",
        items: [
            {
                title: "主搜索功能",
                settings: [
                    "主搜索功能.自动搜索排除",
                    "主搜索功能.剪贴板选区搜索",
                    "主搜索功能.截屏搜索延迟",
                ],
            },
            {
                title: "自动",
                settings: ["自动搜索", "自动打开链接", "自动搜索中文占比"],
            },
            { title: "引擎", settings: ["引擎.搜索", "引擎.翻译"] },
            {
                title: "浏览",
                settings: [
                    "浏览器中打开",
                    "浏览器.标签页.自动关闭",
                    "浏览器.标签页.小",
                    "浏览器.标签页.灰度",
                    "_clear_browswer",
                ],
            },
        ],
    },
    {
        pageName: "快捷键",
        icon: "space",
        settings: ["全局工具快捷键"],
        items: [
            {
                title: "全局功能",
                settings: [
                    "快捷键.自动识别.key",
                    "快捷键.截屏搜索.key",
                    "快捷键.选中搜索.key",
                    "快捷键.剪贴板搜索.key",
                    "快捷键.快速截屏.key",
                    "快捷键.连拍.key",
                    "快捷键.结束广截屏.key",
                    "快捷键.剪贴板贴图.key",
                    "快捷键.主页面.key",
                ],
            },
            {
                title: "截屏工具栏",
                settings: [
                    "工具快捷键.close",
                    "工具快捷键.ocr",
                    "工具快捷键.search",
                    "工具快捷键.QR",
                    "工具快捷键.open",
                    "工具快捷键.ding",
                    "工具快捷键.dingLive",
                    "工具快捷键.record",
                    "工具快捷键.long",
                    "工具快捷键.copy",
                    "工具快捷键.save",
                    "工具快捷键.translate",
                    "工具快捷键.editor",
                ],
            },
            {
                title: "截屏选择与控制",
                settings: [
                    "截屏编辑快捷键.select.副.rect",
                    "截屏编辑快捷键.select.副.free",
                    "截屏编辑快捷键.select.副.draw",
                ],
            },
            {
                title: "截屏编辑栏",
                settings: ["截屏编辑快捷键.more.键"],
            },
            {
                title: "截屏自由绘画",
                settings: drawingShortcutKeys("draw"),
            },
            {
                title: "截屏形状和文字",
                settings: drawingShortcutKeys("shape"),
            },
            {
                title: "截屏滤镜",
                settings: drawingShortcutKeys("filter"),
            },
            {
                title: "截屏大小栏",
                settings: [
                    "大小栏快捷键.左上x",
                    "大小栏快捷键.左上y",
                    "大小栏快捷键.右下x",
                    "大小栏快捷键.右下y",
                    "大小栏快捷键.宽",
                    "大小栏快捷键.高",
                ],
            },
            {
                title: "截屏其他",
                settings: ["其他快捷键.复制颜色", "其他快捷键.隐藏或显示栏"],
            },
            {
                title: "主页面",
                settings: [
                    "主页面快捷键.搜索",
                    "主页面快捷键.翻译",
                    "主页面快捷键.打开链接",
                    "主页面快捷键.删除换行",
                    "主页面快捷键.图片区",
                    "主页面快捷键.关闭",
                ],
            },
        ],
    },
    {
        pageName: "全局",
        icon: "main",
        items: [
            { title: "启动", settings: ["_autostart", "启动提示"] },
            { title: "语言", settings: ["语言.语言"] },
            { title: "托盘", settings: ["托盘"] },
        ],
    },
    {
        pageName: "样式",
        icon: "filters",
        settings: ["全局.缩放", "_theme"],
        items: [
            {
                title: "颜色",
                settings: ["全局.主题", "全局.深色模式"],
            },
            {
                title: "毛玻璃效果",
                settings: ["全局.模糊", "全局.不透明度"],
            },
            {
                title: "字体",
                settings: ["字体.主要字体", "字体.等宽字体"],
            },
        ],
    },
    {
        pageName: "网络",
        icon: "link",
        items: [
            {
                title: "代理",
                settings: [
                    "代理.mode",
                    "代理.pacScript",
                    "代理.proxyRules",
                    "代理.proxyBypassRules",
                ],
            },
            {
                title: "GitHub镜像",
                settings: [
                    "网络.github镜像.启用",
                    "网络.github镜像.base",
                    "网络.github镜像.api",
                ],
            },
        ],
    },
    {
        pageName: "高级",
        icon: "setting",
        items: [
            {
                title: "高级设置",
                settings: ["_setting_file", "_default_setting", "硬件加速"],
            },
            {
                title: "检查更新",
                settings: ["更新.频率", "更新.模式", "更新.忽略版本"],
            },
            { title: "开发者模式", settings: ["dev"] },
            { title: "位置信息", settings: ["_location"] },
            { title: "诊断", settings: ["_logs"] },
            { title: "版本信息", settings: ["_version"] },
            { title: "退出应用", settings: ["_exit"] },
        ],
    },
    { pageName: "关于", icon: "help", about: true },
];

const sKeys = new Set([...Object.keys(s), ...Object.keys(xs)]);
const mKeys = new Set();

const getTitles = new Map<string, string[]>();
for (const p of main) {
    if (p.items)
        for (const i of p.items) {
            for (const s of i.settings) {
                getTitles.set(s, [p.pageName, i.title]);
                mKeys.add(s);
            }
        }
    if (p.settings)
        for (const s of p.settings) {
            getTitles.set(s, [p.pageName]);
            mKeys.add(s);
        }
}

console.log("s-m", sKeys.difference(mKeys), "m-s", mKeys.difference(sKeys));

const oldSettingMemo = getSettingMem();

const bind: { [k in KeyPath]?: KeyPath[] } = {
    离线OCR: ["OCR.类型"],
    "AI.在线模型": ["OCR.类型"],
    "翻译.翻译器": ["屏幕翻译.语言.from", "屏幕翻译.语言.to"],
    "录屏.提示.键盘.位置.offsetX": ["录屏.提示.键盘.位置"],
    "录屏.提示.键盘.位置.offsetY": ["录屏.提示.键盘.位置"],
    "录屏.提示.键盘.大小": ["录屏.提示.键盘.位置"],
    "保存名称.前缀": ["_filename"],
    "保存名称.时间": ["_filename"],
    "保存名称.后缀": ["_filename"],
    "取色器.大小": ["_qsq"],
    "取色器.像素大小": ["_qsq"],
};

const bindF: { [k in SettingPath]?: (v: GetValue<setting, k>) => void } = {
    "工具栏.按钮大小": (v) => setProperty("--bar-size", `${v}px`),
    "工具栏.按钮图标比例": (v) => setProperty("--bar-icon", String(v)),
    "全局.主题": (theme) => {
        setProperties({
            "--bar-bg0": theme.light.barbg,
            "--bg": theme.light.bg,
            "--emphasis-color": theme.light.emphasis,
            "--d-bar-bg0": theme.dark.barbg,
            "--d-bg": theme.dark.bg,
            "--d-emphasis-color": theme.dark.emphasis,
            "--font-color": theme.light.fontColor,
            "--d-font-color": theme.dark.fontColor,
            "--icon-color": theme.light.iconColor,
            "--d-icon-color": theme.dark.iconColor,
        });
    },
    "全局.深色模式": (v) => renderSend("theme", [v]),
    "全局.模糊": (v) => setProperty("--blur", `blur(${v}px)`),
    "全局.不透明度": (v) => setProperty("--alpha", String(v)),
    "字体.主要字体": (v) => setProperty("--main-font", v),
    "字体.等宽字体": (v) => setProperty("--monospace", v || monoFont.join(",")),
};

const bindF2: { f: (has: boolean) => void; keys: SettingPath[] }[] = [
    {
        f: (h) => {
            console.log("截屏更新");
            reloadScreenShot.clear();
            if (h)
                reloadScreenShot
                    .add(
                        button("重启截屏以生效").on("click", () => {
                            renderSend("reloadMainFromSetting", []);
                        }),
                    )
                    .style({ display: "" });
            else reloadScreenShot.style({ display: "none" });
        },
        keys: [
            "工具栏跟随",
            "工具栏",
            "图像编辑.编辑栏",
            "鼠标跟随栏",
            "取色器",
            "框选",
            "显示四角坐标",
            "框选后默认操作",
            "快速截屏",
            "工具快捷键",
            "截屏编辑快捷键",
            "大小栏快捷键",
            "其他快捷键",
            "全局",
            "字体",
            "额外截屏器",
            "使用XDGDesktopPortal",
            "广截屏",
            "离线OCR",
            "OCR.类型",
            "以图搜图.引擎",
            "鼠标快捷键",
        ],
    },
    {
        f: (h) => {
            console.log("应用重启");
            reloadEl.clear();
            if (h)
                reloadEl
                    .add(
                        button("重启软件以生效").on("click", () => {
                            renderSend("reload", []);
                        }),
                    )
                    .style({ display: "" });
            else reloadEl.style({ display: "none" });
        },
        keys: [
            "语言",
            "托盘",
            "保留截屏窗口",
            "dev",
            "硬件加速",
            "额外截屏器",
            "更新.频率",
        ],
    },
];

function getSettingMem() {
    const xs: SettingPath[] = [
        "OCR.类型",
        "离线OCR",
        "翻译.翻译器",
        "AI.在线模型",
        "快捷键.截屏搜索.key",
        "语言.语言",
    ];
    const memo = safeJSONParse<SettingPath[]>(
        localStorage.getItem(settingMemKey),
        xs,
    );
    const validMemo = [
        ...new Set(
            memo.map((k) =>
                k.startsWith("全局工具快捷键.")
                    ? "全局工具快捷键"
                    : k === "工具栏.功能" || k === "图像编辑.编辑栏.功能"
                      ? ("工具栏.布局" as const)
                      : k,
            ),
        ),
    ].filter((k) => k !== "全局工具快捷键" && sKeys.has(k));
    if (validMemo.length !== memo.length)
        localStorage.setItem(settingMemKey, JSON.stringify(validMemo));
    return validMemo;
}

function getFromStore<t extends SettingPath>(
    store: setting,
    k: t,
): GetValue<setting, t> {
    return xget(store as unknown as Record<string, unknown>, k);
}

function getSet<t extends SettingPath>(k: t): GetValue<setting, t> {
    return getFromStore(nowStore, k);
}

function setSet<t extends SettingPath>(
    k: t,
    v: GetValue<setting, t>,
    retry?: SelectionAction,
) {
    const old = getSet(k);
    if (old === v) return true;
    if (
        k === "全局工具快捷键" &&
        !renderSendSync("selectionShortcuts", [
            v as setting["全局工具快捷键"],
            retry,
        ])
    )
        return false;
    if (typeof v === "string") {
        const globalAction = /^全局工具快捷键\.(.+)$/.exec(k);
        const globalCommand = /^快捷键\.(.+)\.key$/.exec(k);
        if (
            globalAction &&
            !renderSendSync("hotkey", ["快捷键2", globalAction[1] as 功能, v])
        )
            return;
        if (
            globalCommand &&
            !renderSendSync("hotkey", [
                "快捷键",
                globalCommand[1] as keyof setting["快捷键"],
                v,
            ])
        )
            return;
    }
    const initV = getFromStore(oldStore, k);
    const isSame = isSettingItemSame(initV, v);
    nowStoreK.delete(k);
    if (!isSame) {
        nowStoreK.add(k);
    }

    const nSettingMemo = [
        ...Array.from(nowStoreK).toReversed(),
        ...oldSettingMemo.filter((i) => !nowStoreK.has(i)),
    ].slice(0, 24);
    localStorage.setItem(settingMemKey, JSON.stringify(nSettingMemo));

    historyEl.el.hidden = nowStoreK.size === 0;
    changeCount.sv(String(nowStoreK.size));

    const el = mainView.query(
        `[data-name="${k}"]`,
    ) as unknown as ElType<HTMLElement>;
    if (el) setEidtedItem(el, !isSame);

    bindRun(k, v);
    bindRun2();

    xset(nowStore as unknown as Record<string, unknown>, k, v);
    if (k !== "全局工具快捷键") store.set(k, v);
    if (k === "OCR.类型" || k === "AI.在线模型")
        document
            .getElementById("ocr-engine-panel")
            ?.dispatchEvent(new Event("change"));
    if (k === "字体.主要字体") setSettingsFont();
    if (
        k.startsWith("快捷键.") ||
        k === "屏幕翻译.语言.to" ||
        k === "翻译.翻译器" ||
        k === "语言.语言"
    ) {
        const summary = document.querySelector(".quick-settings");
        if (summary) summary.replaceWith(quickSettings().el);
    }
    return true;
}

function bindRun(): void;
function bindRun<t extends SettingPath>(k: t, v: GetValue<setting, t>): void;
function bindRun<t extends SettingPath>(k?: t, v?: GetValue<setting, t>) {
    if (k !== undefined && v !== undefined) {
        bindF[k]?.(v);
    } else {
        for (const [k, f] of Object.entries(bindF)) {
            // @ts-ignore
            const v = getSet(k);
            // @ts-ignore
            if (v !== undefined) f?.(v);
        }
    }
}

function bindRun2() {
    for (const f of bindF2) {
        const x = f.keys.find(
            (k) =>
                nowStoreK.has(k) ||
                Array.from(nowStoreK).find((x) => x.startsWith(`${k}.`)),
        );
        f.f(Boolean(x));
    }
}

const editedItem = addClass(
    { borderInlineStart: `1px solid ${cssColor.f}`, paddingInlineStart: "2px" },
    {},
);

function setEidtedItem(el: ElType<HTMLElement>, x: boolean) {
    if (x) {
        el.class(editedItem);
    } else {
        el.el.classList.remove(editedItem);
    }
}

type Theme = setting["全局"]["主题"];

type Theme2 = {
    [k in keyof Theme]: Omit<Theme[k], "iconColor">;
};

const themes: Theme2[] = [
    {
        light: {
            barbg: "#FFFFFF",
            bg: "#FFFFFF",
            emphasis: "#DFDFDF",
            fontColor: "#000",
            fontInEmphasis: "#000",
        },
        dark: {
            barbg: "#333333",
            bg: "#000000",
            emphasis: "#333333",
            fontColor: "#fff",
            fontInEmphasis: "#fff",
        },
    },
    {
        light: {
            barbg: "#D7E3F8",
            bg: "#FAFAFF",
            emphasis: "#D7E3F8",
            fontColor: "#1A1C1E",
            fontInEmphasis: "#1A1C1E",
        },
        dark: {
            barbg: "#3B4858",
            bg: "#1A1C1E",
            emphasis: "#3B4858",
            fontColor: "#FAFAFF",
            fontInEmphasis: "#FAFAFF",
        },
    },
    {
        light: {
            barbg: "#D5E8CF",
            bg: "#FCFDF6",
            emphasis: "#D5E8CF",
            fontColor: "#1A1C19",
            fontInEmphasis: "#1A1C19",
        },
        dark: {
            barbg: "#3B4B38",
            bg: "#1A1C19",
            emphasis: "#3B4B38",
            fontColor: "#FCFDF6",
            fontInEmphasis: "#FCFDF6",
        },
    },
];

function getDefaultSetting() {
    if (defaultSetting) return defaultSetting;
    defaultSetting = renderSendSync("getDefaultSetting", []);
    return defaultSetting;
}

function isSettingItemSame(a: unknown, b: unknown) {
    return isDeepStrictEqual(a, b);
}

function renderSetting(settingPath: KeyPath) {
    const setting = Object.hasOwn(s, settingPath)
        ? s[settingPath as SettingPath]
        : Object.hasOwn(xs, settingPath)
          ? xs[settingPath as JustElmentK]
          : null;
    if (!setting) {
        const err = new Error(`Setting ${settingPath} not found`);
        console.error(err);
        return null;
    }
    const el = setting.el(0 as never);
    if (el.el.matches(".settings-switch")) {
        el.el.setAttribute("aria-label", setting.name);
        if (setting.desc) el.el.dataset.title = setting.desc;
    }
    // @ts-ignore
    scheduler.postTask(() => {
        if (Object.hasOwn(s, settingPath)) {
            const sp = settingPath as SettingPath;
            el.sv(getSet(sp)).on("input", (e) => {
                if (e.target === e.currentTarget) {
                    const value = el.gv;
                    if (value !== null && value !== undefined) {
                        setSet(sp, value);
                        for (const p of bind[settingPath] ?? []) {
                            reRenderSetting(p);
                        }
                    }
                }
            });
        }
    });
    const pel = view("x", "wrap")
        .style({ justifyContent: "space-between" })
        .class(Class.gap, "settings-row")
        .data({ name: settingPath })
        .add([
            view()
                .class("row-caption")
                .add([
                    p(setting.name, true).class("setting-name"),
                    setting.desc ? comment(setting.desc) : "",
                ]),
            el,
        ]);
    if (el.el.getAttribute("data-xtype") === "switch") {
        pel.style({ cursor: "pointer" }).on("click", (e) => {
            if (el.el.contains(e.target as HTMLElement)) return;
            el.el.click();
        });
    }
    setEidtedItem(pel, nowStoreK.has(settingPath as SettingPath));
    pel.on("contextmenu", (e) => {
        if (
            (e.target as Element).closest(
                "input, textarea, [contenteditable=true]",
            )
        )
            return;
        contextMenu.clear();
        if (
            getSet(settingPath as SettingPath) !==
            getFromStore(getDefaultSetting(), settingPath as SettingPath)
        ) {
            contextMenu.add(
                view()
                    .add("恢复默认值")
                    .on("click", () => {
                        setSet(
                            settingPath as SettingPath,
                            getFromStore(
                                getDefaultSetting(),
                                settingPath as SettingPath,
                            ),
                        );
                        reRenderSetting(settingPath);
                    }),
            );
            e.preventDefault();
            showContextMenu(e);
        }
    });
    return pel;
}

function reRenderSetting(settingPath: KeyPath) {
    const el = document.querySelector(`[data-name="${settingPath}"]`);
    if (!el) return;
    // todo sv
    console.log("rerender", settingPath);
    const nel = renderSetting(settingPath);
    if (nel) el.replaceWith(nel.el);
}

function renderSettingList(keys: string[], title?: string) {
    mainView.clear();
    mainViewP.el.scrollTop = 0;
    const page = view().class("settings-page").addInto(mainView);
    if (title) page.add(ele("h1").add(noI18n(title)));
    const groups = new Map<string, string[]>();
    for (const key of keys) {
        const heading =
            getTitles
                .get(key)
                ?.map((part) => t(part))
                .join("  /  ") || t("未知路径");
        const list = groups.get(heading) ?? [];
        list.push(key);
        groups.set(heading, list);
    }
    for (const [heading, entries] of groups) {
        page.add(ele("h2").add(noI18n(heading)));
        page.add(
            view("y")
                .class("settings-group")
                .add(entries.map((key) => renderSetting(key as KeyPath))),
        );
    }
}

function iconEl(img: IconType) {
    return image(getImgUrl(`${img}.svg`), noI18n(img)).class("icon");
}

function comment(str: string) {
    return p(str, true).style({
        color: "var(--settings-muted)",
        fontSize: "0.86em",
        lineHeight: 1.45,
    });
}

function xGroup(r: "x" | "y" = "x") {
    return view(r, "wrap").class(Class.gap);
}

function xSelect<T extends string>(
    options: {
        value: T;
        name?: string | ElType<HTMLElement> | ReturnType<typeof noI18n>;
    }[],
    name: string,
) {
    const el = view()
        .class(blockSetting, "settings-options")
        .attr({ role: "radiogroup", ariaLabel: t(name) });
    const r = radioGroup<T>(`${name}-${crypto.randomUUID()}`, true);
    for (const option of options) {
        const choice = r
            .new(option.value, option.name)
            .class("settings-option");
        if (name === "代理") {
            const help: Record<string, string> = {
                system: "使用操作系统的代理设置",
                fixed_servers: "按协议指定代理服务器",
                pac_script: "通过 PAC 脚本选择代理",
                auto_detect: "自动发现网络中的代理",
                direct: "直接连接网络",
            };
            choice.el.dataset.title = t(help[option.value]);
        }
        if (name === "OCR类型") {
            const online =
                option.value.startsWith("ai-") ||
                ["baidu", "youdao"].includes(option.value);
            const glyph = option.value.startsWith("ai-")
                ? "ai_check"
                : online
                  ? "link"
                  : "ocr";
            const mark = image(getImgUrl(`${glyph}.svg`), noI18n("")).class(
                "engine-icon",
            );
            choice.el.prepend(mark.el);
            choice.add(
                txt(online ? "在线识别" : "本地识别").class("engine-source"),
            );
            choice.class("engine-choice");
        }
        el.add(choice);
    }
    r.on(() => el.el.dispatchEvent(new CustomEvent("input")));
    return el.bindGet(() => r.get()).bindSet((value: T) => r.set(value));
}

// todo 精度
function xRange(
    op?: Partial<{ min: number; max: number; step: number; text: string }>,
) {
    const min = op?.min ?? 0;
    const max = op?.max ?? 100;
    const step = op?.step ?? 1;
    const p = Math.max(
        ...[min, max, step]
            .map((i) => (i === 0 ? 1 : i < 0 ? Math.abs(i) : i))
            .map((i) => Math.abs(Math.log10(i))),
    );
    let value = min;
    function sv(v: number) {
        const nv = (Math.round((v - min) / step) * step + min).toFixed(p);
        const nv1 = Math.max(min, Math.min(max, Number.parseFloat(nv)));
        return nv1;
    }
    const el = view("x")
        .style({ alignItems: "center" })
        .class(Class.gap, blockSetting);
    const track = view()
        .style({
            width: "200px",
            height: "24px",
            overflow: "hidden",
            cursor: "ew-resize",
        })
        .class(Class.deco)
        .addInto(el);
    const thumb = view()
        .style({
            backgroundColor: cssColor.main,
            borderRadius: "inherit",
            height: "100%",
        })
        .addInto(track)
        .bindSet((v: number, el) => {
            el.style.width = `${((v - min) / (max - min)) * 100}%`;
        });
    const text = txt()
        .style({ userSelect: "none" })
        .class(Class.mono)
        .attr({ tabIndex: 0 })
        .bindSet((v: number, el) => {
            el.textContent = `${sv(v)}${op?.text || ""}`;
        })
        .on("keydown", (e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
        })
        .on("keyup", (e) => {
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            e.preventDefault();
            const v = sv(value + (e.key === "ArrowUp" ? step : -step));
            thumb.sv(v);
            text.sv(v);
            value = v;
            el.el.dispatchEvent(new CustomEvent("input"));
        })
        .addInto(el);
    trackPoint(track, {
        ing: (_p, e) => {
            const x =
                (e.clientX - track.el.getBoundingClientRect().left) /
                track.el.offsetWidth;
            const v = sv(min + x * (max - min));
            thumb.sv(v);
            text.sv(v);
            value = v;
        },
        end: () => {
            el.el.dispatchEvent(new CustomEvent("input"));
        },
    });
    return el
        .bindGet(() => value)
        .bindSet((_v: number) => {
            const v = sv(_v);
            thumb.sv(v);
            text.sv(v);
            value = v;
        });
}

function xNumber(
    dw: string,
    op?: Partial<{ min: number; max: number; step: number }>,
) {
    const el = input("number");
    if (op?.max !== undefined) el.attr({ max: String(op.max) });
    if (op?.min !== undefined) el.attr({ min: String(op.min) });
    if (op?.step !== undefined) el.attr({ step: String(op.step) });
    const pel = view("x")
        .class("measure-input")
        .add([el, dw ? txt(dw, true).class("measure-unit") : ""])
        .bindGet(() => el.el.valueAsNumber)
        .bindSet((v: number) => el.sv(String(v)));
    el.on("input", () => {
        if (Number.isFinite(el.el.valueAsNumber))
            pel.el.dispatchEvent(new CustomEvent("input"));
    });

    return pel;
}

function xSwitch() {
    const i = input("checkbox").class("settings-switch");
    const el = i
        .data({ xtype: "switch" })
        .bindGet(() => i.el.checked)
        .bindSet((v: boolean) => {
            i.el.checked = v;
        });
    return el;
}

function xColor() {
    return colorPicker({ width: baseWidth2 });
}

function xPath(dir: boolean) {
    const el = view("x").class(Class.group).style({ width: baseWidth });
    const i = input().on("input", () => {
        el.el.dispatchEvent(new CustomEvent("input"));
    });
    const b = button(iconEl("file"))
        .attr({
            title: dir ? "选择目录" : "选择文件",
            ariaLabel: t(dir ? "选择目录" : "选择文件"),
        })
        .on("click", () => {
            const path = renderSendSync("selectPath", [
                i.gv,
                dir ? ["openDirectory"] : ["openFile"],
            ]);
            if (path) {
                i.sv(path);
                el.el.dispatchEvent(new CustomEvent("input"));
            }
        })
        .on("dragover", (e) => {
            e.preventDefault();
        })
        .on("dragleave", () => {})
        .on("drop", (e) => {
            e.preventDefault();
            console.log(e);
            const fs = Array.from(e.dataTransfer?.files || [])[0];
            i.sv(webUtils.getPathForFile(fs));
            el.el.dispatchEvent(new CustomEvent("input"));
        });
    return el
        .add([i, b])
        .bindGet(() => i.gv)
        .bindSet((v: string) => i.sv(v));
}

function secretEye(control: ReturnType<typeof input>) {
    const icon = image(getImgUrl("eye.svg"), noI18n(""));
    const toggle = button(icon).class("secret-eye");
    function mask(masked: boolean) {
        control.el.type = masked ? "password" : "text";
        icon.el.src = getImgUrl(masked ? "eye.svg" : "hide.svg");
        toggle.attr({
            title: masked ? "显示" : "隐藏",
            ariaLabel: t(masked ? "显示" : "隐藏"),
        });
        toggle.el.setAttribute("aria-pressed", String(!masked));
    }
    mask(true);
    toggle
        .on("mousedown", (e) => e.preventDefault())
        .on("click", () => mask(control.el.type !== "password"));
    return { button: toggle, mask };
}
function xSecret() {
    const control = input("password").attr({ autocomplete: "off" });
    const eye = secretEye(control);
    const wrap = view("x").class("secret-control").add([control, eye.button]);
    control.on("input", () => wrap.el.dispatchEvent(new Event("input")));
    return wrap
        .bindGet(() => control.gv)
        .bindSet((v: string) => {
            control.sv(v);
            eye.mask(true);
        });
}

function xFont() {
    const el = view("x").class(Class.group).style({ width: baseWidth });
    const i = input().on("input", () =>
        el.el.dispatchEvent(new CustomEvent("input")),
    );
    const q = button(iconEl("search"))
        .attr({ title: "选择字体", ariaLabel: t("选择字体") })
        .on("click", async () => {
            const fonts =
                // @ts-ignore
                (await window.queryLocalFonts()) as {
                    postscriptName: string;
                    fullName: string;
                    family: string;
                    style: string;
                }[];
            const list = Array.from(
                new Set([
                    ...fonts.map((i) => i.fullName),
                    ...fonts.map((i) => i.family),
                ]),
            ).sort() as string[];

            const pageN = 15;
            let thePage = 0;

            function showPage(page: number) {
                thePage = page;
                const start = page * pageN;
                const end = start + pageN;
                const nowV = i.gv;
                const prev = preview.gv;
                listEl.clear();
                for (let n = start; n < end && n < list.length; n++) {
                    listEl.add(
                        view("x")
                            .add(
                                prev
                                    ? [noI18n(prev), spacer(), noI18n(list[n])]
                                    : noI18n(list[n]),
                            )
                            .style({
                                fontFamily: list[n],
                                paddingInline: "4px",
                                borderRadius: "var(--border-radius)",
                                backgroundColor:
                                    nowV === list[n] ? cssColor.b : "",
                            })
                            .on("click", () => {
                                i.sv(list[n]);
                                el.el.dispatchEvent(new CustomEvent("input"));
                                close();
                            })
                            .class(Class.button),
                    );
                }
            }

            function close() {
                listPEl.remove();
            }

            const listPEl = ele("dialog")
                .on("close", (e) =>
                    (e.currentTarget as HTMLDialogElement).remove(),
                )
                .class("font-dialog")
                .attr({ ariaLabel: t("字体") });
            listPEl.add(ele("h2").add("字体"));
            const listP = view("y").class(Class.gap).addInto(listPEl);
            const preview = input()
                .style({ width: "auto" })
                .attr({ placeholder: t("预览字体") })
                .on("input", () => {
                    showPage(thePage);
                })
                .addInto(listP);
            const listEl = view().addInto(listP);
            const nav = view("x").style({ overflowX: "scroll" });

            const nowPage = list.includes(i.gv)
                ? Math.floor(list.indexOf(i.gv) / pageN)
                : 0;

            showPage(nowPage);

            nav.add(
                Array.from({ length: Math.ceil(list.length / pageN) }, (_, i) =>
                    button(String(i + 1))
                        .on("click", () => {
                            showPage(i);
                        })
                        .style({
                            backgroundColor: i === nowPage ? cssColor.b : "",
                        }),
                ),
            );
            listP.add(
                view("x").add([
                    nav,
                    button(iconEl("close"))
                        .attr({ title: "关闭", ariaLabel: t("关闭") })
                        .on("click", () => {
                            close();
                        }),
                ]),
            );

            listPEl.addInto().el.showModal();
        });
    return el
        .add([i, q])
        .bindGet(() => i.gv)
        .bindSet((v: string) => {
            i.sv(v);
        });
}

function pathEl(path: string) {
    return txt(path, true)
        .class(Class.mono, Class.click)
        .on("click", () => shell.openPath(path));
}

function sortable() {
    const groupId = `sortable-${crypto.randomUUID()}`;
    console.log(groupId);

    return (
        pel: ElType<HTMLElement>,
        op: {
            dir?: "x" | "y";
            handle?: (el: ElType<HTMLElement>) => boolean;
            onEnd: () => void;
        },
    ) => {
        const idKey = "sortableid";
        const dataType = "esearch/sortable";

        function bindEl(child: ElType<HTMLElement>) {
            child
                .attr({ draggable: true })
                .on("dragstart", (e) => {
                    const canMove =
                        !op.handle ||
                        op.handle(
                            pack(
                                document.elementFromPoint(
                                    e.clientX,
                                    e.clientY,
                                ) as HTMLElement,
                            ),
                        );
                    if (!canMove) {
                        e.preventDefault();
                        return;
                    }

                    const transfer = e.dataTransfer;
                    if (!transfer) return;

                    const thisId = crypto.randomUUID();
                    transfer.setData(
                        dataType,
                        JSON.stringify({ id: thisId, group: groupId }),
                    );
                    child.data({ [idKey]: thisId });
                })
                .on("dragend", () => {
                    child.el.removeAttribute(`data-${idKey}`);
                });
        }
        function getChild() {
            return pel.queryAll(":scope > *");
        }
        for (const child of getChild()) {
            bindEl(child);
        }
        pel.on("pointerdown", () => {
            const childNodes = getChild();
            for (const child of childNodes) {
                if (!child.el.draggable) bindEl(child);
            }
        });
        pel.on("dragover", (e) => {
            e.preventDefault();
        });
        pel.on("drop", (e) => {
            e.preventDefault();

            const data = e.dataTransfer?.getData(dataType);
            if (!data) return;
            const { id, group } = JSON.parse(data) as {
                id: string;
                group: string;
            };
            if (group !== groupId) return;

            const el = pack(document.body).query(`[data-${idKey}="${id}"]`);
            if (!el) return;

            const target = e.target as HTMLElement;
            if (el.el.contains(target)) return;

            const mousePoint = { x: e.clientX, y: e.clientY };
            const dir = op.dir || "y";
            function dis(
                p1: { x: number; y: number },
                p2: { x: number; y: number },
            ) {
                return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
            }
            const cel = getChild().reduce(
                (closest, child) => {
                    const rect = child.el.getBoundingClientRect();
                    const offset =
                        dir === "y"
                            ? dis(mousePoint, {
                                  x: rect.left + rect.width / 2,
                                  y: rect.top,
                              })
                            : dis(mousePoint, {
                                  x: rect.left,
                                  y: rect.top + rect.height / 2,
                              });
                    if (offset < closest.offset) {
                        return { offset, el: child };
                    }
                    return closest;
                },
                {
                    offset: Number.POSITIVE_INFINITY,
                    el: null as ElType<HTMLElement> | null,
                },
            ).el;
            for (const i of getChild())
                i.style({ viewTransitionName: crypto.randomUUID() });

            document.startViewTransition(() => {
                if (!cel) {
                    pel.el.appendChild(el.el);
                } else {
                    pel.el.insertBefore(el.el, cel.el);
                }

                op.onEnd();
            });
        });
    };
}

function actionChoices(imageTranslation = true) {
    return selectionTools.map((tool) => ({
        value: tool.key,
        icon: tool.icon,
        name: t(
            imageTranslation && tool.key === "translate"
                ? "框选并翻译图片"
                : tool.title,
        ),
        group: t(tool.group),
    }));
}

type ActionChoice<T extends string> = {
    value: T;
    name: string;
    group: string;
    icon?: IconType;
};

function actionPicker<T extends string>(
    options: () => ActionChoice<T>[],
    initial: T,
) {
    const root = view().class("action-picker");
    const trigger = button()
        .class("action-trigger")
        .attr({ ariaHasPopup: "listbox", ariaExpanded: "false" })
        .addInto(root);
    const listId = `actions-${crypto.randomUUID()}`;
    const recentKey = "最近选择的动作";
    let selected = initial;
    let closeMenu: ((focus?: boolean) => void) | undefined;
    function setValue(next: T) {
        selected = next;
        const entry = options().find((o) => o.value === next);
        const name = entry?.name ?? t("选择动作");
        trigger
            .clear()
            .add([
                image(
                    getImgUrl(
                        `${entry?.icon ?? (entry ? "filters" : "add")}.svg`,
                    ),
                    noI18n(""),
                ),
                view("y")
                    .class("action-trigger-label")
                    .add([
                        txt(name, true),
                        entry?.group
                            ? txt(entry.group, true).class("rule-category")
                            : "",
                    ]),
                image(getImgUrl("down.svg"), noI18n("")).class(
                    "action-chevron",
                ),
            ])
            .attr({ title: "选择动作", ariaLabel: name });
    }
    const families = {
        capture: { name: "截屏", icon: "rect_select" },
        drawing: { name: "绘制", icon: "draw" },
        filters: { name: "图像滤镜", icon: "filters" },
    } as const;
    function familyOf(key: string) {
        if (key.startsWith("filter.")) return "filters";
        if (key.startsWith("draw.") || key.startsWith("shape."))
            return "drawing";
        return "capture";
    }
    function glyph(icon: IconType) {
        const el = ele("span")
            .class("directory-glyph")
            .attr({ ariaHidden: "true" });
        el.el.style.setProperty(
            "--glyph",
            `url("${getImgUrl(`${icon}.svg`)}")`,
        );
        return el;
    }
    function open() {
        if (closeMenu) return;
        const entries = options();
        if (!entries.length) return;
        const byId = new Map(entries.map((e) => [e.value, e]));
        const saved = safeJSONParse<unknown>(
            localStorage.getItem(recentKey),
            [],
        );
        const recent = Array.isArray(saved)
            ? saved
                  .filter((v): v is string => typeof v === "string")
                  .slice(0, 6)
            : [];
        const menu = view("y")
            .class("action-directory")
            .attr({ popover: "manual" })
            .addInto(root);
        const query = input().attr({
            role: "combobox",
            ariaLabel: t("搜索动作"),
            placeholder: t("搜索动作"),
            autocomplete: "off",
            spellcheck: false,
            ariaAutoComplete: "list",
        });
        query.el.setAttribute("aria-expanded", "true");
        query.el.setAttribute("aria-controls", listId);
        trigger.el.setAttribute("aria-controls", listId);
        const head = view("y").class("directory-head").addInto(menu);
        head.add(
            view("x")
                .class("directory-search")
                .add([
                    glyph("search"),
                    query,
                    button(noI18n("Esc"))
                        .class("directory-dismiss")
                        .attr({
                            title: "关闭",
                            ariaLabel: t("关闭"),
                            tabIndex: -1,
                        })
                        .on("mousedown", (e) => e.preventDefault())
                        .on("click", () => close(true)),
                ]),
        );
        const shortcuts = view("x", "wrap")
            .class("directory-shortcuts")
            .addInto(head);
        const list = view()
            .class("directory-columns")
            .attr({ id: listId, role: "listbox", ariaLabel: t("选择动作") })
            .addInto(menu);
        const controller = new AbortController();
        let frame = 0,
            active = -1;
        let rows: HTMLButtonElement[] = [];
        let columns: HTMLButtonElement[][] = [];
        function close(focus = false) {
            if (controller.signal.aborted) return;
            controller.abort();
            cancelAnimationFrame(frame);
            if (menu.el.matches(":popover-open")) menu.el.hidePopover();
            menu.remove();
            closeMenu = undefined;
            trigger.el.setAttribute("aria-expanded", "false");
            trigger.el.removeAttribute("aria-controls");
            if (focus) trigger.el.focus({ preventScroll: true });
        }
        function choose(entry: ActionChoice<T>) {
            if (entry.value !== "no") {
                const ids = [
                    entry.value,
                    ...recent.filter((v) => v !== entry.value),
                ].slice(0, 6);
                localStorage.setItem(recentKey, JSON.stringify(ids));
            }
            setValue(entry.value);
            close(true);
            root.el.dispatchEvent(new Event("input"));
        }
        function chips(label: string, ids: string[]) {
            const choices = ids.flatMap((id) => byId.get(id as T) ?? []);
            if (!choices.length) return;
            const group = view("x", "wrap")
                .class("directory-chip-group")
                .attr({ role: "group", ariaLabel: t(label) });
            group.add(txt(label).class("directory-chip-label"));
            for (const entry of choices)
                group.add(
                    button([
                        glyph(entry.icon ?? "filters"),
                        txt(entry.name, true),
                    ])
                        .data({ family: familyOf(entry.value) })
                        .attr({ tabIndex: -1 })
                        .on("mousedown", (e) => e.preventDefault())
                        .on("click", () => choose(entry)),
                );
            shortcuts.add(group);
        }
        const recentChoices = recent
            .filter((id) => byId.has(id as T))
            .slice(0, 4);
        chips(
            "常用",
            [
                "draw.free",
                "shape.arrow",
                "filter.pixelate",
                "translate",
                "copy",
                "save",
            ]
                .filter(
                    (id) => byId.has(id as T) && !recentChoices.includes(id),
                )
                .slice(0, 4),
        );
        chips("最近选择", recentChoices);
        function position() {
            frame = 0;
            if (!trigger.el.isConnected) {
                close();
                return;
            }
            const r = trigger.el.getBoundingClientRect(),
                gap = 8;
            const width = Math.min(790, innerWidth - gap * 2),
                height = Math.min(554, innerHeight - gap * 2);
            const left = Math.max(
                gap,
                Math.min(r.left, innerWidth - width - gap),
            );
            // A large directory can overlap the invoking row, like a desktop command menu.
            const top = Math.max(
                gap,
                Math.min(r.bottom + 4, innerHeight - height - gap),
            );
            menu.style({
                left: `${left}px`,
                top: `${top}px`,
                width: `${width}px`,
                maxHeight: `${height}px`,
            });
        }
        function schedule(e: Event) {
            if (e.target instanceof Node && menu.el.contains(e.target)) return;
            if (!frame) frame = requestAnimationFrame(position);
        }
        function highlight(index: number, scroll = false) {
            if (!rows.length) return;
            rows[active]?.classList.remove("directory-active");
            active = Math.max(0, Math.min(rows.length - 1, index));
            const row = rows[active];
            row.classList.add("directory-active");
            query.el.setAttribute("aria-activedescendant", row.id);
            if (scroll) {
                list.el.dataset.navigation = "keyboard";
                const r = row.getBoundingClientRect(),
                    box = list.el.getBoundingClientRect();
                if (r.top < box.top) list.el.scrollTop += r.top - box.top;
                else if (r.bottom > box.bottom)
                    list.el.scrollTop += r.bottom - box.bottom;
            }
        }
        function render() {
            const terms = query.gv
                .trim()
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean);
            rows = [];
            columns = [];
            active = -1;
            list.el.dataset.navigation = terms.length ? "keyboard" : "pointer";
            list.clear();
            list.el.scrollTop = 0;
            query.el.removeAttribute("aria-activedescendant");
            const buckets = new Map<string, Map<string, ActionChoice<T>[]>>();
            for (const entry of entries) {
                const key = entry.value;
                const family = familyOf(key);
                let section = entry.group;
                if (family === "filters") {
                    if (["filter.blur", "filter.pixelate"].includes(key))
                        section = t("常用");
                    else if (key.startsWith("filter.gray_"))
                        section = t("灰度");
                    else if (
                        [
                            "filter.brightness",
                            "filter.contrast",
                            "filter.saturation",
                            "filter.hue",
                            "filter.gamma",
                        ].includes(key)
                    )
                        section = t("色彩调整");
                    else section = t("滤镜效果");
                }
                const keywords = [
                    t(families[family].name),
                    section,
                    entry.group,
                    entry.name,
                    key,
                ]
                    .join(" ")
                    .toLowerCase();
                if (!terms.every((term) => keywords.includes(term))) continue;
                const groups =
                    buckets.get(family) ?? new Map<string, ActionChoice<T>[]>();
                const items = groups.get(section) ?? [];
                items.push(entry);
                groups.set(section, items);
                buckets.set(family, groups);
            }
            for (const [family, { name, icon }] of Object.entries(families)) {
                const groups = buckets.get(family);
                if (!groups) continue;
                const column = view("y")
                    .class("directory-column")
                    .data({ family })
                    .attr({ role: "group", ariaLabel: t(name) })
                    .addInto(list);
                column.add(
                    view("x")
                        .class("directory-column-title")
                        .add([
                            view()
                                .class("directory-family-icon")
                                .add(glyph(icon)),
                            txt(name),
                            txt(
                                String(
                                    Array.from(groups.values()).reduce(
                                        (total, items) => total + items.length,
                                        0,
                                    ),
                                ),
                                true,
                            ).class("directory-total"),
                        ]),
                );
                const lane: HTMLButtonElement[] = [];
                columns.push(lane);
                for (const [title, items] of groups) {
                    const group = view("y")
                        .class("directory-section")
                        .attr({ role: "group", ariaLabel: title })
                        .addInto(column);
                    group.add(
                        view("x")
                            .class("directory-section-title")
                            .add([
                                txt(title, true),
                                txt(String(items.length), true),
                            ]),
                    );
                    for (const entry of items) {
                        const row = button([
                            glyph(entry.icon ?? "filters"),
                            txt(entry.name, true).class(
                                "directory-option-name",
                            ),
                        ])
                            .attr({
                                role: "option",
                                tabIndex: -1,
                                id: `${listId}-${rows.length}`,
                            })
                            .data({ value: entry.value });
                        row.el.setAttribute(
                            "aria-selected",
                            String(entry.value === selected),
                        );
                        group.add(row);
                        lane.push(row.el);
                        rows.push(row.el);
                    }
                }
            }
            if (!rows.length) {
                list.add(
                    txt("无结果，尝试其他关键词")
                        .class("directory-empty")
                        .attr({ role: "status" }),
                );
                return;
            }
            const current = rows.findIndex((b) => b.dataset.value === selected);
            highlight(terms.length ? 0 : Math.max(0, current));
        }
        list.on("mousedown", (e) => e.preventDefault()).on("click", (e) => {
            const id = (e.target as Element).closest<HTMLButtonElement>(
                "[data-value]",
            )?.dataset.value;
            const entry = byId.get(id as T);
            if (entry) choose(entry);
        });
        list.on("pointermove", (e) => {
            if (e.pointerType !== "mouse" || (!e.movementX && !e.movementY))
                return;
            const row = (e.target as Element).closest<HTMLButtonElement>(
                "[data-value]",
            );
            if (!row) return;
            if (list.el.dataset.navigation !== "pointer")
                list.el.dataset.navigation = "pointer";
            if (row !== rows[active]) highlight(rows.indexOf(row));
        });
        query.on("input", render).on("keydown", (e) => {
            if (e.isComposing) return;
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                close(true);
                return;
            }
            if (e.key === "Tab") {
                close(true);
                return;
            }
            if (e.key === "Enter") {
                e.preventDefault();
                rows[active]?.click();
                return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                highlight(active + (e.key === "ArrowDown" ? 1 : -1), true);
                return;
            }
            if (
                (e.key === "ArrowRight" || e.key === "ArrowLeft") &&
                (!query.gv || e.altKey) &&
                active >= 0
            ) {
                e.preventDefault();
                const lane = columns.findIndex((c) => c.includes(rows[active]));
                const next = columns[lane + (e.key === "ArrowRight" ? 1 : -1)];
                if (next)
                    highlight(
                        rows.indexOf(
                            next[
                                Math.min(
                                    columns[lane].indexOf(rows[active]),
                                    next.length - 1,
                                )
                            ],
                        ),
                        true,
                    );
            }
        });
        closeMenu = close;
        position();
        menu.el.showPopover();
        render();
        trigger.el.setAttribute("aria-expanded", "true");
        query.el.focus({ preventScroll: true });
        const { signal } = controller;
        menu.el.addEventListener(
            "toggle",
            () => {
                if (!menu.el.matches(":popover-open")) close();
            },
            { signal },
        );
        document.addEventListener(
            "pointerdown",
            (e) => {
                if (!root.el.contains(e.target as Node)) close();
            },
            { capture: true, signal },
        );
        document.addEventListener(
            "focusin",
            (e) => {
                if (!root.el.contains(e.target as Node)) close();
            },
            { signal },
        );
        window.addEventListener("resize", schedule, { signal });
        document.addEventListener("scroll", schedule, {
            capture: true,
            signal,
        });
        root.el
            .closest("dialog")
            ?.addEventListener("close", () => close(), { once: true, signal });
    }
    trigger
        .on("click", () => (closeMenu ? closeMenu(true) : open()))
        .on("keydown", (e) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                open();
            }
        });
    setValue(initial);
    return Object.assign(root.bindGet(() => selected).bindSet(setValue), {
        open,
        close: () => closeMenu?.(),
    });
}

function selectionShortcutEditor() {
    type Rules = setting["全局工具快捷键"];
    type Action = SelectionAction | "";
    const root = view("y").class("selection-shortcuts"),
        list = view("y").class("selection-rule-list");
    const add = button([
        image(getImgUrl("add.svg"), noI18n("")),
        txt("添加动作"),
    ]).class("settings-add");
    const available = actionChoices();
    let rules: Rules;
    let draft: ReturnType<typeof actionPicker<Action>> | undefined;
    function without(action: SelectionAction) {
        const next = { ...rules };
        if (isDrawingAction(action)) delete next[action];
        else next[action] = "";
        return next;
    }
    function drawRow(
        original: Action,
        registered: Set<SelectionAction>,
        replacing?: HTMLElement,
    ) {
        const row = view().class("selection-rule").data({ action: original });
        if (replacing) replacing.replaceWith(row.el);
        else list.add(row);
        const choices = (): ActionChoice<Action>[] => {
            const items: ActionChoice<Action>[] = available.filter(
                (o) => o.value === original || !rules[o.value],
            );
            const legacy = captureTools.find(
                (t) =>
                    (t.key === "close" || t.key === "screens") &&
                    t.key === original,
            );
            if (legacy)
                items.push({
                    value: legacy.key,
                    name: t(legacy.title),
                    group: t(legacy.group),
                    icon: legacy.icon,
                });
            return items;
        };
        const choice = actionPicker<Action>(choices, original);
        const chord = hotkey(true)
            .sv(original ? (rules[original] ?? "") : "")
            .class("inline-chord");
        const recorder = chord.el.querySelector<HTMLElement>(".b-like")!;
        recorder.setAttribute(
            "aria-label",
            original
                ? t("快捷键") +
                      " · " +
                      choice.el.querySelector(".action-trigger-name")
                          ?.textContent
                : t("请录入快捷键"),
        );
        const status = ele("output")
            .class("rule-status")
            .attr({ role: "status" });
        function feedback(text: string, error = false) {
            status.el.textContent = text;
            status.el.classList.toggle("unavailable", error);
        }
        function commit() {
            const action = choice.gv,
                key = chord.gv;
            if (!action) {
                choice.open();
                return;
            }
            if (!key) {
                feedback(t("请录入快捷键"));
                recorder.focus({ preventScroll: true });
                return;
            }
            if (action !== original && rules[action]) {
                choice.sv(original);
                feedback(t("动作已存在"), true);
                return;
            }
            const next =
                original && original !== action
                    ? without(original)
                    : { ...rules };
            next[action] = key;
            if (!setSet("全局工具快捷键", next, action)) {
                if (original) {
                    choice.sv(original);
                    chord.sv(rules[original] ?? "");
                }
                feedback(t("快捷键注册失败，可能被其他程序占用"), true);
                return;
            }
            rules = next;
            if (!original) draft = undefined;
            if (document.activeElement === recorder) recorder.blur();
            drawRow(action, new Set([action]), row.el);
            updateAdd();
            list.el
                .querySelector<HTMLButtonElement>(
                    `[data-action="${CSS.escape(action)}"] .action-trigger`,
                )
                ?.focus({ preventScroll: true });
        }
        choice.on("input", (e) => {
            if (e.target === choice.el) commit();
        });
        chord.on("input", (e) => {
            if (e.target === chord.el) commit();
        });
        const label =
            choices().find((o) => o.value === original)?.name ?? t("添加动作");
        const remove = button(iconEl("clear"))
            .class("remove-action")
            .attr({ title: "删除", ariaLabel: `${t("删除")} ${label}` })
            .on("click", () => {
                if (original) {
                    const next = without(original);
                    if (!setSet("全局工具快捷键", next)) return;
                    rules = next;
                }
                if (!original) draft = undefined;
                row.remove();
                updateAdd();
                add.el.focus({ preventScroll: true });
            });
        row.add([choice, chord, status, remove]);
        if (original) {
            const ok = registered.has(original);
            feedback(
                t(ok ? "已生效" : "快捷键注册失败，可能被其他程序占用"),
                !ok,
            );
        } else {
            draft = choice;
            choice.open();
        }
    }
    function paint() {
        if (
            list.el.contains(document.activeElement) &&
            document.activeElement instanceof HTMLElement
        )
            document.activeElement.blur();
        draft?.close();
        draft = undefined;
        list.clear();
        const registered = new Set(
            renderSendSync("selectionShortcutStatus", []),
        );
        for (const tool of [
            ...selectionTools,
            ...captureTools.filter(
                (t) => t.key === "close" || t.key === "screens",
            ),
        ]) {
            if (rules[tool.key]) drawRow(tool.key, registered);
        }
        updateAdd();
    }
    function updateAdd() {
        add.el.disabled = available.every((option) =>
            Boolean(rules[option.value]),
        );
    }
    add.on("click", () => (draft ? draft.open() : drawRow("", new Set())));
    return root
        .add([list, add])
        .bindGet(() => rules)
        .bindSet((value: Rules) => {
            rules = value;
            paint();
        });
}

function sortTool() {
    const catalog = [...tools, ...drawTools];
    const meta = new Map(catalog.map((item) => [item.key, item]));
    const captions = {
        capture: "截屏工具栏",
        draw: "编辑栏",
        more: "更多",
        hidden: "隐藏",
    };
    const editor = view().class("toolbar-layout");
    const zone = view().class("toolbar-zones").addInto(editor);
    const controls = view("x", "wrap").class("toolbar-moves").addInto(editor);
    let layout: ToolbarLayout;
    let selected = "",
        dragging = "";
    function move(key: string, lane: ToolbarLane, before?: string) {
        if (!meta.has(key) || before === key) return;
        for (const list of lanes)
            layout[list] = layout[list].filter((item) => item !== key);
        const index = before ? layout[lane].indexOf(before) : -1;
        layout[lane].splice(index < 0 ? layout[lane].length : index, 0, key);
        selected = key;
        render();
        editor.el.dispatchEvent(new CustomEvent("input"));
        zone.el
            .querySelector<HTMLButtonElement>(
                `[data-tool="${CSS.escape(key)}"]`,
            )
            ?.focus({ preventScroll: true });
    }
    function selectKey(key: string) {
        selected = key;
        for (const el of zone.el.querySelectorAll<HTMLButtonElement>(
            "[data-tool]",
        ))
            el.setAttribute("aria-pressed", String(el.dataset.tool === key));
        controls.clear();
        const lane = lanes.find((l) => layout[l].includes(key));
        if (!lane) return;
        const list = layout[lane],
            index = list.indexOf(key);
        for (const to of lanes)
            if (to !== lane)
                controls.add(
                    button(`${t("移至")} ${t(captions[to])}`).on("click", () =>
                        move(key, to),
                    ),
                );
        controls.add([
            button("前移")
                .attr({ disabled: index === 0 })
                .on("click", () => move(key, lane, list[index - 1])),
            button("后移")
                .attr({ disabled: index === list.length - 1 })
                .on("click", () => move(key, lane, list[index + 2])),
        ]);
    }
    function render() {
        const offsets = new Map(
            Array.from(
                zone.el.querySelectorAll<HTMLElement>(".preview-scroll"),
                (wrap) => [wrap.parentElement?.dataset.lane, wrap.scrollTop],
            ),
        );
        zone.clear();
        for (const lane of lanes) {
            const group = view("y")
                .class("toolbar-zone")
                .attr({ tabIndex: -1, ariaLabel: t(captions[lane]) })
                .data({ lane })
                .addInto(zone);
            group.add(
                view("x")
                    .class("lane-heading")
                    .add([
                        txt(captions[lane]),
                        txt(String(layout[lane].length), true),
                    ]),
            );
            const scroll = view().class("preview-scroll").addInto(group);
            const list = view()
                .class("tool-chips", Class.glassBar)
                .attr({ role: "group", ariaLabel: t(captions[lane]) })
                .addInto(scroll);
            function fixed(key: string, icon: IconType, name: string) {
                const el = view()
                    .class("preview-fixed")
                    .data({ fixed: key })
                    .attr({ title: name, role: "img", ariaLabel: t(name) })
                    .add(iconEl(icon));
                list.add(el);
            }
            if (lane === "draw") fixed("select", "rect_select", "选择");
            if ((lane === "more" || lane === "hidden") && !layout[lane].length)
                list.add(txt("拖到这里").class("empty-lane"));
            function target(e: DragEvent) {
                const chip = (e.target as HTMLElement).closest<HTMLElement>(
                    "[data-tool]",
                );
                if ((e.target as HTMLElement).closest('[data-fixed="select"]'))
                    return layout[lane][0];
                if (!chip || !list.el.contains(chip)) return undefined;
                const bounds = chip.getBoundingClientRect(),
                    key = chip.dataset.tool!;
                const before =
                    lane === "hidden" || lane === "more"
                        ? e.clientX < bounds.left + bounds.width / 2
                        : e.clientY < bounds.top + bounds.height / 2;
                return before
                    ? key
                    : layout[lane][layout[lane].indexOf(key) + 1];
            }
            group
                .on("dragover", (e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
                    group.el.classList.add("drag-over");
                    list.el
                        .querySelector(".insert-before")
                        ?.classList.remove("insert-before");
                    const to = target(e);
                    if (to)
                        list.el
                            .querySelector(`[data-tool="${CSS.escape(to)}"]`)
                            ?.classList.add("insert-before");
                })
                .on("dragleave", (e) => {
                    if (!group.el.contains(e.relatedTarget as Node | null)) {
                        group.el.classList.remove("drag-over");
                        list.el
                            .querySelector(".insert-before")
                            ?.classList.remove("insert-before");
                    }
                });
            group.on("drop", (e) => {
                if (!dragging) return;
                e.preventDefault();
                const key = dragging;
                dragging = "";
                const toMore = Boolean(
                    (e.target as HTMLElement).closest('[data-fixed="more"]'),
                );
                move(
                    key,
                    toMore ? "more" : lane,
                    toMore ? undefined : target(e),
                );
            });
            for (const key of layout[lane]) {
                const item = meta.get(key)!;
                const b = button()
                    .data({ tool: key })
                    .attr({
                        draggable: true,
                        title: item.title,
                        ariaLabel: item.title,
                    })
                    .add(
                        item.icon
                            ? image(item.icon, noI18n(""))
                                  .class("icon")
                                  .attr({ draggable: false })
                            : txt(item.title, true),
                    )
                    .addInto(list);
                if (
                    ["ocr", "search", "record", "long", "translate"].includes(
                        key,
                    )
                )
                    b.data({ choices: "true" });
                b.el.setAttribute("aria-pressed", String(key === selected));
                b.on("click", () => selectKey(key))
                    .on("dragstart", (e) => {
                        dragging = key;
                        if (e.dataTransfer) {
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData("text/plain", key);
                        }
                    })
                    .on("dragend", () => {
                        dragging = "";
                        for (const el of zone.el.querySelectorAll(
                            ".drag-over,.insert-before",
                        ))
                            el.classList.remove("drag-over", "insert-before");
                    });
            }
            if (lane === "draw") {
                const reveal = button(iconEl("more"))
                    .attr({ title: "更多", ariaLabel: t("更多") })
                    .class("preview-more")
                    .data({ fixed: "more" })
                    .addInto(list);
                reveal.on("click", () => {
                    const more =
                        zone.el.querySelector<HTMLElement>(
                            '[data-lane="more"]',
                        );
                    more?.focus({ preventScroll: true });
                    more?.scrollIntoView({ block: "nearest" });
                });
            }
            scroll.el.scrollTop = offsets.get(lane) ?? 0;
        }
        selectKey(selected);
    }
    return editor
        .bindSet((value: setting["工具栏"]["布局"]) => {
            layout = toolbarLayout(
                value,
                getSet("工具栏.功能"),
                getSet("图像编辑.编辑栏.功能"),
                tools.map((t) => t.key),
                drawTools.map((t) => t.key),
            );
            render();
        })
        .bindGet(() => structuredClone(layout));
}

function sortList<t>(
    name: (el: t) => string,
    item: (
        el: t | null,
        dialog: ElType<HTMLDialogElement>,
    ) => Promise<t | null>,
) {
    function onChange() {
        el.el.dispatchEvent(new CustomEvent("input"));
    }
    const el = xGroup("y");
    const listEl = xGroup("x");
    sortable()(listEl, {
        handle: (el) => el.el.classList.contains("sort_handle"),
        dir: "x",
        onEnd: () => {
            onChange();
        },
    });
    const newData: Map<string, { "sort-name": string; data: t }> = new Map();

    function getItem(id: string | null) {
        dialog.el.setAttribute(
            "aria-label",
            el.el.closest("[data-name]")?.querySelector(".setting-name")
                ?.textContent || t("设置"),
        );
        dialog.clear().el.showModal();
        return item(id ? (newData.get(id)?.data ?? null) : null, dialog);
    }

    function addItem(id: string) {
        const itemEl = view("x")
            .style({ alignItems: "center" })
            .class(Class.group)
            .data({ id: id })
            .class("settings-list-item");
        const caption = txt(newData.get(id)?.["sort-name"] ?? "", true);
        const nameEl = button(caption)
            .class("list-edit")
            .attr({ title: "编辑" })
            .on("click", async () => {
                const nv = await getItem(id);
                const oldData = newData.get(id);
                if (!nv || !oldData) return;
                oldData.data = nv;
                oldData["sort-name"] = name(nv);
                nameEl.el.setAttribute(
                    "aria-label",
                    `${t("编辑")} ${oldData["sort-name"]}`,
                );
                caption.sv(oldData["sort-name"]);
                onChange();
            });
        const sortHandle = button(iconEl("handle"))
            .class("sort_handle")
            .attr({ title: "拖动排序", ariaLabel: t("拖动排序") });
        const rm = button(iconEl("delete"))
            .class("remove-action")
            .attr({ title: "删除", ariaLabel: t("删除") })
            .on("click", () => {
                itemEl.remove();
                newData.delete(id);
                onChange();
            });
        nameEl.el.setAttribute(
            "aria-label",
            `${t("编辑")} ${caption.el.textContent}`,
        );
        itemEl.add([sortHandle, nameEl, rm]);
        listEl.add(itemEl);
        listEl.add(addBtn);
    }

    const addBtn = button()
        .class("settings-add")
        .add([image(getImgUrl("add.svg"), noI18n("")), txt("添加")])
        .on("click", async () => {
            const nv = await getItem(null);
            if (!nv) return;
            const uid = crypto.randomUUID().slice(0, 7);
            newData.set(uid, {
                "sort-name": name(nv),
                data: nv,
            });
            addItem(uid);
            onChange();
        });

    const dialog = ele("dialog");

    return el
        .class(blockSetting)
        .add([listEl, dialog])
        .bindGet(() => {
            const list = listEl
                .queryAll("[data-id]")
                .flatMap((i) => newData.get(i.el.dataset.id ?? "")?.data || []);
            return list;
        })
        .bindSet((list: t[]) => {
            listEl.clear();
            newData.clear();
            for (const el of list) {
                const uid = crypto.randomUUID().slice(0, 7);
                newData.set(uid, {
                    "sort-name": name(el),
                    data: el,
                });
            }
            for (const id of newData.keys()) {
                addItem(id);
            }
            listEl.add(addBtn);
        });
}

function dialogSelect<T extends string>(
    options: { value: T; name?: Parameters<typeof txt>[0] }[],
    searchable = false,
    loadOptions?: (signal: AbortSignal) => Promise<T[]>,
) {
    const root = view().class("dialog-select");
    const manual = input().attr({ autocomplete: "off", spellcheck: false });
    const trigger = button().class("choice-trigger");
    const anchor = loadOptions ? manual.el : trigger.el;
    const text = txt("", true);
    if (loadOptions) {
        root.class("editable-choice").add(manual);
        trigger.attr({ title: "获取模型列表", ariaLabel: t("获取模型列表") });
    } else trigger.add(text);
    root.add(trigger.add(image(getImgUrl("down.svg"), noI18n(""))));
    const menu = view()
        .class("dialog-menu")
        .attr({ popover: "manual" })
        .addInto(root);
    const listId = `choices-${crypto.randomUUID()}`;
    anchor.setAttribute("role", "combobox");
    anchor.setAttribute("aria-haspopup", "listbox");
    anchor.setAttribute("aria-controls", listId);
    anchor.setAttribute("aria-expanded", "false");
    const searchBar = view("x").class("choice-search");
    const filter = input().attr({
        placeholder: t("搜索"),
        ariaLabel: t("搜索"),
        autocomplete: "off",
    });
    if (searchable) {
        searchBar.add([image(getImgUrl("search.svg"), noI18n("")), filter]);
        menu.add(searchBar);
        filter.el.setAttribute("aria-controls", listId);
    }
    if (loadOptions)
        searchBar.add(
            button(image(getImgUrl("reload.svg"), noI18n("")))
                .attr({ title: "获取模型列表", ariaLabel: t("获取模型列表") })
                .on("click", () => void fetchEntries()),
        );
    const list = view()
        .class("dialog-option-list")
        .attr({ id: listId, role: "listbox" })
        .addInto(menu);
    type Entry = { value: T; name: string; query: string };
    const entry = (value: T, name: string): Entry => ({
        value,
        name,
        query: `${name} ${value}`.toLowerCase(),
    });
    let entries = options
        .filter((o) => o.value !== "")
        .map((o) =>
            entry(o.value, txt(o.name ?? o.value).el.textContent || o.value),
        );
    let shown: Entry[] = [],
        active = -1,
        count = 0,
        value: T = options[0]?.value ?? ("" as T);
    let lifetime: AbortController | undefined,
        request: AbortController | undefined,
        loaded = !loadOptions;
    let error = "",
        frame = 0;
    const isOpen = () => menu.el.matches(":popover-open");
    function position() {
        frame = 0;
        if (!isOpen()) return;
        const r = root.el.getBoundingClientRect(),
            edge = 8,
            gap = 4;
        const roomBelow = Math.max(0, innerHeight - edge - r.bottom - gap),
            roomAbove = Math.max(0, r.top - edge - gap);
        const width = Math.min(
            innerWidth - 2 * edge,
            Math.max(r.width, searchable ? 224 : 150),
        );
        const capacity = 280;
        const preferred = searchable
            ? capacity
            : Math.min(capacity, 16 + entries.length * 38);
        const below = roomBelow >= preferred || roomBelow >= roomAbove;
        const height = Math.min(capacity, below ? roomBelow : roomAbove);
        menu.style({
            width: `${width}px`,
            maxHeight: `${height}px`,
            left: `${Math.max(edge, Math.min(innerWidth - edge - width, r.left))}px`,
            top: below ? `${r.bottom + gap}px` : "auto",
            bottom: below ? "auto" : `${innerHeight - r.top + gap}px`,
        });
    }
    function schedulePosition(e?: Event) {
        if (e?.target instanceof Node && menu.el.contains(e.target)) return;
        if (!frame) frame = requestAnimationFrame(position);
    }
    function clean() {
        lifetime?.abort();
        lifetime = undefined;
        request?.abort();
        request = undefined;
        cancelAnimationFrame(frame);
        frame = 0;
        anchor.setAttribute("aria-expanded", "false");
        anchor.removeAttribute("aria-activedescendant");
        filter.el.removeAttribute("aria-activedescendant");
    }
    function close(focus = false) {
        if (isOpen()) menu.el.hidePopover();
        clean();
        if (focus) anchor.focus({ preventScroll: true });
    }
    function setValue(next: T) {
        value = next;
        if (loadOptions) manual.sv(next);
        else
            text.sv(
                entries.find((e) => e.value === next)?.name ||
                    t("选择引擎类型"),
            );
    }
    function choose(next: T) {
        setValue(next);
        close(true);
        root.el.dispatchEvent(new Event("input"));
    }
    function append(end: number) {
        const fragment = document.createDocumentFragment();
        for (; count < Math.min(shown.length, end); count++) {
            const e = shown[count];
            const b = button(noI18n(e.name)).attr({
                role: "option",
                id: `${listId}-${count}`,
                tabIndex: -1,
            });
            b.el.dataset.value = e.value;
            b.el.setAttribute("aria-selected", String(e.value === value));
            fragment.append(b.el);
        }
        list.el.append(fragment);
    }
    function move(index: number, scroll = true) {
        if (!shown.length) return;
        list.el.children[active]?.classList.remove("option-active");
        active = Math.min(shown.length - 1, Math.max(0, index));
        if (active >= count) append(active + 40);
        const item = list.el.children[active] as HTMLElement;
        item.classList.add("option-active");
        anchor.setAttribute("aria-activedescendant", item.id);
        filter.el.setAttribute("aria-activedescendant", item.id);
        if (scroll) {
            const r = item.getBoundingClientRect(),
                box = list.el.getBoundingClientRect();
            if (r.top < box.top) list.el.scrollTop += r.top - box.top;
            else if (r.bottom > box.bottom)
                list.el.scrollTop += r.bottom - box.bottom;
        }
    }
    function populate() {
        const q = filter.gv.trim().toLowerCase();
        shown =
            request || error ? [] : entries.filter((e) => e.query.includes(q));
        active = -1;
        count = 0;
        list.clear();
        list.el.scrollTop = 0;
        anchor.removeAttribute("aria-activedescendant");
        filter.el.removeAttribute("aria-activedescendant");
        if (!shown.length)
            list.add(
                txt(
                    error ||
                        (request ? t("加载中…") : t("无结果，尝试其他关键词")),
                    true,
                )
                    .class("option-empty")
                    .attr({ role: "status" }),
            );
        else {
            append(60);
            const selected = shown.findIndex((e) => e.value === value);
            move(selected < 60 ? selected : 0, false);
        }
        position();
    }
    list.on("click", (e) => {
        const b = (e.target as HTMLElement).closest<HTMLButtonElement>(
            "button[data-value]",
        );
        if (b?.dataset.value !== undefined) choose(b.dataset.value as T);
    }).on("scroll", () => {
        if (
            list.el.scrollTop + list.el.clientHeight >=
            list.el.scrollHeight - 64
        )
            append(count + 60);
    });
    async function fetchEntries() {
        if (!loadOptions) return;
        request?.abort();
        const current = new AbortController();
        request = current;
        error = "";
        populate();
        try {
            const names = await loadOptions(
                AbortSignal.any([current.signal, AbortSignal.timeout(30000)]),
            );
            if (current !== request || current.signal.aborted) return;
            entries = names.map((name) => entry(name, name));
            loaded = true;
        } catch (e) {
            if (current === request && !current.signal.aborted) {
                error = String(e);
                loaded = false;
            }
        } finally {
            if (current === request) {
                request = undefined;
                if (isOpen()) populate();
            }
        }
    }
    function open() {
        if (isOpen()) return;
        menu.el.showPopover();
        anchor.setAttribute("aria-expanded", "true");
        lifetime = new AbortController();
        const signal = lifetime.signal;
        window.addEventListener("resize", schedulePosition, { signal });
        document.addEventListener(
            "pointerdown",
            (event) => {
                if (!root.el.contains(event.target as Node)) close();
            },
            { capture: true, signal },
        );
        document.addEventListener("scroll", schedulePosition, {
            capture: true,
            signal,
        });
        root.el
            .closest("dialog")
            ?.addEventListener("close", () => close(), { signal, once: true });
        filter.sv("");
        if (!loaded) void fetchEntries();
        else populate();
        if (searchable) filter.el.focus({ preventScroll: true });
    }
    menu.on("toggle", () => {
        if (!isOpen()) clean();
    });
    trigger
        .on("mousedown", (e) => {
            if (isOpen()) e.preventDefault();
        })
        .on("click", () => (isOpen() ? close(true) : open()));
    filter.on("input", (e) => {
        e.stopPropagation();
        populate();
    });
    manual.on("input", () => {
        value = manual.gv as T;
    });
    root.on("focusout", (e) => {
        if (e.relatedTarget && !root.el.contains(e.relatedTarget as Node))
            close();
    });
    root.on("keydown", (e) => {
        if (e.isComposing) return;
        if (!isOpen()) {
            if (["ArrowUp", "ArrowDown"].includes(e.key)) {
                e.preventDefault();
                open();
            }
            return;
        }
        if (e.key === "Tab") {
            close(true);
            return;
        }
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close(true);
            return;
        }
        if (e.key === "Enter" || (!searchable && e.key === " ")) {
            if (
                e.target !== filter.el &&
                (e.target as Element).closest(".choice-search button")
            )
                return;
            e.preventDefault();
            if (shown[active]) choose(shown[active].value);
            return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            move(
                e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? shown.length - 1
                      : active + (e.key === "ArrowDown" ? 1 : -1),
            );
        } else if (!searchable && e.key.length === 1) {
            const i = shown.findIndex((o) =>
                o.query.startsWith(e.key.toLowerCase()),
            );
            if (i >= 0) move(i);
        }
    });
    return Object.assign(
        root
            .bindGet(() => (loadOptions ? (manual.gv as T) : value))
            .bindSet(setValue),
        {
            invalidate() {
                close();
                entries = [];
                loaded = false;
                error = "";
            },
        },
    );
}

function field(caption: string, control: ElType<HTMLElement>, raw = false) {
    const id = control.el.id || `field-${crypto.randomUUID()}`;
    const focusTarget =
        control.el.querySelector<HTMLElement>(
            '[role="combobox"],input,select,textarea,[tabindex="0"]',
        ) || control.el;
    focusTarget.id = id;
    const label = ele("label").add(raw ? noI18n(caption) : caption);
    label.el.htmlFor = id;
    return view("y").class("form-field").add([label, control]);
}

function modelDialog(
    previous: Model | null,
    dialog: ElType<HTMLDialogElement>,
) {
    const { promise, resolve } = Promise.withResolvers<Model | null>();
    let active: Provider = previous ? providerOf(previous) : "openai";
    const name = input().sv(previous?.name || "");
    const provider = dialogSelect<Provider>([
        { value: "openai", name: noI18n("OpenAI / OpenAI-compatible") },
        { value: "anthropic", name: noI18n("Anthropic") },
        { value: "gemini", name: noI18n("Google Gemini") },
    ]).sv(active);
    const url = input().sv(previous?.url || endpoints[active]);
    const key = input("password")
        .attr({ autocomplete: "off" })
        .sv(previous?.key || "");
    const model = dialogSelect<string>([], true, (signal) =>
        listModels(
            {
                type: active,
                url: url.gv.trim() || endpoints[active],
                key: key.gv.trim(),
                model: "",
                name: "",
                supportVision: false,
                config: {},
            },
            signal,
        ),
    );
    model.sv(previous?.model || "");
    for (const control of [url, key])
        control.on("input", () => model.invalidate());
    const config = textarea()
        .attr({ spellcheck: false })
        .sv(JSON.stringify(previous?.config || {}, null, 2));
    const vision = check("vision").sv(previous?.supportVision ?? false);
    const result = ele("output")
        .class("dialog-status")
        .attr({ role: "status" });

    const fields = new Map<
        Provider,
        { url: string; key: string; model: string; config: string }
    >();

    let stopTest: (() => void) | undefined;
    let generation = 0;
    function cancel() {
        generation++;

        stopTest?.();
        stopTest = undefined;
    }
    function status(text: string) {
        result.el.textContent = text;
    }
    provider.on("input", () => {
        cancel();
        fields.set(active, {
            url: url.gv,
            key: key.gv,
            model: model.gv,
            config: config.gv,
        });
        active = provider.gv;
        const draft = fields.get(active);
        url.sv(draft?.url ?? endpoints[active]);
        key.sv(draft?.key ?? "");
        eye.mask(true);
        model.sv(draft?.model ?? "");
        config.sv(draft?.config ?? "{}");
        status("");
        model.invalidate();
    });
    function readModel(): Model {
        let options: unknown;
        try {
            options = JSON.parse(config.gv.trim() || "{}");
        } catch {
            throw Error(t("JSON格式错误"));
        }
        if (!options || typeof options !== "object" || Array.isArray(options))
            throw Error(t("JSON格式错误"));
        const address = url.gv.trim() || endpoints[active];
        if (
            !URL.canParse(address) ||
            !["https:", "http:"].includes(new URL(address).protocol)
        )
            throw Error(t("URL 无效"));
        return {
            type: active,
            name: name.gv.trim(),
            model: model.gv.trim(),
            url: address,
            key: key.gv.trim(),
            config: options as Record<string, unknown>,
            supportVision: vision.gv,
        };
    }
    const test = button("测试")
        .data({ title: t("发送一条测试消息以检查模型连接") })
        .on("click", async () => {
            cancel();
            const token = generation;
            try {
                const draft = readModel();
                if (!draft.model) throw Error(t("请填写模型名称"));
                status(t("正在测试..."));
                const job = runAI(
                    [{ role: "user", content: { text: "Reply with OK." } }],
                    draft,
                );
                stopTest = job.stop;
                await job.text;
                if (token === generation) status(t("测试成功"));
            } catch (err) {
                if (token === generation)
                    status(`${t("测试失败")} · ${String(err)}`);
            }
        });
    const eye = secretEye(key);
    const secret = field("API Key", key, true)
        .add(eye.button)
        .class("secret-field");
    dialog.el.addEventListener("model-suspend", () => {
        cancel();
        model.invalidate();
        eye.mask(true);
    });
    const details = ele("details")
        .class("model-options")
        .add([
            ele("summary")
                .data({ title: t("以 JSON 格式添加模型请求参数") })
                .add("请求体自定义"),
            config,
        ]);
    dialogB(
        dialog,
        [
            view()
                .class("dialog-columns")
                .add([field("名称", name), field("接口协议", provider)]),
            field("API URL", url, true),
            secret,
            field("模型名称", model),
            label([vision, "支持图像识别"])
                .class("vision-option")
                .data({ title: t("允许选择此模型识别截图") }),
            details,
            view("x").class("dialog-test").add([test, result]),
        ],
        () => {
            cancel();
            resolve(null);
        },
        () => {
            try {
                const next = readModel();
                if (!next.model || !next.name) {
                    status(t("请填写名称和模型"));
                    if (!next.name) name.el.focus();
                    else model.el.querySelector("input")?.focus();
                    return false;
                }
                cancel();
                resolve(next);
            } catch (e) {
                status(String(e));
                return false;
            }
        },
    );
    return promise;
}

function dialogB(
    d: ElType<HTMLDialogElement>,
    els: ElType<HTMLElement>[],
    onClose: () => void,
    // biome-ignore lint/suspicious/noConfusingVoidType: 保留回调签名
    onOk: () => boolean | undefined | void,
) {
    const title =
        d.el.getAttribute("aria-label") ||
        d.el.closest("[data-name]")?.querySelector(".setting-name")
            ?.textContent ||
        t("设置");
    d.el.setAttribute("aria-label", title);
    d.class("app-dialog");
    const inline = d.el.classList.contains("ocr-model-sheet");
    const testRow = els.find((el) => el.el.classList.contains("dialog-test"));
    const cancel = () => {
        onClose();
        d.el.close();
    };
    d.el.oncancel = () => onClose();
    d.add([
        inline
            ? ""
            : view("x")
                  .class("dialog-heading")
                  .add([
                      image(
                          getImgUrl(
                              title === t("在线模型")
                                  ? "ai_check.svg"
                                  : title === t("翻译引擎")
                                    ? "translate.svg"
                                    : "setting.svg",
                          ),
                          noI18n(""),
                      ).class("dialog-symbol"),
                      ele("h2").add(noI18n(title)),
                      button(iconEl("close"))
                          .attr({ title: "关闭" })
                          .on("click", cancel),
                  ]),
        view("y")
            .class("dialog-body")
            .add(els.filter((el) => el !== testRow)),
        view("x")
            .class("dialog-actions")
            .add([
                testRow ?? "",
                spacer(),
                button("取消").on("click", cancel),
                button(inline ? "保存" : "完成")
                    .class("dialog-primary")
                    .on("click", () => {
                        if (onOk() !== false) d.el.close();
                    }),
            ]),
    ]);
    queueMicrotask(() => {
        if (!inline && d.el.open && document.activeElement === d.el)
            d.el
                .querySelector<HTMLElement>(
                    ".dialog-body input,.dialog-body select,.dialog-body button",
                )
                ?.focus({ preventScroll: true });
    });
}

function selectUrl(l: { name: string; url: string }[], fallbackUrl?: string) {
    const el = xGroup("y").class(blockSetting);
    const i = input().on("input", () => {
        el.el.dispatchEvent(new CustomEvent("input"));
    });
    const list = xGroup("x").add(
        l.map((v) =>
            button(noI18n(v.name)).on("click", () => {
                i.sv(v.url);
                el.el.dispatchEvent(new CustomEvent("input"));
            }),
        ),
    );
    const test = button("测试").on("click", () => {
        const target = i.gv || fallbackUrl;
        if (!target) {
            testResult.sv("测试失败");
            return;
        }
        let origin: string;
        try {
            origin = new URL(target).origin;
        } catch {
            testResult.sv("测试失败");
            return;
        }
        fetch(origin)
            .then(() => {
                testResult.sv("测试成功");
            })
            .catch(() => {
                testResult.sv("测试失败");
            });
    });
    const testResult = txt();
    return el
        .add([
            xGroup("x")
                .style({ alignItems: "center" })
                .add([i, test, testResult]),
            list,
        ])
        .bindGet(() => i.gv)
        .bindSet((v: string) => i.sv(v));
}

function translatorD(
    _v: setting["翻译"]["翻译器"][0] | null,
    addTranslatorM: ElType<HTMLDialogElement>,
) {
    const v =
        _v ??
        ({
            id: crypto.randomUUID().slice(0, 7),
            name: "",
            keys: {},
            type: "google",
        } as setting["翻译"]["翻译器"][0]);

    const engineConfig: Partial<
        Record<
            Engines,
            {
                t: string | ReturnType<typeof noI18n>;
                key: ({
                    name: string;
                    text?: string;
                    optional?: boolean;
                } & (
                    | {
                          type: "select";
                          list: { name: string; value: string }[];
                      }
                    | {
                          type?: "json" | "textarea";
                      }
                ))[];
                help?: { src: string };
            }
        >
    > = {
        bergamot: {
            t: t("Firefox 本地模型"),
            key: [],
        },
        google: {
            t: "谷歌翻译",
            key: [],
        },
        yandex: {
            t: noI18n("Yandex"),
            key: [],
        },
        youdao: {
            t: "有道",
            key: [{ name: "appid" }, { name: "key" }],
            help: { src: "https://ai.youdao.com/product-fanyi-text.s" },
        },
        baidu: {
            t: "百度",
            key: [{ name: "appid" }, { name: "key" }],
            help: { src: "https://fanyi-api.baidu.com/product/11" },
        },
        deepl: {
            t: noI18n("Deepl"),
            key: [{ name: "key" }],
            help: { src: "https://www.deepl.com/pro-api?cta=header-pro-api" },
        },
        deeplx: {
            t: noI18n("DeeplX"),
            key: [{ name: "url" }],
        },
        caiyun: {
            t: "彩云",
            key: [{ name: "token" }],
            help: {
                src: "https://docs.caiyunapp.com/blog/2018/09/03/lingocloud-api/",
            },
        },
        bing: {
            t: "必应",
            key: [{ name: "key" }],
            help: {
                src: "https://learn.microsoft.com/zh-cn/azure/cognitive-services/translator/how-to-create-translator-resource#authentication-keys-and-endpoint-url",
            },
        },
        llm: {
            t: "大模型",
            key: [
                {
                    name: "name",
                    text: t("模型名称"),
                    type: "select",
                    list: getSet("AI.在线模型").map((i) => ({
                        name: i.name,
                        value: i.name,
                    })),
                },
            ],
        },
        chatgpt: {
            t: noI18n("ChatGPT"),
            key: [
                { name: "key", optional: true },
                { name: "url", optional: true },
                {
                    name: "config",
                    text: t("请求体自定义"),
                    type: "json",
                    optional: true,
                },
                {
                    name: "sysPrompt",
                    text: t("系统提示词，${t}为文字，${to}，${from}"),
                    type: "textarea",
                    optional: true,
                },
                {
                    name: "userPrompt",
                    text: t("用户提示词，${t}为文字，${to}，${from}"),
                    type: "textarea",
                    optional: true,
                },
            ],
            help: { src: "https://platform.openai.com/account/api-keys" },
        },
        gemini: {
            t: noI18n("Gemini"),
            key: [
                { name: "key" },
                { name: "url", optional: true },
                {
                    name: "config",
                    text: t("请求体自定义"),
                    type: "json",
                },
                {
                    name: "userPrompt",
                    text: t("用户提示词，${t}为文字，${to}，${from}"),
                    type: "textarea",
                    optional: true,
                },
            ],
            help: { src: "https://ai.google.dev/" },
        },
        niu: {
            t: "小牛翻译",
            key: [{ name: "key" }],
            help: {
                src: "https://niutrans.com/documents/contents/beginning_guide/6",
            },
        },
    };

    const idEl = input()
        .sv(v.name)
        .attr({ placeholder: t("请为翻译器命名") })
        .style({ minWidth: 0 });
    const selectEl = dialogSelect<Engines | "">(
        [{ value: "", name: "选择引擎类型" }].concat(
            // @ts-ignore
            Object.entries(engineConfig).map((v) => ({
                name: v[1].t,
                value: v[0],
            })),
        ) as { value: Engines }[],
        true,
    )
        .sv(v.type || "")
        .on("input", () => {
            set(selectEl.gv);
        });
    const keys = xGroup("y");
    const help = p("");

    function set(type: Engines | "") {
        keys.clear().style({ display: "none" });
        help.clear().style({ display: "none" });
        help.clear().style({ display: "none" });
        testR.clear();
        if (!type) return;
        const fig = engineConfig[type];
        if (!fig) return;
        for (const x of fig.key) {
            const value = v.keys[x.name];

            keys.style({ display: "flex" }).add(
                view().add([
                    txt(`${x.name}`, true),
                    ele("br"),

                    (x.type === "select"
                        ? select(x.list)
                        : x.type === "textarea"
                          ? textarea()
                          : x.type === "json"
                            ? textarea()
                            : input(
                                  /key|token|secret/i.test(x.name)
                                      ? "password"
                                      : "text",
                              )
                    )
                        .attr({ placeholder: x.text || "", spellcheck: false })
                        .data({ key: x.name })
                        .sv(
                            (x.type === "json"
                                ? JSON.stringify(value as object, null, 2)
                                : (value as string)) || "",
                        )
                        .class(blockSetting),
                ]),
            );
        }
        if (fig.help)
            help.style({ display: "" }).add(
                a(fig.help.src).add(txt("API申请")),
            );
    }

    const testEl = view("x").class("dialog-test");
    const testR = p("");
    const testB = button(txt("测试"));
    testEl.add([testB, testR]);
    testB.on("click", async () => {
        testR.el.innerText = t("正在测试...");
        const v = getV();
        if (!v) {
            testR.sv(t("测试失败"));
            return;
        }
        if (v.type !== "bergamot" && v.type !== "llm") {
            // @ts-ignore provider-specific fields
            translator.e[v.type].setKeys(v.keys);
        }
        try {
            if (v.type === "llm") {
                const model = getSet("AI.在线模型").find(
                    (item) => item.name === v.keys.name,
                );
                if (!model) throw Error(t("模型不存在"));
                await new ModelTranslator(model).run(
                    "The test passed",
                    "en",
                    "zh-Hans",
                );
                testR.sv(t("测试成功"));
                return;
            }
            const r =
                v.type === "bergamot"
                    ? await new BergamotTranslator().test()
                    : await translator.e[v.type].test();
            console.log(r);
            if (r) testR.el.innerText = t("测试成功");
        } catch (error) {
            testR.el.innerText = `${t("测试失败")} ${String(error)}`;
        }
    });

    function getV() {
        if (!selectEl.gv) return null;
        const key: Record<string, string | object> = {};
        const ee = engineConfig[selectEl.gv];
        if (!ee) return null;
        const e = ee.key;
        for (const el of keys.queryAll("input, textarea, select")) {
            const name = el.el.dataset.key;
            if (!name) continue;
            const type = e.find((i) => i.name === name)?.type;
            let value: object | string = el.el.value;
            if (type === "json") {
                if (value.trim() === "") value = {};
                else {
                    const [v, e] = tryx(() => JSON.parse(el.el.value));
                    if (e) {
                        alert(`${name} ${t("JSON格式错误")}`);
                        return null;
                    } else {
                        value = v;
                    }
                }
            }
            key[name] = value;
        }
        if (selectEl.gv === "deepl") {
            // @ts-expect-error
            key.free = true;
        }
        const nv: typeof v = {
            id: v.id,
            name: idEl.gv,
            keys: key,
            type: selectEl.gv,
        };
        return nv;
    }

    set(v.type);

    const { promise, resolve } = Promise.withResolvers<typeof v | null>();

    dialogB(
        addTranslatorM,
        [
            field("名称", idEl),
            field("选择引擎类型", selectEl),
            keys,
            help,
            testEl,
        ],
        () => resolve(null),
        () => {
            const nv = getV();
            if (
                nv?.type &&
                Object.entries(nv.keys).every(
                    (i) =>
                        engineConfig[nv.type]?.key.find((j) => j.name === i[0])
                            ?.optional || i[1],
                )
            ) {
                resolve(nv);
                return true;
            }
            return false;
        },
    );

    return promise;
}

function transSaveHelp() {
    return a(`${projectUrl}/blob/HEAD/docs/use/translate.md#生词本`).add(
        "教程帮助",
    );
}

function textStyle(mh: number) {
    return {
        "field-sizing": "content",
        height: "auto",
        "max-height": `${mh}lh`,
        resize: "none",
    } as const;
}

function w文件生词本Dialog(
    _v: setting["翻译"]["收藏"]["文件"][0] | null,
    addDialog: ElType<HTMLDialogElement>,
) {
    let v = _v;
    if (!v) {
        v = { path: "", template: "" };
    }
    const filePath = input().sv(v.path);
    const template = textarea().sv(v.template).style(textStyle(6));

    const { promise, resolve } = Promise.withResolvers<typeof v | null>();

    dialogB(
        addDialog,
        [
            view().add(["路径", ele("br"), filePath]),
            transSaveHelp(),
            view().add(["模板", ele("br"), template]),
        ],
        () => resolve(null),
        () =>
            resolve({
                path: filePath.gv,
                template: template.gv,
            }),
    );

    return promise;
}

function z在线生词本Dialog(
    _v: setting["翻译"]["收藏"]["fetch"][0] | null,
    addDialog: ElType<HTMLDialogElement>,
) {
    const v = _v ?? {
        name: "",
        body: "",
        url: "",
        method: "get",
        headers: {},
        getter: [],
    };
    const name = input()
        .attr({ placeholder: t("名称") })
        .sv(v.name);
    const url = input().sv(v.url);
    const method = select([
        { value: "get", name: noI18n("GET") },
        { value: "post", name: noI18n("POST") },
    ]).sv(v.method);

    const headers = textarea("按行输入，每行一个header，格式为key:value")
        .style(textStyle(6))
        .bindSet((v: Record<string, string>, el) => {
            el.value = Object.entries(v)
                .map(([k, v]) => `${k} : ${v}`)
                .join("\n");
        })
        .bindGet((el) => {
            const v = el.value;
            const obj: Record<string, string> = {};
            for (const line of v.split("\n")) {
                if (line.trim() === "") continue;
                const [k, v] = line.split(":").map((i) => i.trim());
                obj[k] = v;
            }
            return obj;
        })
        .sv(v.headers);

    const body = textarea().style(textStyle(6)).sv(v.body);

    const { promise, resolve } = Promise.withResolvers<typeof v | null>();

    dialogB(
        addDialog,
        [
            name,
            transSaveHelp(),
            xGroup("y").add([
                view().add([noI18n("URL"), url, ele("br"), url]),
                view().add(["请求方式", method, ele("br"), method]),
                view().add(["请求头", headers, ele("br"), headers]),
                view().add(["请求体", body, ele("br"), body]),
            ]),
        ],
        () => resolve(null),
        () =>
            resolve({
                name: name.gv,
                body: body.gv,
                url: url.gv,
                method: method.gv,
                headers: headers.gv,
                getter: [],
            }),
    );

    return promise;
}

function searchEngineDialog(
    _v: { url: string; name: string } | null,
    d: ElType<HTMLDialogElement>,
) {
    const v = _v ?? { name: "", url: "" };
    const nameEl = input().sv(v.name);
    const urlEl = input().sv(v.url);

    const { promise, resolve } = Promise.withResolvers<typeof v | null>();

    dialogB(
        d,
        [
            view().add(["引擎名称", ele("br"), nameEl]),
            view().add(["引擎URL", ele("br"), urlEl]),
        ],
        () => resolve(null),
        () =>
            resolve({
                name: nameEl.gv,
                url: urlEl.gv,
            }),
    );

    return promise;
}

let recordedKey: ((key: string) => void) | undefined;
renderOn("recordedAccelerator", ([key]) => recordedKey?.(key));

function hotkey(allowTabNavigation = false) {
    const isMac = process.platform === "darwin";
    const keyList = new Set<string>();
    let mainKey = "";
    const held = new Set<string>();
    let saved = "";
    let intercepted = false,
        focusListeners: AbortController | undefined;
    function stopRecording() {
        focusListeners?.abort();
        focusListeners = undefined;
        if (recordedKey === receive) {
            recordedKey = undefined;
            renderSend("shortcutRecording", [false]);
        }
    }
    const receive = (key: string) => {
        intercepted = true;
        held.clear();
        keyList.clear();
        cvalue(key.split("+"));
        ev();
        saved = mainKey;
    };
    let isFocus = false;
    function cvalue(l: string[]) {
        const nl = l
            .filter((i) => i !== "")
            .map((k) => {
                const key = jsKeyCodeDisplay(ele2jsKeyCode(k));
                return isMac ? (key.symble ?? key.primary) : key.primary;
            });
        nl.length
            ? i.clear().add(nl.map((i) => view().add(noI18n(i))))
            : i.clear().add("点击录入");
        mainKey = l.join("+");
    }

    function ev() {
        el.el.dispatchEvent(new CustomEvent("input"));
    }
    const el = view("x").class(Class.group);
    const i = view("x")
        .class("b-like")
        .style({
            alignItems: "center",
            fontFamily: "var(--monospace)",
        })
        .class(Class.gap)
        .attr({ tabIndex: 0 })
        .on("focus", () => {
            isFocus = true;
            intercepted = false;
            recordedKey = receive;
            focusListeners?.abort();
            focusListeners = new AbortController();
            i.el.closest("dialog")?.addEventListener("close", stopRecording, {
                once: true,
                signal: focusListeners.signal,
            });
            window.addEventListener("blur", stopRecording, {
                once: true,
                signal: focusListeners.signal,
            });
            renderSend("shortcutRecording", [true]);
            saved = mainKey;
            held.clear();
            keyList.clear();
            i.clear().add("按下快捷键");
        })
        .on("blur", () => {
            isFocus = false;
            stopRecording();
            if (held.size) mainKey = saved;
            held.clear();
            cvalue((mainKey ?? "").split("+"));
        })
        .on("keydown", (e) => {
            if (!isFocus) return;
            if (
                allowTabNavigation &&
                e.key === "Tab" &&
                !e.ctrlKey &&
                !e.metaKey &&
                !e.altKey
            )
                return;
            e.preventDefault();
            if (e.repeat) return;
            intercepted = false;
            const key = jsKey2ele(macKeyFomat(e.key));
            if (!held.size) keyList.clear();
            held.add(e.code || key);
            keyList.add(key);
            cvalue([...keyList]);
        })
        .on("keyup", (e) => {
            if (intercepted) return;
            if (!isFocus) return;
            e.preventDefault();
            const key = jsKey2ele(macKeyFomat(e.key));
            if (!held.size) {
                if (e.key !== "PrintScreen") return;
                keyList.clear();
                keyList.add(key);
                cvalue([...keyList]);
            }
            held.delete(e.code || key);
            if (!held.size) {
                ev();
                saved = mainKey;
            }
        });
    const b = button(iconEl("delete"))
        .attr({ title: "清空", ariaLabel: t("清空") })
        .on("click", () => {
            i.clear();
            mainKey = "";
            keyList.clear();
            ev();
        });
    return el
        .add(allowTabNavigation ? [i] : [i, b])
        .bindSet((v: string) => cvalue((v ?? "").split("+")))
        .bindGet(() => mainKey)
        .sv("");
}

function inpaintEl() {
    const configPath = renderSendSync("userDataPath", []);
    const dir = path.join(configPath, "models", "inpaint");
    const file = path.join(dir, "migan_pipeline_v2.onnx");

    const el = view("x", "wrap")
        .class(Class.gap)
        .style({ "align-items": "center" });

    function render() {
        const exists = fs.existsSync(file);
        el.clear().add([
            txt(exists ? t("已下载") : t("未下载")),
            button(exists ? t("重新下载") : t("下载")).on("click", () => {
                const pro = (() => {
                    const mel = view().style({
                        overflow: "hidden",
                        width: baseWidth,
                        height: "20px",
                        borderRadius: "var(--border-radius)",
                        backgroundColor: cssColor.bb,
                    });
                    const bel = view().style({
                        width: "100%",
                        height: "100%",
                        backgroundColor: cssColor.main,
                    });
                    return mel.add(bel).bindSet((v: number) => {
                        bel.style({
                            width: `${Math.floor(v * 100)}%`,
                        });
                    });
                })();
                el.clear().add(pro);
                const url = githubUrl(
                    "xushengfeng/eSearch/releases/download/13.1.6/migan_pipeline_v2.onnx",
                    "base",
                );
                fetch(url).then(async (res) => {
                    if (!res.ok) {
                        throw new Error(
                            `下载失败: ${res.status} ${res.statusText}`,
                        );
                    }
                    if (!res.body) {
                        throw new Error("响应体中无数据");
                    }
                    const contentLength = res.headers.get("content-length");
                    const totalBytes = contentLength
                        ? Number.parseInt(contentLength, 10)
                        : undefined;
                    const reader = res.body.getReader();
                    let downloadedBytes = 0;
                    const chunks = [];
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value);
                        downloadedBytes += value.length;
                        if (totalBytes) pro.sv(downloadedBytes / totalBytes);
                    }
                    const b = Buffer.from(await new Blob(chunks).arrayBuffer());
                    fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(file, b);
                    render();
                });
            }),
            exists
                ? button(t("删除")).on("click", () => {
                      fs.rmSync(dir, { recursive: true, force: true });
                      render();
                  })
                : null,
        ]);
    }
    render();

    return view().class(blockSetting).add(el);
}

type BergamotProgress = {
    from: string;
    to: string;
    file: string;
    received: number;
    total?: number;
};

let onBergamotProgress: ((data: BergamotProgress) => void) | undefined;

renderOn("bergamot_progress", ([data]) => {
    onBergamotProgress?.(data);
});

function openBergamotDialog() {
    const d = ele("dialog").attr({ ariaLabel: t("Firefox 本地模型") });
    d.addInto();

    const lans = getLansName([...BERGAMOT_LANGS]).map((i) => ({
        value: i.lan,
        name: noI18n(i.text),
    }));
    const from = select(lans).sv("en");
    const to = select(lans).sv("zh-Hans");
    const status = p("");
    const setStatus = (text: string) => {
        status.el.innerText = text;
        status.el.style.display = text ? "" : "none";
    };
    setStatus("");
    const download = button(txt(t("下载")));
    const clearBtn = button(txt(t("清除缓存"))).class("danger-action");
    const progressMap = new Map<string, { received: number; total?: number }>();
    const bar = view().style({
        width: "0%",
        height: "100%",
        backgroundColor: cssColor.main,
        transition: "width .2s",
    });
    const barTrack = view()
        .style({
            overflow: "hidden",
            width: "100%",
            height: "16px",
            borderRadius: "var(--border-radius)",
            backgroundColor: cssColor.bb,
        })
        .add(bar);

    const setBar = (percent: number) => {
        bar.style({
            width: `${Math.max(0, Math.min(100, Math.floor(percent * 100)))}%`,
        });
    };

    const resetProgress = () => {
        progressMap.clear();
        setBar(0);
    };

    const updateProgress = (data: BergamotProgress) => {
        if (data.from !== from.gv || data.to !== to.gv) return;
        progressMap.set(data.file, {
            received: data.received,
            total: data.total,
        });
        let received = 0;
        let total = 0;
        for (const item of progressMap.values()) {
            received += item.received;
            total += item.total ?? 0;
        }
        if (total > 0) {
            setBar(received / total);
            setStatus(
                `${t("下载中...")} ${Math.floor((received / total) * 100)}%`,
            );
        } else {
            const current = progressMap.get(data.file);
            if (current?.total) {
                setBar(current.received / current.total);
            }
            setStatus(`${t("下载中...")} ${data.file}`);
        }
    };

    const refreshStatus = async () => {
        setStatus(t("检查中..."));
        try {
            const s = await renderInvoke("bergamot_status", [
                { from: from.gv, to: to.gv },
            ]);
            setStatus(
                s === "ready"
                    ? ""
                    : s === "unsupported"
                      ? t("不支持该语言对")
                      : s === "error"
                        ? t("检查失败")
                        : t("未下载"),
            );
        } catch (error) {
            setStatus(`${t("检查失败")} ${String(error)}`);
        }
    };

    const directionsEl = view("x", "wrap").style({
        gap: "8px 20px",
    });
    const modelsEl = view("y").class(Class.gap);

    const renderDirections = (models: { from: string; to: string }[]) => {
        directionsEl.clear();
        const directions = new Map<
            string,
            { from: string; to: string; via: boolean }
        >();
        const add = (from: string, to: string, via: boolean) => {
            if (from === to) return;
            const key = `${from}>${to}`;
            if (directions.has(key)) return;
            directions.set(key, { from, to, via });
        };

        for (const model of models) {
            add(model.from, model.to, false);
        }
        const inbound = models.filter((model) => model.to === "en");
        const outbound = models.filter((model) => model.from === "en");
        for (const source of inbound) {
            for (const target of outbound) {
                add(source.from, target.to, true);
            }
        }

        if (directions.size === 0) {
            directionsEl.add(p(t("暂无可用方向")));
            return;
        }

        for (const direction of directions.values()) {
            const names = new Map(
                getLansName([direction.from, direction.to]).map((i) => [
                    i.lan,
                    i.text,
                ]),
            );
            const label = `${names.get(direction.from) ?? direction.from} → ${
                names.get(direction.to) ?? direction.to
            }${direction.via ? ` · ${t("组合")}` : ""}`;
            directionsEl.add(txt(label));
        }
    };

    const refreshModels = async () => {
        modelsEl.clear();
        try {
            const data = await renderInvoke("bergamot_models", []);
            renderDirections(data.models);
            if (!data.runtime) {
                modelsEl.add(p(t("运行时未下载")));
            }
            if (data.models.length === 0) {
                modelsEl.add(p(t("暂无已下载模型")));
                return;
            }
            for (const model of data.models) {
                const names = new Map(
                    getLansName([model.from, model.to]).map((i) => [
                        i.lan,
                        i.text,
                    ]),
                );
                modelsEl.add(
                    view("x")
                        .class(Class.gap)
                        .style({ alignItems: "center" })
                        .add([
                            txt(
                                `${names.get(model.from) ?? model.from} → ${
                                    names.get(model.to) ?? model.to
                                }`,
                            ),
                            txt(
                                `${model.version} · ${(
                                    model.size / 1e6
                                ).toFixed(1)}MB`,
                            ).style({ opacity: 0.6 }),
                            button(txt(t("删除")))
                                .class("danger-action")
                                .on("click", async () => {
                                    if (
                                        !(await confirm(
                                            t("确定删除这个模型？"),
                                        ))
                                    )
                                        return;
                                    await renderInvoke(
                                        "bergamot_remove_model",
                                        [{ from: model.from, to: model.to }],
                                    );
                                    await refreshModels();
                                    await refreshStatus();
                                }),
                        ]),
                );
            }
        } catch (error) {
            directionsEl.clear();
            directionsEl.add(p(t("暂无可用方向")));
            modelsEl.add(p(`${t("检查失败")} ${String(error)}`));
        }
    };

    let busy = false;
    const setBusy = (value: boolean) => {
        busy = value;
        download.el.disabled = value;
        clearBtn.el.disabled = value;
        from.el.disabled = value;
        to.el.disabled = value;
    };

    from.on("input", () => {
        resetProgress();
        void refreshStatus();
    });
    to.on("input", () => {
        resetProgress();
        void refreshStatus();
    });

    download.on("click", async () => {
        setBusy(true);
        resetProgress();
        setStatus(t("下载中..."));
        try {
            await renderInvoke("bergamot_download", [
                { from: from.gv, to: to.gv },
            ]);
            setBar(1);
            await refreshStatus();
            await refreshModels();
        } catch (error) {
            setStatus(`${t("下载失败")} ${String(error)}`);
        } finally {
            setBusy(false);
        }
    });

    clearBtn.on("click", async () => {
        if (!(await confirm(t("确定清除已下载的 Firefox 本地模型？")))) return;
        setBusy(true);
        try {
            await renderInvoke("bergamot_clear", []);
            resetProgress();
            await refreshStatus();
            await refreshModels();
        } catch (error) {
            setStatus(`${t("下载失败")} ${String(error)}`);
        } finally {
            setBusy(false);
        }
    });

    const content = view("y")
        .class(Class.gap)
        .style({
            width: "min(760px, 92vw)",
            maxHeight: "80vh",
            overflow: "auto",
        })
        .add([
            view("x")
                .class(Class.gap)
                .style({ alignItems: "center" })
                .add([from, to, download]),
            p(
                t(
                    "模型是单向的，双向使用请分别下载两个方向；非英语语言对会经英语中转，需要下载两段模型",
                ),
            ).style({ opacity: 0.6 }),
            barTrack,
            status,
            txt(t("已下载模型支持的方向"), true),
            directionsEl,
            txt(t("已下载模型"), true),
            modelsEl,
            view("x").add([clearBtn]),
        ]);

    onBergamotProgress = updateProgress;
    d.el.addEventListener("close", () => {
        if (onBergamotProgress === updateProgress) {
            onBergamotProgress = undefined;
        }
        d.el.remove();
    });

    dialogB(
        d,
        [content],
        () => undefined,
        () => undefined,
    );
    d.el.showModal();
    void refreshStatus();
    void refreshModels();
}

function ocrEl() {
    const ocrModels: Record<
        string,
        {
            url: string;
            name: string;
            desc?: string;
            supportLang: string[];
            accuracy?: "high" | "low";
            speed?: "fast" | "slow";
            optimize?: {
                space: boolean;
            };
        }
    > = {
        v6_tiny: {
            url: "ppocr_v6_tiny.zip",
            name: "v6 tiny",
            desc: "paddle OCR v6 tiny",
            supportLang: ["zh-HANS", "en"],
            accuracy: "low",
            speed: "fast",
            optimize: {
                space: false,
            },
        },
        v6_small: {
            url: "ppocr_v6_small.zip",
            name: "v6 small",
            desc: "paddle OCR v6 small",
            supportLang: ["*"],
            accuracy: "low",
            speed: "fast",
            optimize: {
                space: false,
            },
        },
        v6_medium: {
            url: "ppocr_v6_medium.zip",
            name: "v6 medium",
            desc: "paddle OCR v6 medium",
            supportLang: ["*"],
            accuracy: "high",
            speed: "slow",
            optimize: {
                space: false,
            },
        },
        standard_v5_mobile: {
            url: "ppocr_v5_mobile.zip",
            name: "标准版v5",
            desc: "paddle OCR v5 mobile",
            supportLang: ["zh-HANS", "zh-HANT", "en", "ja"],
            accuracy: "high",
            speed: "fast",
            optimize: {
                space: false,
            },
        },
        standard_v5_server: {
            url: "ppocr_v5_server.zip",
            name: "标准版v5 max",
            desc: "paddle OCR v5 server",
            supportLang: ["zh-HANS", "zh-HANT", "en", "ja"],
            accuracy: "high",
            speed: "slow",
            optimize: {
                space: false,
            },
        },
        ch: {
            url: "ch_v4_doc.zip",
            name: "中英混合（高精度）",
            supportLang: ["zh-HANS", "zh-HANT", "en"],
            accuracy: "high",
            speed: "slow",
        },
        fast_ch: {
            url: "ch.zip",
            name: "中英混合（快速）",
            supportLang: ["zh-HANS", "en"],
        },
        en: { url: "en.zip", name: "英文", supportLang: ["en"] },
        chinese_cht: {
            url: "chinese_cht.zip",
            name: "中文繁体",
            supportLang: ["zh-HANT"],
        },
        korean: { url: "korean.zip", name: "韩文", supportLang: ["ko"] },
        japan: { url: "japan.zip", name: "日文", supportLang: ["ja"] },
        te: { url: "te.zip", name: "泰卢固文", supportLang: ["te"] },
        ka: { url: "ka.zip", name: "卡纳达文", supportLang: ["ka"] },
        ta: { url: "ta.zip", name: "泰米尔文", supportLang: ["ta"] },
        latin: {
            url: "latin.zip",
            name: "拉丁文",
            supportLang: [
                "af",
                "az",
                "bs",
                "cs",
                "cy",
                "da",
                "de",
                "es",
                "et",
                "fr",
                "ga",
                "hr",
                "hu",
                "id",
                "is",
                "it",
                "ku",
                "la",
                "lt",
                "lv",
                "mi",
                "ms",
                "mt",
                "nl",
                "no",
                "oc",
                "pi",
                "pl",
                "pt",
                "ro",
                "sr-Latn",
                "sk",
                "sl",
                "sq",
                "sv",
                "sw",
                "tl",
                "tr",
                "uz",
                "vi",
                "fr",
                "de",
            ],
        },
        arabic: {
            url: "arabic.zip",
            name: "阿拉伯字母",
            supportLang: ["ar", "fa", "ug", "ur"],
        },
        cyrillic: {
            url: "cyrillic.zip",
            name: "斯拉夫字母",
            supportLang: [
                "ru",
                "sr-Cyrl",
                "be",
                "bg",
                "uk",
                "mn",
                "abq",
                "ady",
                "kbd",
                "ava",
                "dar",
                "inh",
                "che",
                "lbe",
                "lez",
                "tab",
            ],
        },
        devanagari: {
            url: "devanagari.zip",
            name: "梵文字母",
            supportLang: [
                "hi",
                "mr",
                "ne",
                "bh",
                "mai",
                "ang",
                "bho",
                "mah",
                "sck",
                "new",
                "gom",
                "sa",
                "bgc",
            ],
        },
    };

    const langMap: Record<string, string> = {
        pi: "巴利语",
        abq: "阿布哈兹语",
        ady: "阿迪格语",
        kbd: "卡巴尔达语",
        ava: "阿瓦尔语",
        dar: "达尔格瓦语",
        inh: "印古什语",
        che: "车臣语",
        lbe: "列兹金语",
        lez: "雷兹语",
        tab: "塔巴萨兰语",
        bh: "比哈里语",
        ang: "古英语",
        mah: "马拉提语",
        sck: "西卡语",
        new: "尼瓦尔语",
        gom: "孔卡尼语",
        bgc: "哈尔穆克语",
    };

    const configPath = renderSendSync("userDataPath", []);

    const defaultOcr: setting["离线OCR"][0] = {
        id: defaultOcrId,
        name: "默认",
        detPath: "",
        recPath: "",
        dicPath: "",
        scripts: ["zh-HANS", "en"],
        accuracy: "low",
        speed: "fast",
    };

    const mainEl = sortList<setting["离线OCR"][0]>(
        (v) => v.name,
        (_item, dialog) => {
            const { promise, resolve } = Promise.withResolvers<typeof _item>();
            const xxxid = crypto.randomUUID().slice(0, 7);

            const item =
                _item ||
                ({
                    id: xxxid,
                    name: "",
                    detPath: "",
                    recPath: "",
                    dicPath: "",
                    scripts: [],
                    accuracy: "low",
                    speed: "fast",
                    optimize: {
                        space: true,
                    },
                } satisfies setting["离线OCR"][0]);

            const nameEl = input().sv(item.name);
            const detPathEl = xPath(false).sv(item.detPath);
            const recPathEl = xPath(false).sv(item.recPath);
            const dicPathEl = xPath(false).sv(item.dicPath);
            const scriptsEl = input()
                .bindGet((el) => el.value.split(",").map((i) => i.trim()))
                .bindSet((v: string[], el) => {
                    el.value = v.join(", ");
                })
                .sv(item.scripts);

            const accuracyEl = select<setting["离线OCR"][0]["accuracy"]>([
                { value: "low", name: "低精度" },
                { value: "high", name: "高精度" },
            ]).sv(item.accuracy);
            const speedEl = select<setting["离线OCR"][0]["speed"]>([
                { value: "fast", name: "快速" },
                { value: "slow", name: "慢速" },
            ]).sv(item.speed);
            const optimizeSpaceEl = label([
                check("optimize.space"),
                "空格优化",
            ]).sv(item.optimize?.space ?? true);

            const catalogue = view("y").class("ocr-catalogue");
            const query = input()
                .attr({ placeholder: t("搜索模型"), ariaLabel: t("搜索模型") })
                .class("ocr-search");
            const results = view("y").class("ocr-results");
            const status = ele("output")
                .attr({ role: "status" })
                .class("ocr-status");
            const progress = ele("progress");
            progress.el.hidden = true;
            let download: AbortController | undefined;
            function choose(id: string, paths: ReturnType<typeof modelFiles>) {
                const model = ocrModels[id];
                if (!nameEl.gv) nameEl.sv(t(model.name));
                detPathEl.sv(paths.detPath);
                recPathEl.sv(paths.recPath);
                dicPathEl.sv(paths.dicPath);
                scriptsEl.sv(model.supportLang);
                accuracyEl.sv(model.accuracy ?? "low");
                speedEl.sv(model.speed ?? "fast");
                optimizeSpaceEl.sv(model.optimize?.space ?? true);
                status.el.textContent = `${t("已选择")} · ${t(model.name)}`;
            }
            async function install(id: string) {
                if (download) return;
                const controller = new AbortController();
                download = controller;
                const model = ocrModels[id],
                    root = path.join(configPath, "models"),
                    folder = path.join(root, id);
                let stage = "";
                try {
                    updateList();
                    progress.el.hidden = false;
                    progress.el.removeAttribute("value");
                    status.el.textContent = `${t("下载中...")} ${t(model.name)}`;
                    const url = githubUrl(
                        `xushengfeng/eSearch-OCR/releases/download/4.0.0/${model.url}`,
                        "base",
                    );
                    const res = await fetch(url, { signal: controller.signal });
                    if (!res.ok || !res.body) throw Error(`HTTP ${res.status}`);
                    const reader = res.body.getReader();
                    const chunks: Uint8Array[] = [],
                        total = Number(res.headers.get("content-length"));
                    let received = 0;
                    try {
                        while (true) {
                            const { value, done } = await reader.read();
                            if (done) break;
                            chunks.push(value);
                            received += value.byteLength;
                            if (total > 0) {
                                progress.el.max = total;
                                progress.el.value = received;
                            }
                        }
                    } finally {
                        reader.releaseLock();
                    }
                    fs.mkdirSync(root, { recursive: true });
                    stage = fs.mkdtempSync(path.join(root, `.${id}-`));
                    await unzip(Buffer.concat(chunks), stage);
                    const files = modelFiles(stage);
                    if (!files.recPath) throw Error(t("未找到识别模型"));
                    controller.signal.throwIfAborted();
                    // Keep any paths in older saved configurations valid. Each completed download gets its own directory.
                    fs.mkdirSync(folder, { recursive: true });
                    const version = path.basename(stage);
                    fs.renameSync(stage, path.join(folder, version));
                    stage = "";
                    const marker = path.join(folder, "current.json"),
                        tmp = path.join(folder, `${version}.json`);
                    fs.writeFileSync(tmp, JSON.stringify(version));
                    fs.renameSync(tmp, marker);
                    choose(id, modelFiles(path.join(folder, version)));
                } catch (error) {
                    if (!controller.signal.aborted)
                        status.el.textContent = `${t("下载失败")} · ${String(error)}`;
                } finally {
                    if (stage)
                        fs.rmSync(stage, { recursive: true, force: true });
                    download = undefined;
                    progress.el.hidden = true;
                    if (dialog.el.isConnected) updateList();
                }
            }
            function updateList() {
                const term = query.gv.trim().toLowerCase();
                results.clear();
                for (const [id, model] of Object.entries(ocrModels)) {
                    const name = t(model.name);
                    const langs = model.supportLang.map((code) => {
                        if (code === "*") return t("多语言");
                        if (langMap[code]) return t(langMap[code]);
                        try {
                            return displayLan.of(code) || code;
                        } catch {
                            return code;
                        }
                    });
                    if (
                        term &&
                        ![id, name, ...langs, ...model.supportLang]
                            .join(" ")
                            .toLowerCase()
                            .includes(term)
                    )
                        continue;
                    const files = installed.get(id);
                    const metadata = [
                        langs.length > 3
                            ? `${langs.slice(0, 3).join(" · ")} …`
                            : langs.join(" · "),
                    ];
                    if (model.accuracy === "high") metadata.push(t("高精度"));
                    if (model.speed === "fast") metadata.push(t("快速"));
                    const info = view("y")
                        .class("ocr-model-info")
                        .add([
                            txt(name, true).class("ocr-model-name"),
                            txt(metadata.join("  /  "), true).class(
                                "ocr-model-meta",
                            ),
                        ]);
                    info.el.title = [model.desc, langs.join(" · ")]
                        .filter(Boolean)
                        .join("\n");
                    const actions = view("x").class("ocr-row-actions");
                    const fetchButton = button(files ? "重新下载" : "下载")
                        .class("catalog-download")
                        .attr({ disabled: Boolean(download) })
                        .on("click", async () => {
                            await install(id);
                            const next = installedFiles(id);
                            if (next) installed.set(id, next);
                            if (dialog.el.isConnected) updateList();
                        });
                    if (files)
                        actions.add(
                            button("使用")
                                .class("catalog-use")
                                .on("click", () => choose(id, files)),
                        );
                    actions.add(fetchButton);
                    results.add(
                        view("x").class("ocr-model-row").add([info, actions]),
                    );
                }
                if (!results.el.childElementCount)
                    results.add(comment(t("无结果，尝试其他关键词")));
            }
            function installedFiles(id: string) {
                const folder = path.join(configPath, "models", id);
                if (!fs.existsSync(folder)) return;
                let dir = folder;
                try {
                    const v = JSON.parse(
                        fs.readFileSync(
                            path.join(folder, "current.json"),
                            "utf8",
                        ),
                    );
                    if (
                        typeof v === "string" &&
                        v.startsWith(`.${id}-`) &&
                        path.basename(v) === v
                    )
                        dir = path.join(folder, v);
                } catch {}
                const files = modelFiles(dir);
                return files.recPath ? files : undefined;
            }
            const installed = new Map<string, ReturnType<typeof modelFiles>>();
            for (const id of Object.keys(ocrModels)) {
                const files = installedFiles(id);
                if (files) installed.set(id, files);
            }
            query.on("input", updateList);
            updateList();
            catalogue.add([query, results, progress, status]);
            const advanced = ele("details")
                .class("ocr-file-fields")
                .add([
                    ele("summary").add("模型文件与参数"),
                    view("y").add([
                        field("检测模型（det）", detPathEl),
                        field("识别模型（rec）", recPathEl),
                        field("识别字典（.txt）", dicPathEl),
                        field("语言字符", scriptsEl),
                        view()
                            .class("dialog-columns")
                            .add([
                                field("精度", accuracyEl),
                                field("速度", speedEl),
                            ]),
                        optimizeSpaceEl,
                    ]),
                ]);
            advanced.el.open = Boolean(_item);
            dialog.el.addEventListener("close", () => download?.abort(), {
                once: true,
            });
            dialogB(
                dialog,
                [field("模型名称", nameEl), catalogue, advanced],
                () => resolve(null),
                () => {
                    if (download) return false;
                    resolve({
                        id: item.id,
                        name: nameEl.gv || `${t("新模型")}${xxxid}`,
                        detPath: detPathEl.gv,
                        recPath: recPathEl.gv,
                        dicPath: dicPathEl.gv,
                        scripts: scriptsEl.gv,
                        accuracy: accuracyEl.gv,
                        speed: speedEl.gv,
                        optimize: { space: optimizeSpaceEl.gv },
                    });
                },
            );

            return promise;
        },
    );

    function modelFiles(folder: string) {
        const result = { detPath: "", recPath: "", dicPath: "" };
        if (!fs.existsSync(folder)) return result;
        const collect = (dir: string, level: number) => {
            for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, f.name);
                if (f.isDirectory() && level < 2 && !f.name.startsWith(".")) {
                    collect(full, level + 1);
                    continue;
                }
                if (!f.isFile()) continue;
                if (/det.*\.onnx$/i.test(f.name)) result.detPath = full;
                else if (/rec.*\.onnx$/i.test(f.name)) result.recPath = full;
                else if (/\.txt$/i.test(f.name)) result.dicPath = full;
            }
        };
        collect(folder, 0);
        return result;
    }
    const el = xGroup("y");

    return el
        .class(blockSetting)
        .add([
            mainEl.on("input", () =>
                el.el.dispatchEvent(new CustomEvent("input")),
            ),
        ])
        .bindGet(() => [defaultOcr, ...mainEl.gv])
        .bindSet((v: setting["离线OCR"]) => {
            mainEl.sv(v.filter((i) => i.id !== defaultOcrId));
        });
}

async function unzip(buffer: Buffer, targetDir: string) {
    if (!yauzl) yauzl = require("yauzl");
    const { pipeline } =
        require("node:stream/promises") as typeof import("node:stream/promises");
    return new Promise<void>((resolve, reject) => {
        yauzl!.fromBuffer(buffer, { lazyEntries: true }, (error, archive) => {
            if (error) {
                reject(error);
                return;
            }
            function fail(e: unknown) {
                archive.close();
                reject(e);
            }
            archive.on("error", fail);
            archive.on("end", resolve);
            archive.on("entry", (entry) => {
                const full = path.resolve(targetDir, entry.fileName);
                if (!full.startsWith(path.resolve(targetDir) + path.sep)) {
                    fail(new Error("Invalid model archive path"));
                    return;
                }
                if (entry.fileName.endsWith("/")) {
                    archive.readEntry();
                    return;
                }
                archive.openReadStream(entry, (e, stream) => {
                    if (e) {
                        fail(e);
                        return;
                    }
                    fs.promises
                        .mkdir(path.dirname(full), { recursive: true })
                        .then(() =>
                            pipeline(stream, fs.createWriteStream(full)),
                        )
                        .then(() => archive.readEntry(), fail);
                });
            });
            archive.readEntry();
        });
    });
}

function hotkeyP(icon: IconType | "" = "") {
    const h = hotkey();
    const el = xGroup()
        .add([icon ? view().add(iconEl(icon)) : "", h])
        .bindGet(() => h.gv)
        .bindSet((v: string) => h.sv(v));
    h.on("input", () => el.el.dispatchEvent(new CustomEvent("input")));
    return el;
}
function globalHotkey(name: keyof setting["快捷键"]) {
    const h = hotkey();
    const path = `快捷键.${name}.key`;
    const feedback = ele("output")
        .class("shortcut-feedback")
        .attr({ role: "status" });
    let applied = "";
    const el = view("y")
        .class("shortcut-setting")
        .add([h, feedback])
        .bindGet(() => applied)
        .bindSet((key: string) => {
            applied = key || "";
            h.sv(applied);
            feedback.el.textContent = applied
                ? renderSendSync("hotkeyStatus", [path])
                    ? t("已生效")
                    : t("快捷键注册失败，可能被其他程序占用")
                : "";
        });
    h.on("input", () => {
        const next = h.gv;
        if (renderSendSync("hotkey", ["快捷键", name, next])) {
            applied = next;
            feedback.el.textContent = t("已生效");
            el.el.dispatchEvent(new CustomEvent("input"));
        } else {
            h.sv(applied);
            feedback.el.textContent = t("快捷键注册失败，可能被其他程序占用");
        }
    });
    return el;
}

function getLansName(l: string[]) {
    const lansName = l.map((i) => ({
        text: i === "auto" ? t("自动") : (displayLan.of(i) ?? i),
        lan: i,
    }));
    // todo 额外翻译其他少见的语言
    return lansName.toSorted((a, b) => a.text.localeCompare(b.text, mainLan));
}

function getIconColor(hex: string) {
    try {
        return hexToCSSFilter(hex).filter.replace(";", "");
    } catch (error) {
        return "none";
    }
}

function githubUrl(_path: string, _type: GithubUrlType | "auto" = "auto") {
    const url = renderSendSync("githubUrl", [_path, _type]);
    if (url) return url;
    if (_type === "api")
        return `https://api.github.com/${_path.replace(/^\//, "")}`;
    if (_type === "base")
        return `https://github.com/${_path.replace(/^\//, "")}`;
    return _path;
}

function isDarkMode() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function openShortcutPage(icon: IconType) {
    const index = main.findIndex((page) => page.icon === icon);
    if (index < 0) return;
    sideBarG.set(String(index));
    searchI.sv("");
    void showPage(main[index]);
    mainViewP.el.focus({ preventScroll: true });
}

function quickSettings() {
    const cards = view().class("quick-settings");
    const captureKey = getSet("快捷键.截屏搜索.key");
    const autoKey = getSet("快捷键.自动识别.key");
    const action = !captureKey && autoKey ? "自动识别" : "截屏搜索";
    const shortcut = captureKey || autoKey || "";
    const keys = view("x").class("shortcut-caps");
    for (const code of shortcut.split("+").filter(Boolean)) {
        const key = jsKeyCodeDisplay(ele2jsKeyCode(code));
        const display =
            process.platform === "darwin"
                ? (key.symble ?? key.primary)
                : key.primary;
        keys.add(ele("kbd").add(noI18n(display || code)));
    }
    if (!shortcut) keys.add(txt("设置快捷键"));
    const arrow = () =>
        image(getImgUrl("right.svg"), noI18n("")).class("quick-arrow");
    const mark = (icon: IconType) => {
        const symbol = ele("span")
            .class("quick-symbol")
            .attr({ ariaHidden: "true" });
        symbol.el.style.setProperty(
            "--glyph",
            `url("${getImgUrl(`${icon}.svg`)}")`,
        );
        return symbol;
    };
    const capture = button()
        .class("quick-card", "quick-capture")
        .attr({ title: "设置快捷键" })
        .on("click", () => openShortcutPage("space"))
        .add([
            mark("rect_select"),
            txt("快捷键").class("quick-caption"),
            p(action).class("quick-title"),
            keys,
            arrow(),
        ]);
    const language =
        getSet("屏幕翻译.语言.to") || getSet("语言.语言") || navigator.language;
    let target = language;
    try {
        target = displayLan.of(language) || language;
    } catch {
        /* User-configured language tags can be arbitrary. */
    }
    const engine = getSet("翻译.翻译器").at(0);
    const translation = button()
        .class("quick-card", "quick-translate")
        .attr({ title: "屏幕翻译" })
        .on("click", () => openShortcutPage("translate"))
        .add([
            mark("translate"),
            txt("屏幕翻译").class("quick-caption"),
            p(target, true).class("quick-title"),
            txt(engine?.name || t("未配置翻译引擎"), true).class(
                "quick-detail",
            ),
            arrow(),
        ]);
    return cards.add([capture, translation]);
}

function renderOcrPage(
    content: ElType<HTMLElement>,
    page: (typeof main)[number],
) {
    const rows = (keys: KeyPath[]) =>
        view().class("settings-group").add(keys.map(renderSetting));
    content.add(rows(["OCR.类型"]));
    const pane = view("y")
        .attr({ id: "ocr-engine-panel", role: "region" })
        .class("ocr-engine-panel")
        .addInto(content);
    const drafts = new Map<
        string,
        { model: Model; form: ElType<HTMLDialogElement> }
    >();
    function update() {
        const old = pane.el.querySelector("dialog");
        old?.dispatchEvent(new Event("model-suspend"));
        pane.clear();
        const key = getSet("OCR.类型");
        if (key.startsWith("ai-")) {
            const name = key.slice(3);
            const model = getSet("AI.在线模型").find((m) => m.name === name);
            if (!model) {
                pane.add(comment(t("未找到模型")));
                return;
            }
            pane.add(ele("h2").add(noI18n(model.name)));
            const cached = drafts.get(key);
            if (cached?.model === model) {
                pane.add(cached.form);
                return;
            }
            const form = ele("dialog")
                .class("ocr-model-sheet")
                .attr({ open: true, role: "region", ariaLabel: model.name });
            drafts.set(key, { model, form });
            pane.add(form);
            void modelDialog(model, form).then((next) => {
                drafts.delete(key);
                if (!content.el.isConnected) return;
                if (next) {
                    const all = getSet("AI.在线模型"),
                        i = all.findIndex((m) => m.name === name);
                    if (i < 0) return;
                    const result = [...all];
                    result[i] = next;
                    setSet("AI.在线模型", result);
                    if (getSet("OCR.类型") === key) {
                        const selected = next.supportVision
                            ? `ai-${next.name}`
                            : defaultOcrId;
                        if (selected !== key) setSet("OCR.类型", selected);
                    }
                    reRenderSetting("OCR.类型");
                }
                update();
            });
        } else {
            const section = page.items?.find((i) =>
                i.settings.includes(
                    key === "baidu"
                        ? "在线OCR.baidu.id"
                        : key === "youdao"
                          ? "在线OCR.youdao.id"
                          : "离线OCR",
                ),
            );
            if (section) {
                pane.add([
                    ele("h2").add(noI18n(section.title)),
                    rows(section.settings),
                ]);
            }
        }
    }
    pane.on("change", (e) => {
        if (e.target === pane.el) update();
    });
    update();
    content.add([
        ele("h2").add("常用选项"),
        rows(["OCR.离线切换", "主页面.自动复制OCR", "主页面.复制OCR后提示"]),
    ]);
}

async function showPage(page: (typeof main)[0] | undefined) {
    if (!page) {
        console.warn("Page not found");
        return;
    }
    mainView.clear();
    mainViewP.el.scrollTop = 0;
    const content = view().class("settings-page").addInto(mainView);
    content.add(
        ele("h1").add(noI18n(page.isMemo ? t("常用设置") : page.pageName)),
    );
    if (page.desc) content.add(comment(page.desc));
    if (page.about) {
        content.add(aboutPanel);
        return;
    }
    function addRows(keys: KeyPath[]) {
        const group = view().class("settings-group").addInto(content);
        if (page?.isMemo) group.class("settings-favorites");
        for (const key of keys) group.add(renderSetting(key));
    }
    if (page.icon === "ocr") {
        renderOcrPage(content, page);
        return;
    }
    if (page.icon === "space") {
        const tabs = view("x")
            .class("shortcut-scopes")
            .attr({ role: "group", ariaLabel: t("快捷键") })
            .addInto(content);
        const body = view().addInto(content);
        const modes = ["全局快捷键", "截图窗口内", "主页面"] as const;
        const sections = page.items ?? [];
        const buttons = tabs.el;
        function selectScope(index: number) {
            for (const [i, button] of Array.from(buttons.children).entries())
                button.setAttribute("aria-pressed", String(i === index));
            body.clear();
            if (index === 0)
                body.add(
                    view()
                        .class("settings-group")
                        .add(renderSetting("全局工具快捷键")),
                );
            for (const section of sections) {
                const key = section.settings[0] ?? "";
                const group = key.startsWith("快捷键.")
                    ? 0
                    : key.startsWith("主页面快捷键.")
                      ? 2
                      : 1;
                if (group !== index) continue;
                body.add([
                    ele("h2")
                        .class("shortcut-section")
                        .add(noI18n(section.title)),
                    view()
                        .class("settings-group")
                        .add(section.settings.map(renderSetting)),
                ]);
            }
        }
        for (const [i, name] of modes.entries())
            tabs.add(button(name).on("click", () => selectScope(i)));
        selectScope(0);
        return;
    }
    if (page.settings) addRows(page.settings);
    if (page.isMemo) {
        content.add(quickSettings());
        content.add(ele("h2").add("常用选项"));
        addRows(getSettingMem());
    }
    for (const section of page.items ?? []) {
        if (!content.el.isConnected) return;
        content.add(ele("h2").add(noI18n(section.title)));
        if (section.desc) content.add(comment(section.desc));
        addRows(section.settings);
        // @ts-ignore scheduler.yield is available in Electron
        await scheduler.yield();
    }
}

const updateLogClass = addClass(
    {},
    {
        h1: {
            fontSize: "1.4em",
            marginBlock: "0.5em 0.3em",
        },
        h2: {
            fontSize: "1.2em",
            position: "static",
            zIndex: "auto",
            background: "none",
            marginBlock: "0.5em 0.3em",
        },
        h3: {
            fontSize: "1.1em",
            marginBlock: "0.5em 0.3em",
        },
        "h4,h5,h6": {
            fontSize: "1em",
            marginBlock: "0.5em 0.3em",
        },
        "p,ul,ol": {
            marginBlock: "0.4em",
        },
        "ul,ol": {
            paddingInlineStart: "1.4em",
        },
    },
);

function about() {
    const releaseMarkdown = new Remarkable({ html: false });
    const el = view("y").class("settings-about");
    const logoEl = image(logo, noI18n("wSearch")).style({
        width: "48px",
        height: "48px",
    });
    const nameEl = p(packageJson.name, true).style({
        fontSize: "1.3rem",
        fontWeight: 650,
    });
    const version = button("检查更新")
        .class("settings-update")
        .on("click", () => {
            fetchAppReleases(githubUrl(releasePath, "api"))
                .then((l) => {
                    update.clear();
                    if (!l.length) update.add(comment(t("此仓库尚未发布版本")));
                    for (const [i, r] of l.entries()) {
                        const div = xGroup("y");
                        const tags = xGroup("x").style({
                            alignItems: "center",
                        });
                        const b = r.body.split("\n---").at(0) as string;
                        const p = document.createElement("div");
                        function md(body: string) {
                            p.innerHTML = releaseMarkdown.render(body);
                        }
                        md(b);
                        const trans = button("翻译").on("click", async () => {
                            const transE = getSet("翻译.翻译器");
                            if (transE.length === 0) {
                                trans.remove();
                                return;
                            }
                            const x = transE.at(
                                0,
                            ) as setting["翻译"]["翻译器"][0];
                            const e = getTranslators(store, x);
                            if (!e) return;
                            const t = await e.run(
                                b,
                                "zh",
                                getSet("语言.语言") || "zh-Hans",
                            );
                            md(t);
                        });
                        div.add([
                            ele("h1").add(noI18n(r.name)).style({
                                fontFamily: "var(--monospace)",
                            }),
                            tags,
                            getSet("语言.语言") !== "zh-HANS" ? trans : "",
                            p,
                        ]);
                        update.add(div);

                        if (r.name === packageJson.version) {
                            tags.add(txt("当前版本"));
                            break;
                        }
                        if (i === 0) {
                            tags.add(txt("最新版本"));
                        }
                        const baseName = `wSearch-${r.name}-${process.platform}-${process.arch}`;
                        const assets = r.assets.filter((i) =>
                            i.name.startsWith(baseName),
                        );
                        tags.add(
                            assets.map((i) =>
                                button(
                                    noI18n(
                                        `${t("点击下载")} ${i.name.replace(baseName, "")}`,
                                    ),
                                ).on("click", () => {
                                    shell.openExternal(i.browser_download_url);
                                }),
                            ),
                        );
                        tags.add(
                            button("忽略此版本").on("click", () => {
                                setSet("更新.忽略版本", r.name);
                                reRenderSetting("更新.忽略版本");
                            }),
                        );
                    }
                })
                .catch((error) => {
                    console.error(error);
                    update.clear().add(
                        view("y")
                            .style({ gap: "4px" })
                            .add([
                                p(t("无法检查更新"), true),
                                comment(t("请检查网络，稍后重试")),
                                comment(
                                    error instanceof Error
                                        ? error.message
                                        : String(error),
                                ),
                            ]),
                    );
                });
        });
    const update = view("y")
        .style({ gap: "16px", width: "100%" })
        .class(updateLogClass);
    const desc = p(packageJson.description);

    const infoEl = view().class("settings-links");

    function resourceLink(href: string, text: string, icon: IconType) {
        return a(href)
            .class("settings-resource")
            .add([
                image(getImgUrl(`${icon}.svg`), noI18n("")),
                txt(text),
                image(getImgUrl("right.svg"), noI18n("")),
            ]);
    }
    infoEl.add([
        resourceLink(packageJson.homepage, "项目主页：", "browser"),
        resourceLink(releasePage, "版本发布", "history"),
        resourceLink(renderSendSync("feedbackBug", []), "反馈问题", "help"),
        resourceLink(
            renderSendSync("feedbackFeature", [
                { title: t("建议在……添加……功能/改进") },
            ]),
            "提供建议",
            "text",
        ),
        resourceLink(
            `${projectUrl}/tree/master/lib/translate`,
            "改进翻译",
            "translate",
        ),
        resourceLink(packageJson.homepage, "为项目点亮星标🌟", "star"),
    ]);
    const credits = view("y")
        .class("settings-credits")
        .add([
            view().add([
                txt("本软件遵循"),
                " ",
                a("https://www.gnu.org/licenses/gpl-3.0.html").add(
                    noI18n(packageJson.license),
                ),
                noI18n(" · QQ:1057170038"),
            ]),
            txt(
                `Copyright © 2021–${new Date().getFullYear()} ${packageJson.author.name} · ${packageJson.author.email}`,
                true,
            ),
        ]);
    return el.add([
        view("x")
            .class("settings-about-header")
            .add([
                logoEl,
                view("y").add([
                    nameEl,
                    txt(packageJson.version, true).class(Class.mono),
                ]),
                spacer(),
                version,
            ]),
        update,
        desc,
        infoEl,
        credits,
    ]);
}

setTranslate((text) => t(text));

initStyle(store);

for (const v of Object.values(s)) {
    if (!v) continue;
    v.name = t(v.name);
    if (v.desc) v.desc = t(v.desc);
}
for (const v of Object.values(xs)) {
    if (!v) continue;
    v.name = t(v.name);
    if (v.desc) v.desc = t(v.desc);
}
for (const p of main) {
    p.pageName = t(p.pageName);
    if (p.desc) p.desc = t(p.desc);
    if (p.items)
        for (const i of p.items) {
            i.title = t(i.title);
        }
}

pack(document.body).class("settings-shell");
function setSettingsFont() {
    document.body.style.fontFamily =
        getSet("字体.主要字体") ||
        '"Segoe UI Variable Text", "Segoe UI", "Microsoft YaHei UI", "PingFang SC", sans-serif';
}
setSettingsFont();
setTitle(t("设置"));
const baseWidth = "300px";
const baseWidth2 = "150px";
const blockSetting = addClass({ width: "100%" }, {});

ele("style")
    .attr({
        textContent: `
.settings-shell {
    --accent: var(--desk-accent);
    --accent-wash: color-mix(in srgb,var(--accent) 11%,var(--surface));
    --stage: var(--desk-rail);
    --surface: var(--desk-raised);
    --settings-line:var(--desk-line);
    --settings-muted:var(--desk-muted);
    --soft: color-mix(in srgb, var(--font-color) 5%, var(--surface));
    display: flex;
    height: 100dvh;
    overflow: hidden;
    color-scheme: light dark;
    background: var(--stage);
    color: var(--font-color);
    font-size: 14px;
    line-height: 1.5;
    font-family:
        var(--main-font), "Segoe UI Variable Text", "Microsoft YaHei UI",
        sans-serif;
}
.settings-shell :is(button, input, select, textarea):focus-visible,
.settings-sidebar label:has(:focus-visible),
.settings-option:has(:focus-visible) {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
}
.settings-main:focus {
    outline: none;
}
.settings-sidebar {
    flex: 0 0 clamp(184px, 21vw, 225px);
    min-width: 0;
    height: 100%;
    padding: 0 12px 12px;
    background: transparent;
    color: var(--font-color);
    color-scheme: inherit;
    gap: 0;
    box-sizing:border-box;
}
.settings-sidebar .settings-brand {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 62px;
    padding: 0 8px;
    color: var(--font-color);
    font:
        650 22px / 1 "Segoe UI Variable Display",
        "Segoe UI",
        sans-serif;
    letter-spacing: -0.85px;
}
.settings-brand img {
    background: transparent;
    padding: 4px;
    border-radius: 8px;
    box-sizing: content-box;
    width: 24px;
    height: 24px;
}

.settings-search {
    margin: 6px 4px 16px;
}
.settings-search-field {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
}
.settings-search-field > img {
    width: 15px;
    height: 15px;
    position: absolute;
    inset-inline-start: 10px;
    filter:var(--icon-color);
    pointer-events: none;
}
.settings-search-field > input {
    width: 100%;
    height: 33px;
    min-width: 0;
    padding: 0 44px 0 32px;
    border-radius: 7px;
    border: 1px solid var(--settings-line);
    outline: none;
    background: var(--surface);
    color: var(--font-color);
    font: inherit;
    font-size: 12px;
}
.settings-search-field > input::placeholder {
    color: var(--settings-muted);
}
.settings-search-field > kbd {
    position: absolute;
    inset-inline-end: 6px;
    padding: 1px 4px;
    pointer-events: none;
    border: 1px solid var(--settings-line);
    border-radius: 4px;
    background: none;
    color: var(--settings-muted);
    box-shadow: none;
    font:
        500 10px / 1.5 "Segoe UI",
        sans-serif;
    white-space: nowrap;
}
.settings-search-field > .search-clear {
    display: none;
    align-items: center;
    justify-content: center;
    position: absolute;
    inset-inline-end: 4px;
    width: 25px;
    height: 25px;
    padding: 4px;
    border-radius: 4px;
    background: transparent;
    outline: none;
}
.search-clear img {
    width: 15px;
    height: 15px;
    filter:var(--icon-color);
}
.settings-search-field:has(input:not(:placeholder-shown)) > kbd {
    display: none;
}
.settings-search-field:has(input:not(:placeholder-shown)) > .search-clear {
    display: flex;
}
.settings-routes {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    gap: 2px;
    padding: 2px 0 7px 2px;scrollbar-gutter:stable;scroll-padding-block:4px;overscroll-behavior:contain;
}
.settings-nav-section {
    gap: 2px;
}
.settings-routes::-webkit-scrollbar {
    width: 10px;
}
.settings-routes::-webkit-scrollbar-thumb {
    background:transparent;
    border:4px solid transparent;
    background-clip:padding-box;border-radius:99px;
}
.settings-routes:is(:hover,:focus-within,.is-scrolling)::-webkit-scrollbar-thumb {
    background-color:color-mix(in srgb,var(--font-color) 37%,transparent);
}
.settings-routes::-webkit-scrollbar-thumb:hover,.settings-routes::-webkit-scrollbar-thumb:active {
    border-width:2px;background-color:color-mix(in srgb,var(--font-color) 52%,transparent);
}
.settings-sidebar .nav-heading {
    color: var(--settings-muted);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    padding: 13px 12px 5px;
}
.settings-sidebar label {
    position: relative;
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 11px;
    box-sizing:border-box;min-height:32px;
    padding: 5px 12px;
    border-radius: 6px;
    cursor: pointer;
    color: var(--font-color);
    font-size: 13px;
    line-height: 1.42;
}
.settings-sidebar label > img {
    width: 16px;
    height: 16px;
    filter:var(--icon-color);
    opacity: 0.88;
}
.settings-sidebar label:hover {
    background: var(--fluent-fill);
    color: var(--font-color);
}
.settings-sidebar label:has(input:checked) {
    background: var(--desk-selection);
    color: var(--font-color);
    font-weight: 650;
}
.settings-sidebar label:has(input:checked)::before {
    content: "";
    position: absolute;
    inset-inline-start: 2px;
    width: 3px;
    height: 15px;
    background: var(--accent);
    border-radius: 3px;
}
.settings-sidebar label:has(input:checked) img {
    filter:var(--icon-color);
    opacity: 1;
}
.settings-sidebar input[type="radio"],
.settings-option input[type="radio"] {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
}
.settings-sidebar label > input[type=radio] {
    inset:0;margin:0;width:100%;height:100%;opacity:0;clip-path:none;cursor:pointer;
}
.settings-nav-footer {
    border-block-start: 1px solid var(--settings-line);
    padding: 9px 2px 0;
    margin-block-start: 4px;
    position: relative;
}
.settings-sidebar .nav-version {
    position: absolute;
    inset-inline-end: 9px;
    top: 16px;
    color: var(--settings-muted);
    font:
        11px / 1.5 var(--monospace),
        monospace;
    pointer-events: none;
}
.settings-sidebar > div:has(> button) button {
    font-size: 12px;
}
.settings-main {
    min-width: 0;
    flex: 1;
    overflow: auto;
    scrollbar-gutter: stable;
    container-type: inline-size;
}
.settings-content {
    max-width: 1010px;
    margin-inline: auto;
    padding: clamp(24px, 4vw, 50px) clamp(18px, 3.4vw, 48px) 48px;
}
.settings-page > h1 {
    margin: 0 0 26px;
    color:var(--desk-ink);
    font-family:var(--desk-display);
    font-size:clamp(32px,3.7vw,42px);
    font-weight:550;line-height:1.22;letter-spacing:-.035em;
    overflow-wrap:anywhere;
}
.settings-page > h2 {
    margin:29px 0 10px;color:var(--desk-muted);
    font-size:13px;font-weight:600;line-height:1.45;
}
.quick-settings {
    display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;
}
.settings-shell .quick-card {
    --mark-ink:var(--desk-accent);
    --mark-bg:color-mix(in srgb,var(--mark-ink) 13%,var(--desk-raised));
    display:grid;grid-template-columns:38px minmax(0,1fr) 14px;
    grid-template-rows:auto auto 1fr;align-items:center;align-content:start;
    column-gap:12px;row-gap:3px;position:relative;width:100%;height:auto;
    min-height:112px;padding:16px 18px;text-align:start;border:1px solid var(--desk-line);
    border-radius:13px;outline:0;box-shadow:0 1px 2px #160b0208;
    background:linear-gradient(112deg,color-mix(in srgb,var(--mark-ink) 5%,var(--desk-raised)),var(--desk-raised) 80%);
    color:var(--desk-ink);
    transition:background-color 120ms,border-color 120ms,box-shadow 120ms;
}
.settings-shell .quick-translate {--mark-ink:var(--desk-secondary)}
.settings-shell .quick-card:enabled:hover {
    border-color:color-mix(in srgb,var(--mark-ink) 48%,var(--desk-line));
    box-shadow:0 2px 8px #20100412;
}
.settings-shell .quick-card:focus-visible {outline:2px solid var(--desk-accent);outline-offset:2px}
.quick-symbol {
    grid-column:1;grid-row:1/3;display:grid;place-items:center;
    width:38px;height:38px;border-radius:11px;color:var(--mark-ink);background:var(--mark-bg);
}
.quick-symbol::before {content:"";width:21px;height:21px;background:currentColor;mask:var(--glyph) center/contain no-repeat}
.quick-caption {grid-column:2;grid-row:1;font-size:11px;font-weight:500;color:var(--desk-muted)}
.quick-card .quick-title {grid-column:2;grid-row:2;margin:0;min-width:0;font-size:19px;line-height:1.32;font-weight:600;overflow-wrap:anywhere;letter-spacing:-.025em}
.quick-arrow {grid-column:3;grid-row:1/3;width:14px;height:14px;filter:var(--icon-color);opacity:.62}
.shortcut-caps,.quick-detail {grid-column:2/4;grid-row:3;align-self:end;color:var(--desk-muted);font-size:12px;line-height:1.4;padding-top:5px}
.shortcut-caps {display:flex;align-items:center;flex-wrap:wrap;gap:4px}
.quick-detail {overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.quick-capture kbd {font:500 11px/1.4 var(--main-font),sans-serif;color:var(--desk-ink);padding:1px 6px;border-radius:4px;border:1px solid var(--desk-line);background:var(--desk-paper);box-shadow:none}
.settings-group,.settings-about {
    min-width:0;background:var(--desk-raised);border:1px solid var(--settings-line);
    border-radius:12px;box-shadow:none;
}
.settings-group.settings-favorites {
    display:block;background:transparent;border:none;border-block:1px solid var(--desk-line);border-radius:0;
}
.settings-favorites.settings-group > .settings-row {
    border-radius:0;background:transparent;padding-inline:2px;
}
.settings-shell .settings-add {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 27px;
    height: auto;
    width: auto;
    padding: 3px 8px;
    border-radius: 6px;
    background: var(--soft);
    color: var(--settings-muted);
    outline: 1px dashed var(--settings-line);
}
.settings-add img {
    width: 13px;
    height: 13px;
    filter: var(--icon-color);
}
.settings-list-item {
    max-width: 100%;
    background: var(--soft);
    font-size: 13px;
    overflow-wrap: anywhere;
}
.settings-list-item span {
    min-width: 0;
    padding-inline: 5px;
}
.settings-group > .settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 10px 20px;
    padding: 15px 19px;
    min-width: 0;
    min-height: 54px;
    overflow-wrap: anywhere;
}
.settings-row + .settings-row {
    border-top: 1px solid var(--settings-line);
}
.settings-row .row-caption {
    min-width: 110px;
    flex: 1 1 150px;
}
.setting-name {
    font-size: 14px;
    font-weight: 600;
    line-height: 1.45;
}
.settings-row .row-caption p + p {
    margin-top: 3px;
}
.settings-row > :last-child {
    min-width: 0;
    max-width: 100%;
}
.settings-group .settings-options {
    display: flex;
    flex-wrap: wrap;
    width: auto;
    gap: 5px;
    align-items: center;
    max-width: 100%;
}
.settings-option {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 10px;
    border-radius: 6px;
    min-height: 28px;
    cursor: pointer;
    outline: 1px solid var(--settings-line);
    outline-offset: -1px;
    font-size: 13px;
    line-height: 1.35;
    background: var(--surface);
}
.settings-option:hover {
    background: var(--soft);
}
.settings-options > .settings-option:has(input:checked) {
    outline-color: var(--accent);
    background: var(--accent-wash);
    color: var(--accent);
    font-weight: 650;
}
.settings-row[data-name="OCR.类型"] > .settings-options {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    gap: 8px;
}
.settings-options .engine-choice {
    display: grid;
    grid-template-columns: 17px minmax(0, 1fr);
    justify-content: start;
    align-content: center;
    gap: 3px 7px;
    text-align: start;
    min-height: 56px;
    padding: 7px 10px;
    position: relative;
}
.engine-choice::after {
    content: "";
    position: absolute;
    top: 7px;
    inset-inline-end: 7px;
    border: 1px solid var(--settings-line);
    width: 7px;
    height: 7px;
    border-radius: 50%;
}
.engine-choice:has(:checked)::after {
    border-color: var(--accent);
    background: var(--accent);
}
.engine-icon {
    width: 16px;
    height: 16px;
    grid-column: 1;
    filter: var(--icon-color);
}
.engine-source {
    grid-column: 2;
    font-size: 10px;
    color: var(--settings-muted);
    font-weight: 450;
}
.settings-shell input.settings-switch {
    --m-color: var(--accent);
    width: 35px;
    height: 20px;
    top: 0;
    padding: 0;
    flex-shrink: 0;
    border-radius: 99px;
    position: relative;
    cursor: pointer;
    outline: none;
    background: color-mix(in srgb, var(--font-color) 32%, var(--surface));
}
.settings-shell .settings-switch::before {
    content: "";
    position: absolute;
    top: 3px;
    inset-inline-start: 3px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 1px 3px #0004;
    transition: inset-inline-start 130ms;
}
.settings-shell .settings-switch:checked {
    background-image: none;
}
.settings-shell .settings-switch:checked::before {
    inset-inline-start: 18px;
    background: light-dark(white, #263159);
}
.settings-content input:is([type="text"], [type="password"]),
.settings-content textarea {
    width: 300px;
    max-width: 100%;
    font-family: var(--monospace);
}
.settings-content input[type="number"] {
    font-family: var(--monospace);
}
.settings-content
    :is(
        input[type="text"],
        input[type="password"],
        input[type="number"],
        select,
        textarea
    ):not(:focus-visible) {
    outline-color: var(--settings-line);
}
.settings-content button:not(.quick-card):not(:has(.icon)) {
    font-size: 13px;
}
.settings-about {
    padding: 22px;
    gap: 16px;
    overflow-wrap: anywhere;
}
.settings-about-header {
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    border-bottom: 1px solid var(--settings-line);
    padding-bottom: 15px;
}
.settings-about-header span,
.settings-links {
    color: var(--settings-muted);
}
.settings-shell .settings-update {
    height: 34px;
    padding-inline: 15px;
    border-radius: 7px;
    background: var(--accent);
    color: var(--bg);
    font-weight: 650;
    outline: none;
}
.settings-links {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
    font-size: 13px;
}
.settings-shell a.settings-resource {
    display: flex;
    align-items: center;
    gap: 9px;
    text-decoration: none;
    padding: 9px 11px;
    border-radius: 6px;
    background: var(--soft);
    color: var(--font-color);
}
.settings-shell a.settings-resource:hover {
    background: var(--accent-wash);
    color: var(--accent);
}
.settings-resource img {
    width: 15px;
    height: 15px;
    filter: var(--icon-color);
}
.settings-resource img:last-child {
    width: 12px;
    margin-inline-start: auto;
    opacity: 0.65;
}
.settings-credits {
    gap: 2px;
    color: var(--settings-muted);
    font-size: 11px;
}
.settings-credits a {
    color: inherit;
}
.settings-shell a {
    text-decoration: underline;
    text-underline-offset: 2px;
}
@container (max-width: 460px) {
    .settings-content {
        padding: 21px 14px 35px;
    }
    .quick-settings {gap:8px}
    .settings-shell .quick-card {padding:12px;grid-template-columns:28px minmax(0,1fr) 10px;column-gap:7px;min-height:100px}
    .quick-symbol {width:28px;height:28px;border-radius:8px}
    .quick-symbol::before {width:17px;height:17px}
    .quick-arrow {width:10px;height:10px}
    .quick-card .quick-title {font-size:16px}
    .settings-group > .settings-row {
        padding: 12px;
        gap: 8px;
    }
    .settings-row .row-caption {
        flex-basis: 115px;
    }
}
@container (max-width: 350px) {
    .quick-settings {grid-template-columns:minmax(0,1fr)}
    .settings-shell .quick-card {min-height:80px}
}
@media (max-width: 760px) {
    .settings-sidebar {
        flex-basis: 158px;
        padding-inline: 8px;
    }
    .settings-sidebar .settings-brand {
        min-height: 62px;
        font-size: 19px;
    }
    .settings-sidebar label {
        font-size: 12px;
        min-height: 30px;
        gap: 7px;
    }
    .settings-search-field > kbd {
        display: none;
    }
    .settings-search-field > input {
        padding-inline-end: 24px;
    }
}
@media (prefers-reduced-motion: reduce) {
    .settings-shell *,
    .settings-shell *::before {
        transition: none !important;
    }
}
`,
    })
    .addInto(document.head);

const sideBar = view("y")
    .class("settings-sidebar")
    .attr({ role: "navigation", ariaLabel: t("设置") })
    .addInto();
if (!document.body.classList.contains("window-chrome")) {
    sideBar.add(
        view("x")
            .class("settings-brand")
            .add([image(logo, noI18n("")), txt("wSearch", true)]),
    );
}
const sideBarG = radioGroup("侧栏", true);
const searchBar = view().class("settings-search").addInto(sideBar);
const searchField = view("x").class("settings-search-field").addInto(searchBar);
searchField.add(image(getImgUrl("search.svg"), noI18n("")));
const searchEntries: {
    key: string;
    name: string;
    desc?: string;
    actions?: string[];
}[] = [];
for (const [key, item] of Object.entries({ ...xs, ...s })) {
    searchEntries.push({
        key,
        name: item.name,
        desc: "desc" in item ? item.desc : undefined,
        actions:
            key === "全局工具快捷键"
                ? actionChoices().map((o) => o.name)
                : undefined,
    });
}
const settingsSearch = new Fuse(searchEntries, {
    keys: ["name", "desc", "key", "actions"],
});
const searchI = input()
    .attr({ placeholder: t("搜索设置"), ariaLabel: t("搜索设置") })
    .addInto(searchField)
    .on("input", () => {
        if (!searchI.gv) {
            showPage(main.at(Number(sideBarG.get())));
            return;
        }
        const l = settingsSearch.search(searchI.gv).map((i) => i.item.key);
        if (l.length === 0) {
            mainView.clear().add(
                xGroup("y")
                    .style({
                        alignItems: "center",
                        justifyContent: "center",
                        height: "80vh",
                    })
                    .add([
                        p("无结果，尝试其他关键词"),
                        a(
                            renderSendSync("feedbackFeature", [
                                { title: t("添加设置项") },
                            ]),
                        ).add(button("提交新功能")),
                    ]),
            );
            return;
        }
        renderSettingList(l, t("搜索结果"));
    });
searchField.add(
    button(image(getImgUrl("close.svg"), noI18n("")))
        .class("search-clear")
        .attr({ ariaLabel: t("清空") })
        .on("click", () => {
            searchI.sv("");
            searchI.el.dispatchEvent(new Event("input"));
            searchI.el.focus();
        }),
);
searchI.on("keydown", (event) => {
    if (event.key === "Escape" && searchI.gv) {
        event.stopPropagation();
        searchI.sv("");
        searchI.el.dispatchEvent(new Event("input"));
    }
});
searchField.add(
    ele("kbd").add(noI18n(process.platform === "darwin" ? "⌘ F" : "Ctrl F")),
);
document.addEventListener("keydown", (event) => {
    if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f" &&
        !document.querySelector("dialog:modal")
    ) {
        event.preventDefault();
        searchI.el.focus();
        searchI.el.select();
    }
});
const mainViewP = view()
    .class("settings-main")
    .attr({ tabIndex: -1, role: "main" })
    .addInto();
const mainView = view().class("settings-content").addInto(mainViewP);
const aboutPanel = about();

const contextMenuP = view()
    .style({ margin: 0, padding: 0, borderRadius: cssVar("o-padding") })
    .class(Class.glassBar, Class.smallSize)
    .attr({ popover: "auto" })
    .addInto();
const contextMenu = view("y")
    .class(Class.click)
    .style({ padding: cssVar("o-padding") })
    .on("click", () => {
        contextMenuP.el.hidePopover();
    })
    .addInto(contextMenuP);

function showContextMenu(e: MouseEvent) {
    contextMenuP.style({
        // 保证焦点在菜单上
        left: `${e.clientX - 4}px`,
        top: `${e.clientY - 4}px`,
    });
    contextMenuP.el.showPopover();
}

const routes = view("y").class("settings-routes").addInto(sideBar);
let navScrollEnd: ReturnType<typeof setTimeout>;
routes.on(
    "scroll",
    () => {
        routes.el.classList.add("is-scrolling");
        clearTimeout(navScrollEnd);
        navScrollEnd = setTimeout(
            () => routes.el.classList.remove("is-scrolling"),
            650,
        );
    },
    { passive: true },
);
const navFooter = view("y").class("settings-nav-footer").addInto(sideBar);
const featureNav = view("y").class("settings-nav-section");
const appNav = view("y").class("settings-nav-section");
featureNav.add(txt("功能").class("nav-heading"));
appNav.add(txt("偏好设置").class("nav-heading"));
for (const [i, page] of main.entries()) {
    const label = sideBarG
        .new(String(i), image(getImgUrl(`${page.icon}.svg`), noI18n("")))
        .add(txt(page.pageName, true));
    label.on("click", () => {
        if (searchI.gv && sideBarG.get() === String(i)) {
            searchI.sv("");
            showPage(page);
        }
    });
    if (page.isMemo) routes.add(label);
    else if (page.about)
        navFooter.add([
            label,
            txt(packageJson.version, true).class("nav-version"),
        ]);
    else if (
        ["save", "space", "main", "filters", "link", "setting"].includes(
            page.icon,
        )
    )
        appNav.add(label);
    else featureNav.add(label);
}
routes.add([featureNav, appNav]);

sideBarG.on(() => {
    const current = routes.el.querySelector("input:checked")?.closest("label");
    current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    searchI.sv("");
    showPage(main.at(Number(sideBarG.get())));
});

sideBar.class(
    addClass(
        {},
        {
            "& button:not(:has(.icon))": {
                height: "auto",
                minHeight: cssVar("b-button"),
            },
        },
    ),
);

const reloadEl = view().addInto(sideBar);
const reloadScreenShot = view().addInto(sideBar);

const historyEl = view("y")
    .class("change-actions")
    .attr({ role: "group", ariaLabel: t("更改的设置") });
historyEl.el.hidden = true;
sideBar.el.insertBefore(historyEl.el, navFooter.el);
const changeCount = txt("", true).class("change-count");
const reviewChanges = button()
    .class("review-changes")
    .add([
        image(getImgUrl("history.svg"), noI18n("")),
        txt("更改的设置"),
        changeCount,
    ])
    .on("click", () => {
        renderSettingList(Array.from(nowStoreK), t("更改的设置"));
        mainView.el.firstElementChild?.setAttribute("data-change-review", "");
    });
const undoChanges = button()
    .class("undo-changes")
    .add([image(getImgUrl("left.svg"), noI18n("")), txt("放弃本次修改")])
    .on("click", () => {
        for (const key of Array.from(nowStoreK)) {
            setSet(key, getFromStore(oldStore, key));
            reRenderSetting(key);
        }
        if (mainView.el.querySelector("[data-change-review]")) {
            void showPage(main.at(Number(sideBarG.get())));
            mainViewP.el.focus({ preventScroll: true });
        }
    });
historyEl.add([reviewChanges, undoChanges]);

bindRun();

showPage(main[0]);

document.body.onclick = (e) => {
    const el = (e.target as HTMLElement)?.closest("a") as HTMLAnchorElement;
    if (el) {
        e.preventDefault();
        if (el.href.startsWith("http") || el.href.startsWith("https")) {
            e.preventDefault();
            shell.openExternal(el.href);
        }
    }
};
