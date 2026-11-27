import { button, input, view } from "dkh-ui";
import { t } from "../../../lib/translate/translate";
import { Class } from "../root/root";

type PropertyPanels = {
    elementBar: ReturnType<typeof view>;
    elementBarHeader: ReturnType<typeof view>;
    elementBarBody: ReturnType<typeof view>;
    colorPopover: ReturnType<typeof view>;
    colorGrid: ReturnType<typeof view>;
    colorTabGrid: ReturnType<typeof button>;
    colorTabPicker: ReturnType<typeof button>;
    fontPanel: ReturnType<typeof view>;
    fontScroll: ReturnType<typeof view>;
    fontSearch: ReturnType<typeof input>;
    fontSpacer: ReturnType<typeof view>;
};

export function createPropertyPanels(
    setColorTab: (tab: "grid" | "picker") => void,
    renderFonts: (reset?: boolean) => void,
    scheduleElementBarPosition: () => void,
): PropertyPanels {
    const elementBar = view()
        .attr({ id: "element_bar" })
        .class(Class.glassBar)
        .addInto();
    const elementBarHeader = view()
        .attr({ id: "element_bar_header" })
        .addInto(elementBar);
    const elementBarBody = view()
        .attr({ id: "element_bar_body" })
        .addInto(elementBar);

    const colorPopover = view("y").class(Class.gap, Class.glassBar).style({
        position: "fixed",
        inset: "auto",
        display: "none",
        margin: 0,
        padding: "0px",
        width: "224px",
        maxHeight: "calc(100vh - 8px)",
        overflowX: "hidden",
        overflowY: "auto",
        color: "var(--font-color)",
        borderRadius: "var(--border-radius)",
        boxShadow: "var(--shadow)",
        visibility: "hidden",
        zIndex: "120",
    });
    const colorTabs = view("x");
    const colorGrid = view().style({
        display: "grid",
        width: "100%",
        gridTemplateColumns: "repeat(5, 1fr)",
    });
    const colorTabGrid = button(t("色盘"))
        .class("color_tab")
        .style({ padding: "1px 6px", fontSize: "11px" })
        .on("click", () => setColorTab("grid"));
    const colorTabPicker = button(t("取色器"))
        .class("color_tab")
        .style({ padding: "1px 6px", fontSize: "11px" })
        .on("click", () => setColorTab("picker"));
    colorTabs.add([colorTabGrid, colorTabPicker]);
    colorPopover.add([colorTabs, colorGrid]).addInto();

    const fontPanel = view("y")
        .attr({ id: "font_panel" })
        .class(Class.gap, Class.glassBar)
        .style({
            position: "fixed",
            inset: "auto",
            display: "none",
            margin: 0,
            padding: "4px",
            width: "240px",
            maxHeight: "calc(100vh - 8px)",
            overflow: "hidden",
            color: "var(--font-color)",
            borderRadius: "var(--border-radius)",
            boxShadow: "var(--shadow)",
            visibility: "hidden",
            zIndex: "120",
        })
        .addInto();
    const fontSearch = input()
        .attr({ placeholder: t("搜索字体") })
        .style({ width: "100%", height: "24px", fontSize: "12px" })
        .on("input", () => renderFonts(true));
    const fontScroll = view().style({
        position: "relative",
        height: "260px",
        maxHeight: "calc(100vh - 60px)",
        overflowY: "auto",
    });
    const fontSpacer = view().style({ position: "relative" });
    fontScroll.add(fontSpacer);
    fontPanel.add([fontSearch, fontScroll]);
    let fontRenderFrame = 0;
    fontScroll.on("scroll", () => {
        if (fontRenderFrame) return;
        fontRenderFrame = requestAnimationFrame(() => {
            fontRenderFrame = 0;
            renderFonts();
        });
    });

    colorPopover.on("contextmenu", (event) => event.preventDefault());
    new ResizeObserver(scheduleElementBarPosition).observe(elementBar.el);
    return {
        elementBar,
        elementBarHeader,
        elementBarBody,
        colorPopover,
        colorGrid,
        colorTabGrid,
        colorTabPicker,
        fontPanel,
        fontScroll,
        fontSearch,
        fontSpacer,
    };
}
