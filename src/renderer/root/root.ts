import { addClass, addStyle, ele, image, initDKH, noI18n, view } from "dkh-ui";
import { renderOn } from "../../../lib/ipc";
import { lan, t } from "../../../lib/translate/translate";
import type { RawIconType } from "../../iconTypes";
import brandIcon from "../assets/icon.svg";

const fs = require("node:fs") as typeof import("node:fs");
const { pathToFileURL } = require("node:url") as typeof import("node:url");
const path = require("node:path") as typeof import("node:path");

function initStyle(
    store: typeof import("../../../lib/store/renderStore")["default"],
) {
    addStyle({ "html:not(.dev-mode) [data-dev]": { display: "none" } });
    document.documentElement.classList.toggle("dev-mode", store.get("dev"));
    renderOn("developerMode", ([enabled]) =>
        document.documentElement.classList.toggle("dev-mode", enabled),
    );
    renderOn("uiLanguage", ([language]) => lan(language));
    function setCSSVar(name: string, value: string) {
        if (value) document.documentElement.style.setProperty(name, value);
    }
    const appearance = store.get("全局");
    const 模糊 = appearance.模糊;
    if (模糊 !== 0) {
        setCSSVar("--blur", `blur(${模糊}px)`);
    } else {
        setCSSVar("--blur", "none");
    }

    setCSSVar("--alpha", `${appearance.不透明度 * 100}%`);

    const theme = appearance.主题;
    setCSSVar("--bar-bg0", theme.light.barbg);
    setCSSVar("--bg", theme.light.bg);
    setCSSVar("--emphasis-color", theme.light.emphasis);
    setCSSVar("--d-bar-bg0", theme.dark.barbg);
    setCSSVar("--d-bg", theme.dark.bg);
    setCSSVar("--d-emphasis-color", theme.dark.emphasis);
    setCSSVar("--font-color", theme.light.fontColor);
    setCSSVar("--d-font-color", theme.dark.fontColor);
    setCSSVar("--font-color-emphasis", theme.light.fontInEmphasis);
    setCSSVar("--d-font-color-emphasis", theme.dark.fontInEmphasis);
    setCSSVar("--icon-color", theme.light.iconColor);
    setCSSVar("--d-icon-color", theme.dark.iconColor);

    function checkIconColor(c: string) {
        return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='${c}' stroke-width='4' stroke-linecap='round' stroke-linejoin='round'><polyline points='20 8 9 19 4 14'></polyline></svg>`)}")`;
    }

    setCSSVar("--check-icon", checkIconColor(theme.light.fontInEmphasis));
    setCSSVar("--d-check-icon", checkIconColor(theme.dark.fontInEmphasis));

    const 字体 = store.get("字体");
    initEmbeddedMonoFont();
    setCSSVar("--main-font", 字体.主要字体);
    setCSSVar("--monospace", 字体.等宽字体 || monoFont.join(","));

    lan(store.get("语言.语言"));

    initDKH({
        pureStyle: true,
        attrMap: {
            title: (s: string, el) => {
                const title = t(s);
                el.setAttribute("data-title", title);
                el.setAttribute("aria-label", title);
            },
        },
    });

    const chrome = new URLSearchParams(location.search);
    if (chrome.get("chrome") === "windows") {
        const material = chrome.get("material");
        document.body.classList.add("window-chrome");
        if (material === "mica") document.body.classList.add("window-mica");
        const accent = chrome.get("accent");
        if (accent && /^[0-9a-f]{6}$/i.test(accent))
            setCSSVar("--system-accent", `#${accent}`);
        const caption = ele("header")
            .class("window-caption")
            .add([
                image(brandIcon, noI18n("")),
                ele("span").add(noI18n("wSearch")),
            ]);
        document.body.prepend(caption.el);
    }
    const topTip = view()
        .class("app-tooltip")
        .attr({ popover: "manual", role: "tooltip", id: "app-tooltip" })
        .addInto();
    const tipDelay = 400;
    let tipEl: HTMLElement | null = null;
    let tipTimer: ReturnType<typeof setTimeout> | undefined;

    function hideTip() {
        clearTimeout(tipTimer);
        tipTimer = undefined;
        if (topTip.el.matches(":popover-open")) topTip.el.hidePopover();
        if (tipEl) {
            const ids = (tipEl.getAttribute("aria-describedby") || "")
                .split(/\s+/)
                .filter((id) => id && id !== topTip.el.id);
            if (ids.length)
                tipEl.setAttribute("aria-describedby", ids.join(" "));
            else tipEl.removeAttribute("aria-describedby");
        }
        tipEl = null;
    }

    function showTip(el: HTMLElement) {
        const title = el.dataset.title || el.getAttribute("aria-label");
        if (!title?.trim() || !el.isConnected) {
            hideTip();
            return;
        }
        // A tooltip hosted by its dialog stays in the same interactive top layer.
        const host = el.closest("dialog[open], :popover-open") ?? document.body;
        if (topTip.el.parentElement !== host) host.append(topTip.el);
        topTip.el.textContent = title;
        topTip.el.showPopover();
        const ids = new Set(
            (el.getAttribute("aria-describedby") || "")
                .split(/\s+/)
                .filter(Boolean),
        );
        ids.add(topTip.el.id);
        el.setAttribute("aria-describedby", Array.from(ids).join(" "));
        const rect = el.getBoundingClientRect();
        const tw = topTip.el.offsetWidth;
        const th = topTip.el.offsetHeight;
        const ow = window.innerWidth;
        const oh = window.innerHeight;
        const left = Math.max(
            0,
            Math.min(rect.left + rect.width / 2 - tw / 2, ow - tw),
        );
        let top = rect.bottom + 4;
        if (top > oh - th) {
            top = rect.top - th - 4;
        }
        topTip.style({
            left: `${left}px`,
            top: `${Math.max(Math.min(top, oh - th), 0)}px`,
        });
    }

    function queueTip(target: EventTarget | null) {
        const el =
            target instanceof Element
                ? target.closest<HTMLElement>(
                      "[data-title], button[aria-label], [role=button][aria-label]",
                  )
                : null;
        if (el === tipEl) return;
        hideTip();
        if (!el) return;
        tipEl = el;
        tipTimer = setTimeout(() => {
            if (tipEl === el) showTip(el);
        }, tipDelay);
    }
    window.addEventListener("pointerover", (e) => {
        if (e.pointerType !== "touch") queueTip(e.target);
    });
    window.addEventListener("focusin", (e) => {
        if (e.target instanceof Element && e.target.matches(":focus-visible"))
            queueTip(e.target);
    });
    window.addEventListener("focusout", hideTip);
    window.addEventListener("pointerdown", hideTip, true);
    window.addEventListener("scroll", hideTip, true);
    window.addEventListener("resize", hideTip);
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") hideTip();
    });
    window.addEventListener("pointerout", (e) => {
        if (!tipEl) return;
        const to = e.relatedTarget as Node | null;
        if (to && tipEl.contains(to)) return;
        hideTip();
    });

    window.addEventListener("blur", hideTip);

    document.addEventListener("visibilitychange", () => {
        if (document.hidden) hideTip();
    });
}

const iconUrls = import.meta.glob<string>("../assets/icons/*.svg", {
    eager: true,
    import: "default",
    query: "?inline",
});
function getImgUrl(name: RawIconType) {
    return iconUrls[`../assets/icons/${name}`];
}

function setTitle(t: string) {
    document.title = `wSearch ${t}`;
    const caption = document.querySelector(".window-caption span");
    if (caption) caption.textContent = document.title;
}

const cssColor = {
    font: {
        f0: cssVarR("font-color"),
        light: cssVarR("font-color-l"),
        llight: cssVarR("font-color-ll"),
        main: cssVarR("font-color-emphasis"),
    },
    f: cssVarR("m-color-f"),
    ff: cssVarR("m-color-ff"),
    fff: cssVarR("m-color-fff"),
    b: cssVarR("m-color-b"),
    bb: cssVarR("m-color-bb"),
    bbb: cssVarR("m-color-bbb"),
    main: cssVarR("m-color"),
    bg: cssVarR("bg"),
};

const Class = {
    gap: addClass({ gap: cssVar("o-padding") }, {}),
    group: "group",
    smallSize: "small-size",
    mono: addClass({ fontFamily: cssVar("monospace") }, {}),
    click: addClass(
        { transition: cssVar("transition"), cursor: "pointer" },
        { "&:active": { transform: "var(--button-active)" } },
    ),
    click1: addClass(
        { transition: cssVar("transition"), cursor: "pointer" },
        {},
    ),
    hover: addClass(
        {},
        { "&:hover": { backgroundColor: "var(--hover-color)" } },
    ),
    button: "",
    transition: addClass({ transition: cssVar("transition") }, {}),
    deco: addClass(
        {
            borderRadius: cssVarR("border-radius"),
            outline: `1px solid ${cssVarR("border-color")}`,
            outlineOffset: "-1px",
        },
        {},
    ),
    noDeco: addClass(
        {
            outline: "none",
        },
        {},
    ),
    textItem: addClass(
        {
            paddingInline: "var(--o-padding)",
        },
        {},
    ),
    glassBar: "bar",
    /** 背景是屏幕 */
    screenBar: addClass(
        {
            borderRadius: cssVarR("border-radius"),
            backgroundColor: cssColor.bg,
        },
        {
            "& :is(button, *:has(> .icon), input, .deco)": {
                outline: "none",
            },
        },
    ),
    hide: addClass(
        {
            opacity: "0",
            pointerEvents: "none",
        },
        {},
    ),
};

Class.button = `${Class.click} ${Class.hover}`;

const embeddedMonoFont = "FiraCode";

function initEmbeddedMonoFont() {
    const dirs = [
        path.join(__dirname, "../../assets/fonts"),
        path.join(process.cwd(), "assets/fonts"),
    ];
    const fonts = [
        ["FiraCode-Regular.woff2", "400"],
        ["FiraCode-Bold.woff2", "700"],
    ] as const;
    for (const [file, weight] of fonts) {
        const fontPath = dirs
            .map((dir) => path.join(dir, file))
            .find((p) => fs.existsSync(p));
        if (!fontPath) continue;
        const source =
            location.protocol === "file:"
                ? `url("${pathToFileURL(fontPath).href}")`
                : `url("/@fs/${fontPath.replaceAll("\\", "/")}")`;
        document.fonts.add(
            new FontFace(embeddedMonoFont, source, { weight, display: "swap" }),
        );
    }
}

const monoFont = [
    embeddedMonoFont,
    "Cascadia Code Light",
    "Courier New",
    "Courier",
    "Lucida Console",
    "Monaco",
    "Liberation Mono",
    "Roboto Mono",
];

function cssVar(x: "transition" | "o-padding" | "monospace" | "b-button") {
    return cssVarR(x);
}
function cssVarR(x: string) {
    return `var(--${x})`;
}

export { Class, cssColor, cssVar, getImgUrl, initStyle, monoFont, setTitle };
