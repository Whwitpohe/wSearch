import { renderOn, renderSend } from "../../../lib/ipc";
import type { PinPanelAction } from "../../ShareTypes";
import opacityIcon from "../assets/icons/opacity.svg";
import sizeIcon from "../assets/icons/size.svg";

const status = document.querySelector<HTMLDivElement>("#status")!;
const actions = document.querySelector<HTMLDivElement>(".actions")!;
let id = 0,
    signature = "";
function send(type: PinPanelAction["type"], value = 0) {
    renderSend("pinPanelAction", [id, { type, value }]);
}
status.querySelector("button")!.onclick = () => send("dismiss");
renderOn("pinPanelRender", ([state, tools]) => {
    id = state.id;
    status.hidden = !state.status;
    status.querySelector("span")!.textContent = state.status;
    status.querySelector("button")!.title = state.closeLabel;
    actions.hidden = !tools;
    const key = JSON.stringify(state.buttons);
    if (key !== signature) {
        signature = key;
        actions.replaceChildren();
        for (const type of ["opacity", "zoom"] as const) {
            const el = document.createElement("input");
            el.type = "number";
            el.dataset.type = type;
            el.min = type === "zoom" ? "5" : "0";
            el.max = type === "zoom" ? "2000" : "100";
            el.step = "5";
            el.title =
                (type === "zoom" ? state.zoomLabel : state.opacityLabel) +
                " (%)";
            el.setAttribute("aria-label", el.title);
            el.onchange = () => {
                if (el.checkValidity()) send(type, el.valueAsNumber);
            };
            const field = document.createElement("label");
            field.title = el.title;
            const mark = document.createElement("img");
            mark.alt = "";
            mark.src = type === "zoom" ? sizeIcon : opacityIcon;
            const unit = document.createElement("span");
            unit.textContent = "%";
            field.append(mark, el, unit);
            actions.append(field);
        }
        for (const option of state.buttons) {
            const b = document.createElement("button");
            b.title = option.label;
            b.setAttribute("aria-label", option.label);
            const img = document.createElement("img");
            img.alt = "";
            img.src = option.icon;
            b.append(img);
            b.onclick = () => send("button", option.index);
            actions.append(b);
        }
    }
    for (const el of actions.querySelectorAll("input"))
        if (document.activeElement !== el)
            el.value = String(
                el.dataset.type === "zoom" ? state.zoom : state.opacity,
            );
});
