import { button, type ElType, input, txt, view } from "dkh-ui";
import type { PinPanelState } from "../../ShareTypes";

type LanguageState = NonNullable<PinPanelState["language"]>;
type LanguageRow = {
    code: string;
    name: string;
    native: string;
    search: string;
};
let cached: { key: string; rows: LanguageRow[] } | undefined;

function normalize(value: string) {
    return value
        .normalize("NFKD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[_-]/g, " ")
        .trim();
}

function languages(state: LanguageState) {
    const key = JSON.stringify([state.locale, state.codes]);
    if (cached?.key === key) return cached.rows;
    const names = (locale: string) =>
        new Intl.DisplayNames(locale, { type: "language", fallback: "none" });
    const local = names(state.locale),
        english = names("en"),
        chinese = names("zh-Hans");
    const collator = new Intl.Collator(state.locale);
    const rows = state.codes
        .map((code) => {
            try {
                const canonical = new Intl.Locale(code).toString();
                const en = english.of(canonical) ?? "";
                const native = Intl.DisplayNames.supportedLocalesOf([canonical])
                    .length
                    ? (names(canonical).of(canonical) ?? "")
                    : "";
                const name = local.of(canonical) || en || native || code;
                return {
                    code,
                    name,
                    native,
                    search: normalize(
                        [
                            code,
                            canonical,
                            name,
                            native,
                            en,
                            chinese.of(canonical),
                        ].join(" "),
                    ),
                };
            } catch {
                return {
                    code,
                    name: code,
                    native: "",
                    search: normalize(code),
                };
            }
        })
        .sort(
            (a, b) =>
                collator.compare(a.name, b.name) ||
                collator.compare(a.code, b.code),
        );
    cached = { key, rows };
    return rows;
}

export function languageName(state: LanguageState, code: string) {
    const quick = state.quick.find((choice) => choice.value === code);
    if (quick) return quick.label;
    try {
        return (
            new Intl.DisplayNames(state.locale, { type: "language" }).of(
                code,
            ) ?? code
        );
    } catch {
        return code;
    }
}

export function languagePicker(
    state: LanguageState,
    choose: (code: string) => void,
): { el: ElType<HTMLDivElement>; focus: () => void } {
    const options = languages(state);
    const header = view("x")
        .class("language-heading")
        .add([
            txt(state.label, true),
            txt(
                languageName(
                    state,
                    state.value === "auto" ? state.defaultTarget : state.value,
                ),
                true,
            ).class("language-current"),
        ]);
    const search = input("search").class("language-search").attr({
        placeholder: state.searchLabel,
        ariaLabel: state.searchLabel,
        autocomplete: "off",
        spellcheck: false,
        role: "combobox",
        ariaExpanded: "true",
    });
    search.el.setAttribute("aria-controls", "language-results");
    search.el.setAttribute("aria-autocomplete", "list");
    const quick = view("x")
        .class("pin-languages")
        .attr({ role: "group", ariaLabel: state.label });
    for (const choice of state.quick) {
        const b = button(txt(choice.label, true))
            .attr({ ariaPressed: String(state.value === choice.value) })
            .on("click", () => choose(choice.value));
        quick.add(b);
    }
    const list = view().class("language-list").attr({
        role: "listbox",
        id: "language-results",
        ariaLabel: state.label,
    });
    const empty = txt(state.emptyLabel, true)
        .class("language-empty")
        .attr({ role: "status" });
    let filtered: LanguageRow[] = [];
    let active = -1;
    function highlight(index: number, scroll: boolean) {
        list.el.children[active]?.classList.remove("key-active");
        active = index;
        const row = list.el.children[active];
        if (!row) {
            search.el.removeAttribute("aria-activedescendant");
            return;
        }
        row.classList.add("key-active");
        search.el.setAttribute("aria-activedescendant", row.id);
        if (scroll) row.scrollIntoView({ block: "nearest" });
    }
    function draw() {
        const q = normalize(search.el.value);
        const terms = q.split(/\s+/);
        const exact = q && options.find((row) => normalize(row.code) === q);
        if (exact) {
            filtered = [
                exact,
                ...options.filter((row) =>
                    normalize(row.code).startsWith(`${q} `),
                ),
            ];
        } else {
            filtered = q
                ? options.filter((row) =>
                      terms.every((term) => row.search.includes(term)),
                  )
                : options;
        }
        const children = document.createDocumentFragment();
        for (const [index, row] of filtered.entries()) {
            const text = view("y")
                .class("language-names")
                .add(txt(row.name, true));
            if (row.native && row.native !== row.name)
                text.add(txt(row.native, true).class("language-native"));
            const item = button()
                .class("language-option")
                .attr({
                    id: `language-option-${index}`,
                    role: "option",
                    ariaSelected: String(row.code === state.value),
                    tabIndex: -1,
                })
                .add([text, txt(row.code, true).class("language-code")])
                .on("click", () => choose(row.code));
            children.append(item.el);
        }
        list.el.replaceChildren(children);
        list.el.scrollTop = 0;
        active = -1;
        highlight(q && filtered.length ? 0 : -1, false);
        empty.el.hidden = filtered.length > 0;
        list.el.hidden = !filtered.length;
    }
    search.on("input", draw).on("keydown", (e) => {
        if (e.isComposing || !filtered.length) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            const index =
                active < 0
                    ? e.key === "ArrowDown"
                        ? 0
                        : filtered.length - 1
                    : (active +
                          (e.key === "ArrowDown" ? 1 : -1) +
                          filtered.length) %
                      filtered.length;
            highlight(index, true);
        } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            choose(filtered[active].code);
        }
    });
    draw();
    return {
        el: view()
            .class("language-picker")
            .add([header, search, quick, list, empty]),
        focus: () => search.el.focus({ preventScroll: true }),
    };
}
