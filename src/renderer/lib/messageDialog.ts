import { button, ele, noI18n, view } from "dkh-ui";
import { t } from "../../../lib/translate/translate";

function messageDialog(message: string, canCancel: boolean) {
    const result = Promise.withResolvers<boolean>();
    const title = t("提示"),
        dialog = ele("dialog")
            .class("app-dialog", "notice-dialog")
            .attr({ role: "alertdialog", ariaLabel: title })
            .addInto();
    const description = ele("p")
        .attr({ id: `message-${crypto.randomUUID()}` })
        .add(noI18n(t(message)));
    dialog.el.setAttribute("aria-describedby", description.el.id);
    const actions = view("x").class("dialog-actions");
    if (canCancel)
        actions.add(button("取消").on("click", () => dialog.el.close()));
    actions.add(
        button("确定")
            .class("dialog-primary")
            .on("click", () => dialog.el.close("ok")),
    );
    dialog.add([
        view("x")
            .class("dialog-heading")
            .add(ele("h2").add(noI18n(title))),
        view("y").class("dialog-body").add(description),
        actions,
    ]);
    dialog.on("close", () => {
        result.resolve(dialog.el.returnValue === "ok");
        dialog.remove();
    });
    dialog.el.showModal();
    return result.promise;
}
export const alert = (message: string) => messageDialog(message, false);
export const confirm = (message: string) => messageDialog(message, true);
