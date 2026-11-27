import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { app, net } from "electron";
import type { Entry } from "yauzl";
import { open } from "yauzl";
import models from "../../lib/defaultOcrModels.json";

async function matches(file: string, digest: string) {
    try {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(file)) hash.update(chunk);
        return hash.digest("hex") === digest;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
        throw error;
    }
}

async function download(
    asset: string,
    dest: string,
    digest: string,
    mirror: (path: string) => string,
) {
    const path = `xushengfeng/eSearch-OCR/releases/download/${asset}`;
    let lastError: unknown;
    for (const url of new Set([mirror(path), `https://github.com/${path}`])) {
        try {
            const response = await net.fetch(url, {
                signal: AbortSignal.timeout(90_000),
            });
            if (!response.ok || !response.body)
                throw new Error(`HTTP ${response.status}`);
            await pipeline(response.body, createWriteStream(dest));
            if (!(await matches(dest, digest)))
                throw new Error(`SHA-256: ${asset}`);
            return;
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError;
}

function unpack(archive: string, stage: string) {
    return new Promise<void>((resolve, reject) => {
        open(archive, { lazyEntries: true }, (error, zip) => {
            if (error) return reject(error);
            zip.once("error", reject);
            zip.once("end", resolve);
            zip.on("entry", (entry: Entry) => {
                if (
                    !Object.hasOwn(models.files, entry.fileName) ||
                    entry.fileName === "doc_cls.onnx"
                ) {
                    zip.readEntry();
                    return;
                }
                zip.openReadStream(entry, (error, input) => {
                    if (error) {
                        zip.close();
                        reject(error);
                        return;
                    }
                    pipeline(
                        input,
                        createWriteStream(join(stage, entry.fileName), {
                            flags: "wx",
                        }),
                    ).then(
                        () => zip.readEntry(),
                        (error) => {
                            zip.close();
                            reject(error);
                        },
                    );
                });
            });
            zip.readEntry();
        });
    });
}

let installing: Promise<string> | undefined;
let verified = "";

export async function defaultOcrDirectory(
    mirror: (path: string) => string,
    onDownload: () => void,
) {
    const dir = join(app.getPath("userData"), "models", models.version);
    if (verified === dir) {
        if (
            Object.keys(models.files).every((name) =>
                existsSync(join(dir, name)),
            )
        )
            return dir;
        verified = "";
    }
    installing ??= install(dir, mirror, onDownload)
        .then(() => (verified = dir))
        .finally(() => {
            installing = undefined;
        });
    return installing;
}

async function install(
    dir: string,
    mirror: (path: string) => string,
    onDownload: () => void,
) {
    await mkdir(dir, { recursive: true });
    const missing = [];
    for (const [name, digest] of Object.entries(models.files)) {
        if (!(await matches(join(dir, name), digest))) missing.push(name);
    }
    if (!missing.length) return;
    onDownload();
    const stage = await mkdtemp(join(dir, ".install-"));
    try {
        if (missing.some((name) => name !== "doc_cls.onnx")) {
            const archive = join(stage, "model.zip");
            await download(
                models.archive.asset,
                archive,
                models.archive.sha256,
                mirror,
            );
            await unpack(archive, stage);
        }
        if (missing.includes("doc_cls.onnx")) {
            await download(
                models.directionAsset,
                join(stage, "doc_cls.onnx"),
                models.files["doc_cls.onnx"],
                mirror,
            );
        }
        for (const name of missing) {
            if (
                !(await matches(
                    join(stage, name),
                    models.files[name as keyof typeof models.files],
                ))
            )
                throw new Error(`SHA-256: ${name}`);
        }
        for (const name of missing)
            await rename(join(stage, name), join(dir, name));
    } finally {
        await rm(stage, { force: true, recursive: true });
    }
}
