const { existsSync, writeFileSync } =
    require("node:fs") as typeof import("node:fs");
const { join } = require("node:path") as typeof import("node:path");

import { renderOn, renderSend, renderSendSync } from "../../../lib/ipc";
import store from "../../../lib/store/renderStore";
import { writeImage } from "../lib/clipboard";
import { type ImageFormat, imageFormatMime } from "../lib/imageExport";
import { alert } from "../lib/messageDialog";

type Runtime = typeof import("onnxruntime-node");
let loaded:
    | Promise<{
          ort: Runtime;
          session: Awaited<ReturnType<Runtime["InferenceSession"]["create"]>>;
      }>
    | undefined;
export async function inpaintModel() {
    const path = join(
        renderSendSync("userDataPath", []),
        "models",
        "inpaint",
        "migan_pipeline_v2.onnx",
    );
    if (!existsSync(path)) {
        await alert("未下载魔法橡皮模型，请在设置的“人工智能”页面下载");
        return;
    }
    loaded ??= (async () => {
        const ort = (await import("../lib/ort")).default;
        const session = await ort.InferenceSession.create(path, {
            executionProviders: [{ name: store.get("AI.运行后端") || "cpu" }],
        });
        return { ort, session };
    })().catch((e) => {
        loaded = undefined;
        throw e;
    });
    return loaded;
}
export async function savePhoto(
    format: ImageFormat,
    encode: () => Promise<Uint8Array>,
) {
    const path = renderSendSync("save_file_path", [format]);
    if (!path) return;
    writeFileSync(path, await encode());
    renderSend("ok_save", [path]);
    renderSend("windowClose", []);
}
export async function copyPhoto(format: ImageFormat, data: Uint8Array) {
    await writeImage(
        new Blob([Uint8Array.from(data)], { type: imageFormatMime[format] }),
    );
    renderSend("windowClose", []);
}
export function receivePhoto(accept: (url: string) => void) {
    renderOn("superPhotoEditorInit", ([url]) => accept(url));
}
