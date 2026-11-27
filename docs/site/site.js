"use strict";

const root = document.documentElement;
const picker = document.getElementById("language-picker");
const trigger = document.getElementById("lang-trigger");
const languageOptions = [...picker.querySelectorAll("[data-lang]")];
const slider = document.getElementById("compare");
const art = document.getElementById("art");
const systems = { win32: "Windows", darwin: "macOS", linux: "Linux" };
const host = navigator.userAgentData?.platform || navigator.platform || "";
let system = /mac/i.test(host)
  ? "darwin"
  : /linux/i.test(host)
    ? "linux"
    : "win32";
let language;

function supported(tag) {
  const normalized = (tag || "").toLowerCase().replaceAll("_", "-");
  if (normalized.startsWith("zh"))
    return /hant|tw|hk|mo/.test(normalized) ? "zh-TW" : "zh-CN";
  const base = normalized.split("-")[0];
  return Object.hasOwn(messages, base) ? base : null;
}
function readChoice() {
  const explicit = supported(new URL(location.href).searchParams.get("lang"));
  if (explicit) return explicit;
  try {
    const saved = supported(localStorage.getItem("wsearch-language"));
    if (saved) return saved;
  } catch {}
  return (
    [...navigator.languages, navigator.language].map(supported).find(Boolean) ||
    "en"
  );
}
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}
function renderPackages(moveFocus = false) {
  const t = messages[language];
  const container = document.getElementById("packages");
  const controls = element("div", "platforms");
  controls.setAttribute("role", "group");
  controls.setAttribute("aria-label", t.platform);
  for (const [key, name] of Object.entries(systems)) {
    const button = element("button", "os-control");
    const symbol = element("span", "os-icon " + key);
    symbol.setAttribute("aria-hidden", "true");
    button.append(symbol, document.createTextNode(name));
    button.type = "button";
    button.dataset.system = key;
    button.setAttribute("aria-pressed", String(system === key));
    button.addEventListener("click", () => {
      system = key;
      renderPackages(true);
    });
    controls.append(button);
  }
  const rows = [];
  for (const arch of ["x64", "arm64"]) {
    const label =
      system === "darwin"
        ? arch === "x64"
          ? "Intel"
          : "Apple Silicon"
        : arch === "arm64"
          ? "ARM64"
          : "x64";
    for (const [suffix, edition] of [
      ["", t.standardEdition],
      ["-offline", t.offlineEdition],
    ]) {
      const editionLabel = `${label} · ${edition}`;
      const prefix = `wSearch-${release.version}-${system}-${arch}${suffix}.`;
      const matches = release.files.filter((file) => file.startsWith(prefix));
      if (!matches.length) continue;
      const row = element("div", "file-row");
      row.append(element("span", "arch", editionLabel));
      const links = element("div", "file-links");
      for (const file of matches) {
        const format = file.slice(prefix.length);
        const link = element(
          "a",
          "",
          format === "tar.gz" || format === "AppImage"
            ? format
            : format.toUpperCase(),
        );
        link.href = `https://github.com/Whwitpohe/wSearch/releases/download/${release.version}/${encodeURIComponent(file)}`;
        link.setAttribute(
          "aria-label",
          `${t.get} · ${systems[system]} · ${editionLabel} · ${format}`,
        );
        links.append(link);
      }
      row.append(links);
      rows.push(row);
    }
  }
  if (rows.length) {
    const note = element("p", "install-note", t[system + "Install"]);
    const sums = element("a", "checksum", t.checksums);
    sums.href = `https://github.com/Whwitpohe/wSearch/releases/download/${release.version}/SHA256SUMS.txt`;
    rows.push(note, sums);
  }
  container.replaceChildren(
    controls,
    ...(rows.length ? rows : [element("p", "", t.pending)]),
  );
  if (moveFocus)
    controls
      .querySelector(`[data-system="${system}"]`)
      .focus({ preventScroll: true });
}
function setComparison() {
  const percent = Number(slider.value);
  art.style.setProperty("--split", percent + "%");
  slider.setAttribute(
    "aria-valuetext",
    messages[language].translatedFraction + " " + percent + "%",
  );
  document.querySelectorAll("[data-pos]").forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(Number(button.dataset.pos) === percent),
    );
  });
}
function localize(next) {
  language = next;
  const t = messages[next];
  for (const option of languageOptions) {
    const chosen = option.dataset.lang === next;
    option.setAttribute("aria-pressed", String(chosen));
    if (chosen) {
      document.getElementById("current-language").textContent =
        option.textContent;
      trigger.setAttribute(
        "aria-label",
        t.language + " · " + option.textContent,
      );
    }
  }
  root.lang = next;
  root.dir = next === "ar" ? "rtl" : "ltr";
  document.title = "wSearch · " + t.hero1 + " " + t.hero2;
  document.querySelector('meta[name="description"]').content = t.lead;
  for (const [attribute, target] of [
    ["data-t", "textContent"],
    ["data-aria", "aria-label"],
    ["data-alt", "alt"],
  ]) {
    for (const el of document.querySelectorAll("[" + attribute + "]")) {
      const value = t[el.getAttribute(attribute)];
      if (target === "textContent") el.textContent = value;
      else el.setAttribute(target, value);
    }
  }
  const original = messages[next === "en" ? "zh-CN" : "en"];
  const source = document.querySelector(".sheet:not(.target) .poster");
  for (const [sel, key] of [
    [".topic", "atlas"],
    ["strong", "moon"],
    ["strong + span", "satellite"],
  ]) {
    source.querySelector(sel).textContent = original[key];
  }
  source.querySelector(".datum").firstChild.textContent = original.distance;
  source.lang = next === "en" ? "zh-CN" : "en";
  document.querySelector(".target .poster").dir = root.dir;
  renderPackages();
  setComparison();
}
function closePicker(restoreFocus = false) {
  picker.open = false;
  if (restoreFocus) trigger.focus({ preventScroll: true });
}
for (const option of languageOptions) {
  option.addEventListener("click", () => {
    const tag = option.dataset.lang;
    try {
      localStorage.setItem("wsearch-language", tag);
    } catch {}
    const url = new URL(location.href);
    url.searchParams.set("lang", tag);
    history.replaceState(null, "", url);
    localize(tag);
    closePicker(true);
  });
}
picker.addEventListener("toggle", () => {
  if (picker.open)
    picker
      .querySelector('[aria-pressed="true"]')
      .focus({ preventScroll: true });
});
picker.addEventListener("keydown", (event) => {
  if (!picker.open) return;
  const i = languageOptions.indexOf(document.activeElement);
  if (event.key === "Escape") {
    event.preventDefault();
    closePicker(true);
    return;
  }
  const step = {
    ArrowUp: -2,
    ArrowDown: 2,
    ArrowLeft: root.dir === "rtl" ? 1 : -1,
    ArrowRight: root.dir === "rtl" ? -1 : 1,
  }[event.key];
  let next;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = languageOptions.length - 1;
  else if (step !== undefined)
    next =
      (Math.max(0, i) + step + languageOptions.length) % languageOptions.length;
  if (next !== undefined) {
    event.preventDefault();
    languageOptions[next].focus();
  }
});
document.addEventListener("pointerdown", (e) => {
  if (picker.open && !picker.contains(e.target)) closePicker();
});
picker.addEventListener("focusout", (e) => {
  if (picker.open && e.relatedTarget && !picker.contains(e.relatedTarget))
    closePicker();
});
picker.hidden = false;
slider.addEventListener("input", setComparison);
document.querySelectorAll("[data-pos]").forEach((button) =>
  button.addEventListener("click", () => {
    slider.value = button.dataset.pos;
    setComparison();
  }),
);
localize(readChoice());
