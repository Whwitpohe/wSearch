import { button, ele, input, noI18n, txt, view } from "dkh-ui";
import { renderOn, renderSend, renderSendSync } from "../../../lib/ipc";
import type {
    PinPanelAction,
    PinPanelPlacement,
    PinPanelState,
} from "../../ShareTypes";
import closeIcon from "../assets/icons/close.svg";
import compareIcon from "../assets/icons/compare.svg";
import pictureIcon from "../assets/icons/img.svg";
import imageTextIcon from "../assets/icons/ocr.svg";
import opacityIcon from "../assets/icons/opacity.svg";
import sizeIcon from "../assets/icons/size.svg";
import textIcon from "../assets/icons/text.svg";
import languageIcon from "../assets/icons/translate.svg";
import { languageName, languagePicker } from "./languagePicker";

ele("style")
    .add(
        noI18n(`
* {
    box-sizing: border-box;
}
html,
body {
    margin: 0;
    background: transparent;
    color-scheme: light dark;
}
body {
    --surface: light-dark(#f7f7f7, #2c2c2c);
    --ink: light-dark(#191919, #fafafa);
    --sub: light-dark(#585858, #d0d0d0);
    --line: light-dark(#0002, #fff2);
    --hover: light-dark(#0000000c, #ffffff10);
    --accent: light-dark(#005fb8, #60cdff);
    width: max-content;
    max-width: 100%;
    overflow: hidden;
    color: var(--ink);
    font:
        13px / 1.4 "Segoe UI Variable Text",
        "Segoe UI",
        "Microsoft YaHei UI",
        sans-serif;
}
.pin-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    padding: 2px;
}
.pin-stack.above {
    transform: translateY(calc(var(--pin-window-height) - 100%));
}
.pin-extras {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    align-self: stretch;
    max-width: 100%;
    max-height: max(0px, calc(var(--pin-extra-height, 10000px) - 4px));
    overflow: auto;
}
.pin-extras:not(:has(> :not([hidden]))) {
    display: none;
}
.pin-stack.above,
.pin-stack.above .pin-extras {
    flex-direction: column-reverse;
}
.pin-surface {
    max-width: 100%;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 1px 2px #0002;
}
button:disabled {
    opacity: 0.4;
    cursor: default;
}
button:disabled:hover {
    background: transparent;
}
.copy-trigger::after {
    content: "";
    width: 4px;
    height: 4px;
    border-right: 1px solid currentColor;
    border-bottom: 1px solid currentColor;
    transform: translateY(-1px) rotate(45deg);
}
.pin-flyout.copy-open {
    width: max-content;
    min-width: min(174px, 100%);
    padding: 4px;
    gap: 1px;
}
.pin-flyout.copy-open button {
    width: 100%;
    justify-content: flex-start;
    gap: 10px;
    height: auto;
    min-height: 32px;
}
.pin-flyout .pin-divider {
    height: 1px;
    margin: 3px 6px;
    background: var(--line);
}
.pin-bar {
    transform: translateX(var(--pin-bar-shift, 0px));
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 4px;
    flex-wrap: wrap;
    width: max-content;
}
button {
    appearance: none;
    border: 0;
    background: transparent;
    border-radius: 4px;
    color: inherit;
    font: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 30px;
    min-width: 30px;
    padding: 0 7px;
    cursor: pointer;
}
button:hover {
    background: var(--hover);
}
button:active {
    opacity: 0.74;
}
button:focus-visible,
input:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
}
button[aria-expanded="true"],
.pin-bar button[aria-pressed="true"] {
    background: var(--hover);
    color: var(--accent);
    box-shadow: inset 0 -2px var(--accent);
}
button.close:hover {
    background: #c42b1c;
    color: white;
}
.glyph {
    width: 16px;
    height: 16px;
    background: currentColor;
    mask: var(--glyph) center / contain no-repeat;
    flex: none;
}
.metric {
    font-variant-numeric: tabular-nums;
    gap: 6px;
}
.divider {
    align-self: center;
    width: 1px;
    height: 18px;
    margin: 0 3px;
    background: var(--line);
}
.pin-flyout {
    display: grid;
    gap: 10px;
    min-width: min(232px, 100%);
    width: 240px;
    padding: 12px;
}
.pin-flyout.language-open {
    width: 310px;
    min-width: 0;
    padding: 12px;
}
.language-picker {
    display: grid;
    gap: 8px;
    min-width: 0;
    --language-list-height: clamp(
        54px,
        min(
            calc(var(--pin-max-height, 520px) - 195px),
            calc(var(--pin-extra-height, 520px) - 156px)
        ),
        224px
    );
}
.language-heading {
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
}
.language-current {
    font-size: 12px;
    font-weight: 400;
    color: var(--sub);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.language-search {
    box-sizing: border-box;
    appearance: none;
    width: 100%;
    min-width: 0;
    height: 32px;
    border: 1px solid var(--line);
    border-bottom-color: var(--sub);
    border-radius: 4px;
    padding: 0 9px;
    color: var(--ink);
    font: inherit;
    background: light-dark(#fff, #202020);
}
.language-search:focus-visible {
    outline: none;
    border-bottom: 2px solid var(--accent);
}
.language-list {
    overflow: auto;
    height: var(--language-list-height);
    scrollbar-width: thin;
    border-top: 1px solid var(--line);
    padding-top: 4px;
}
.language-option {
    width: 100%;
    height: auto;
    min-height: 35px;
    display: grid;
    grid-template-columns: 3px minmax(0, 1fr) auto;
    gap: 8px;
    text-align: start;
    padding: 4px 7px 4px 2px;
}
.language-option::before {
    content: "";
    width: 3px;
    height: 16px;
    border-radius: 2px;
}
.language-option[aria-selected="true"]::before {
    background: var(--accent);
}
.language-option.key-active,
.language-option[aria-selected="true"] {
    background: var(--hover);
}
.language-names {
    min-width: 0;
    display: flex;
    align-items: start;
    overflow-wrap: anywhere;
}
.language-native,
.language-code,
.language-empty {
    color: var(--sub);
    font-size: 11px;
}
.language-code {
    font-variant-numeric: tabular-nums;
}
.language-empty {
    padding: 12px 4px;
    font-size: 12px;
    min-height: var(--language-list-height);
}
@media (forced-colors: active) {
    .language-option.key-active,
    .language-option[aria-selected="true"] {
        outline: 1px solid Highlight;
    }
}
.pin-languages {
    display: flex;
    gap: 3px;
}
.pin-languages button {
    flex: 1 1 0;
    min-width: 0;
    padding-inline: 4px;
}
.pin-languages button span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.pin-languages button[aria-pressed="true"] {
    color: var(--accent);
    background: var(--hover);
    box-shadow: inset 0 -2px var(--accent);
}
.pin-value-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-weight: 600;
}
.pin-value-box {
    display: flex;
    align-items: center;
    gap: 2px;
    border: 1px solid var(--line);
    border-bottom: 2px solid var(--accent);
    border-radius: 4px;
    padding: 2px 6px;
    background: light-dark(white, #202020);
    font-weight: 400;
    color: var(--sub);
}
.pin-value-box input {
    width: 4ch;
    font: inherit;
    color: var(--ink);
    background: transparent;
    border: 0;
    text-align: right;
    appearance: textfield;
}
.pin-value-box input::-webkit-inner-spin-button,
.pin-value-box input::-webkit-outer-spin-button {
    appearance: none;
    margin: 0;
}
.pin-slider {
    appearance: none;
    width: 100%;
    height: 22px;
    margin: 0;
    background: transparent;
    accent-color: var(--accent);
    cursor: pointer;
}
.pin-slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(
        to right,
        var(--accent) var(--progress),
        var(--line) var(--progress)
    );
}
.pin-slider::-webkit-slider-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -6px;
    border-radius: 50%;
    background: var(--accent);
    border: 3px solid var(--surface);
    box-shadow:
        0 0 0 1px var(--line),
        0 1px 3px #0003;
}
.pin-status,
.pin-tip {
    max-width: 100%;
    overflow-wrap: anywhere;
}
.pin-status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 4px 4px 10px;
}
.pin-status span {
    max-height: 6em;
    overflow: auto;
}
.pin-tip {
    position: absolute;
    top: 0;
    width: max-content;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 4px 9px;
    background: light-dark(#fff, #383838);
    border: 1px solid var(--line);
    border-radius: 4px;
    box-shadow: 0 1px 2px #0002;
    line-height: 18px;
    font-size: 12px;
    pointer-events: none;
}
.pin-tip-slot {
    position: relative;
    align-self: stretch;
    flex: none;
    height: 28px;
    pointer-events: none;
}
[hidden] {
    display: none !important;
}
@media (forced-colors: active) {
    button:focus-visible {
        outline: 2px solid Highlight;
    }
    .pin-surface,
    .pin-tip {
        border-color: CanvasText;
    }
    .glyph {
        background: ButtonText;
        forced-color-adjust: none;
    }
}
`),
    )
    .addInto(document.head);

const stack = view().class("pin-stack").addInto();
const bar = view("x")
    .class("pin-surface", "pin-bar")
    .attr({ role: "toolbar" })
    .addInto(stack);
const extras = view().class("pin-extras").addInto(stack);
const statusText = txt();
const dismiss = button().on("click", () => send("dismiss"));
const flyout = view()
    .class("pin-surface", "pin-flyout")
    .attr({ id: "pin-adjustment", role: "group" })
    .addInto(extras);
const tipSlot = view().class("pin-tip-slot").addInto(extras);
const tip = view()
    .class("pin-tip")
    .attr({ role: "tooltip", id: "pin-hint" })
    .addInto(tipSlot);
const status = view()
    .class("pin-surface", "pin-status")
    .attr({ role: "status" })
    .add([statusText, dismiss])
    .addInto(extras);
for (const element of [status, bar, flyout, tipSlot, tip])
    element.el.hidden = true;
let state: PinPanelState | undefined;
let revision = 0,
    signature = "";
let editing: "opacity" | "zoom" | "language" | "copy" | undefined;
let trigger: HTMLButtonElement | undefined;
let tipTarget: HTMLElement | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
let valueInput: HTMLInputElement | undefined,
    slider: HTMLInputElement | undefined;

function glyph(url: string) {
    return view()
        .class("glyph")
        .attr({ ariaHidden: "true" })
        .style({ "--glyph": `url(${JSON.stringify(url)})` });
}
function label(el: HTMLElement, text: string) {
    el.setAttribute("aria-label", text);
    el.dataset.hint = text;
}
function send(
    type: Exclude<PinPanelAction["type"], "language" | "copy">,
    value = 0,
) {
    if (state) renderSend("pinPanelAction", [state.id, { type, value }]);
}
let lastMeasurement = "";
function reportSize() {
    if (!state || (document.hidden && bar.el.hidden && status.el.hidden))
        return;
    tipSlot.el.hidden = bar.el.hidden || !!editing;
    const r = stack.el.getBoundingClientRect();
    const b = bar.el.getBoundingClientRect(),
        padding = getComputedStyle(stack.el);
    const toolbar = bar.el.hidden
        ? undefined
        : {
              width:
                  b.width +
                  parseFloat(padding.paddingLeft) +
                  parseFloat(padding.paddingRight),
              height:
                  b.height +
                  parseFloat(padding.paddingTop) +
                  parseFloat(padding.paddingBottom),
          };
    const args = [
        state.id,
        revision,
        r.width,
        r.height,
        !!editing,
        toolbar,
    ] as const;
    const key = JSON.stringify(args);
    if (lastMeasurement === key) return;
    lastMeasurement = key;
    // 窗口向上扩展时，在同一帧应用新原点和内容偏移。
    const placement = renderSendSync("pinPanelSize", [...args]);
    if (placement) applyPlacement(placement);
}
const sizeObserver = new ResizeObserver(reportSize);
sizeObserver.observe(stack.el);
sizeObserver.observe(bar.el);
function hideTip() {
    clearTimeout(timer);
    tip.el.hidden = true;
    tipTarget?.removeAttribute("aria-describedby");
    tipTarget = undefined;
}
function queueTip(el: HTMLElement | null) {
    if (!el || editing) {
        hideTip();
        return;
    }
    if (el === tipTarget) return;
    hideTip();
    tipTarget = el;
    timer = setTimeout(() => {
        if (!el.isConnected) return;
        tip.el.textContent = el.dataset.hint || "";
        tip.el.hidden = false;
        el.setAttribute("aria-describedby", "pin-hint");
        const r = el.getBoundingClientRect(),
            s = tipSlot.el.getBoundingClientRect();
        tip.el.style.left = `${Math.max(0, Math.min(s.width - tip.el.offsetWidth, r.left - s.left + (r.width - tip.el.offsetWidth) / 2))}px`;
    }, 400);
}
bar.el.addEventListener("pointerover", (e) =>
    queueTip((e.target as Element).closest<HTMLElement>("[data-hint]")),
);
bar.el.addEventListener("pointerleave", hideTip);
bar.el.addEventListener("focusin", (e) => {
    const el = e.target as HTMLElement;
    if (el.matches(":focus-visible")) queueTip(el);
});
bar.el.addEventListener("focusout", hideTip);
window.addEventListener("blur", () => {
    hideTip();
    closeFlyout();
});
function closeFlyout(focus = false) {
    if (!editing) return;
    const old = trigger;
    editing = undefined;
    trigger = undefined;
    flyout.el.hidden = true;
    flyout.el.classList.remove("language-open", "copy-open");
    old?.setAttribute("aria-expanded", "false");
    if (focus) old?.focus();
    reportSize();
}
function syncValue(value: number) {
    if (!valueInput || !slider) return;
    if (document.activeElement !== valueInput) valueInput.value = String(value);
    const progress =
        editing === "zoom"
            ? (100 * Math.log(value / 5)) / Math.log(400)
            : value;
    slider.value = String(progress);
    slider.setAttribute("aria-valuetext", `${value}%`);
    slider.style.setProperty("--progress", `${progress}%`);
}
function toggleMetric(kind: "opacity" | "zoom", b: HTMLButtonElement) {
    const same = editing === kind;
    closeFlyout();
    hideTip();
    if (same || !state) return;
    editing = kind;
    trigger = b;
    b.setAttribute("aria-expanded", "true");
    flyout.clear();
    const name = kind === "zoom" ? state.zoomLabel : state.opacityLabel;
    flyout.el.setAttribute("aria-label", name);
    const min = kind === "zoom" ? 5 : 0,
        max = kind === "zoom" ? 2000 : 100;
    const field = input("number").attr({
        min: String(min),
        max: String(max),
        step: "1",
        ariaLabel: name,
    });
    const range = input("range").class("pin-slider").attr({
        min: "0",
        max: "100",
        step: "0.25",
        ariaLabel: name,
    });
    valueInput = field.el;
    slider = range.el;
    const change = (v: number) => {
        if (Number.isFinite(v) && v >= min && v <= max) {
            syncValue(v);
            send(kind, v);
        }
    };
    field.on("change", () => change(field.el.valueAsNumber));
    range.on("input", () => {
        const at = range.el.valueAsNumber;
        change(
            kind === "zoom"
                ? Math.round(5 * 400 ** (at / 100))
                : Math.round(at),
        );
    });
    field.on("blur", () => {
        if (!field.el.checkValidity() || !field.el.value)
            field.el.value = String(state?.[kind] ?? 100);
    });
    field.on("keydown", (e) => {
        if (e.key === "Enter" && field.el.checkValidity()) field.el.blur();
    });
    flyout.add([
        view("x")
            .class("pin-value-row")
            .add([
                txt(name, true),
                view("x")
                    .class("pin-value-box")
                    .add([field, txt("%", true)]),
            ]),
        range,
    ]);
    flyout.el.hidden = false;
    syncValue(state[kind]);
    reportSize();
    if (b.matches(":focus-visible")) range.el.focus();
}
function toggleLanguage(b: HTMLButtonElement) {
    const same = editing === "language";
    closeFlyout();
    hideTip();
    if (same || !state?.language) return;
    editing = "language";
    trigger = b;
    b.setAttribute("aria-expanded", "true");
    flyout.clear();
    flyout.el.classList.add("language-open");
    flyout.el.setAttribute("aria-label", state.language.label);
    const picker = languagePicker(state.language, (code) => {
        if (!state) return;
        const id = state.id;
        closeFlyout(true);
        renderSend("pinPanelAction", [id, { type: "language", value: code }]);
    });
    flyout.add(picker.el);
    flyout.el.hidden = false;
    reportSize();
    picker.focus();
}
function toggleCopy(
    b: HTMLButtonElement,
    item: PinPanelState["buttons"][number],
) {
    const same = editing === "copy";
    closeFlyout();
    hideTip();
    const choices = state?.buttons.find((x) => x.index === item.index)?.copies;
    if (same || !choices) return;
    editing = "copy";
    trigger = b;
    b.setAttribute("aria-expanded", "true");
    flyout.clear();
    flyout.el.classList.add("copy-open");
    flyout.el.setAttribute("aria-label", item.label);
    const icons = {
        source: textIcon,
        translation: languageIcon,
        originalImage: pictureIcon,
        image: imageTextIcon,
        comparison: compareIcon,
    };
    for (const choice of choices) {
        if (choice.value === "originalImage")
            flyout.add(view().class("pin-divider").attr({ role: "separator" }));
        const option = button()
            .attr({ disabled: choice.disabled })
            .data({ copy: choice.value })
            .add([glyph(icons[choice.value]), txt(choice.label, true)])
            .on("click", () => {
                if (!state) return;
                const id = state.id;
                closeFlyout(option.el.matches(":focus-visible"));
                renderSend("pinPanelAction", [
                    id,
                    { type: "copy", value: choice.value },
                ]);
            });
        flyout.add(option);
    }
    flyout.el.hidden = false;
    reportSize();
    if (b.matches(":focus-visible"))
        flyout.el.querySelector<HTMLButtonElement>("button:enabled")?.focus();
}
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.isComposing) return;
    e.preventDefault();
    hideTip();
    if (editing) closeFlyout(true);
    else send("close");
});
function applyPlacement({
    above,
    extraHeight,
    barShift,
    height,
}: PinPanelPlacement) {
    stack.el.classList.toggle("above", above);
    stack.el.style.setProperty("--pin-extra-height", `${extraHeight}px`);
    stack.el.style.setProperty("--pin-bar-shift", `${barShift}px`);
    stack.el.style.setProperty("--pin-window-height", `${height}px`);
}
renderOn("pinPanelPlacement", ([placement]) => applyPlacement(placement));
renderOn("pinPanelRender", ([next, tools, maxWidth, rev, maxHeight]) => {
    const key = JSON.stringify([
        next.id,
        next.buttons.map(({ disabled, copies, ...item }) => [
            item,
            copies?.map(({ value, label }) => [value, label]),
        ]),
        next.zoomLabel,
        next.opacityLabel,
        next.language?.label,
    ]);
    const sameOwner = state?.id === next.id;
    state = next;
    revision = rev;
    if (maxHeight)
        document.body.style.setProperty("--pin-max-height", `${maxHeight}px`);
    document.body.style.maxWidth = `${maxWidth}px`;
    status.el.hidden = !next.status;
    statusText.sv(next.status);
    label(dismiss.el, next.closeLabel);
    if (!dismiss.el.firstChild) dismiss.add(glyph(closeIcon));
    bar.el.hidden = !tools;
    if (!tools || !sameOwner || (key !== signature && editing !== "language")) {
        closeFlyout();
        hideTip();
    }
    if (key !== signature) {
        signature = key;
        bar.clear();
        for (const [kind, icon, name] of [
            ["opacity", opacityIcon, next.opacityLabel],
            ["zoom", sizeIcon, next.zoomLabel],
        ] as const) {
            const val = txt("", true);
            val.el.dataset.metric = kind;
            const b = button()
                .class("metric")
                .attr({ ariaExpanded: "false" })
                .add([glyph(icon), val]);
            b.el.setAttribute("aria-controls", "pin-adjustment");
            label(b.el, name);
            b.on("click", () => toggleMetric(kind, b.el));
            bar.add(b);
        }
        bar.add(view().class("divider").attr({ role: "separator" }));
        if (next.language) {
            const b = button()
                .attr({ ariaExpanded: "false" })
                .add(glyph(languageIcon));
            if (editing === "language") {
                trigger = b.el;
                b.el.setAttribute("aria-expanded", "true");
            }
            b.el.dataset.language = "";
            b.el.setAttribute("aria-controls", "pin-adjustment");
            label(b.el, next.language.label);
            b.on("click", () => toggleLanguage(b.el));
            bar.add(b);
        }
        for (const item of next.buttons) {
            const b = button()
                .data({ command: String(item.index) })
                .add(glyph(item.icon));
            if (item.pressed !== undefined)
                b.el.setAttribute("aria-pressed", String(item.pressed));
            label(b.el, item.label);
            if (item.label === next.closeLabel) {
                b.class("close");
                bar.add(view().class("divider").attr({ role: "separator" }));
            }
            if (item.copies) {
                bar.add(view().class("divider").attr({ role: "separator" }));
                b.class("copy-trigger");
                b.el.setAttribute("aria-controls", "pin-adjustment");
                b.el.setAttribute("aria-expanded", String(editing === "copy"));
                b.on("click", () => toggleCopy(b.el, item));
                bar.add(b);
                continue;
            }
            b.on("click", () => {
                hideTip();
                closeFlyout();
                send("button", item.index);
            });
            bar.add(b);
        }
    }
    for (const item of next.buttons) {
        const b = bar.el.querySelector<HTMLButtonElement>(
            `[data-command="${item.index}"]`,
        );
        if (b) b.disabled = !!item.disabled;
        if (editing === "copy" && item.copies) {
            for (const choice of item.copies) {
                const option = flyout.el.querySelector<HTMLButtonElement>(
                    `[data-copy="${choice.value}"]`,
                );
                if (option) option.disabled = choice.disabled;
            }
        }
    }
    for (const item of bar.el.querySelectorAll<HTMLElement>("[data-metric]"))
        item.textContent = `${next[item.dataset.metric as "zoom" | "opacity"]}%`;
    if (next.language) {
        const b = bar.el.querySelector<HTMLElement>("[data-language]");
        if (b) {
            const lang = next.language;
            const selected = languageName(lang, lang.value);
            const detail =
                lang.value === "auto"
                    ? `${selected} (${languageName(lang, lang.defaultTarget)})`
                    : selected;
            b.dataset.hint = `${lang.label} · ${detail}`;
        }
    }
    if (editing === "opacity" || editing === "zoom") syncValue(next[editing]);
    reportSize();
});
