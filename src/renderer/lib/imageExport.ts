import { muxAvifStill } from "../videoEditor/avifMuxer";

export const imageFormatMime = {
    png: "image/png",
    jpg: "image/jpeg",
    webp: "image/webp",
    bmp: "image/bmp",
    avif: "image/avif",
} as const;

export type ImageFormat = keyof typeof imageFormatMime;

const avifCodec = "av01.1.04M.08";

const supportCache = new Map<ImageFormat, boolean>();

/** 剪贴板只稳定支持常见类型，其他格式复制时改用 png */
export function clipboardImageFormat(format: ImageFormat): ImageFormat {
    return format === "png" || format === "jpg" || format === "webp"
        ? format
        : "png";
}

/** avif 依赖 WebCodecs 的 av1 编码器，其他格式由 canvas 或 bmp-js 提供 */
export async function isImageFormatSupported(format: ImageFormat) {
    if (format !== "avif") return true;
    const cached = supportCache.get(format);
    if (cached !== undefined) return cached;
    let supported = false;
    if (typeof VideoEncoder !== "undefined") {
        try {
            const config = await VideoEncoder.isConfigSupported({
                codec: avifCodec,
                width: 64,
                height: 64,
                bitrate: 1e6,
            });
            supported = config.supported === true;
        } catch {}
    }
    supportCache.set(format, supported);
    return supported;
}

/**
 * 编码画布。
 * avif 借用视频的 av1 编码器，quality 换算成码率，不支持 alpha。
 */
export async function encodeCanvasImage(
    canvas: HTMLCanvasElement,
    format: ImageFormat,
    quality = 1,
): Promise<Uint8Array> {
    if (format === "bmp") return encodeBmp(canvas);
    if (format === "avif") return encodeAvif(canvas, quality);
    const blob = await canvasToBlob(canvas, imageFormatMime[format], quality);
    return new Uint8Array(await blob.arrayBuffer());
}

export async function encodeImageSource(
    source: Blob | string,
    format: ImageFormat,
    quality = 1,
): Promise<Uint8Array> {
    const canvas = await decodeImageToCanvas(source);
    return encodeCanvasImage(canvas, format, quality);
}

async function decodeImageToCanvas(source: Blob | string) {
    const blob =
        typeof source === "string"
            ? await (await fetch(source)).blob()
            : source;
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
}

function canvasToBlob(
    canvas: HTMLCanvasElement,
    type: string,
    quality: number,
) {
    const { promise, resolve, reject } = Promise.withResolvers<Blob>();
    canvas.toBlob(
        (blob) =>
            blob ? resolve(blob) : reject(new Error(`无法编码 ${type}`)),
        type,
        quality,
    );
    return promise;
}

function encodeBmp(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", {
        willReadFrequently: true,
    }) as CanvasRenderingContext2D;
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = image.data;
    const stride = (image.width * 3 + 3) & ~3;
    const bytes = new Uint8Array(54 + stride * image.height);
    const head = new DataView(bytes.buffer);
    bytes.set([0x42, 0x4d]);
    head.setUint32(2, bytes.length, true);
    head.setUint32(10, 54, true);
    head.setUint32(14, 40, true);
    head.setUint32(18, image.width, true);
    head.setInt32(22, -image.height, true);
    head.setUint16(26, 1, true);
    head.setUint16(28, 24, true);
    head.setUint32(34, stride * image.height, true);
    for (let y = 0; y < image.height; y++)
        for (let x = 0; x < image.width; x++) {
            const src = (y * image.width + x) * 4,
                dst = 54 + y * stride + x * 3;
            bytes[dst] = data[src + 2];
            bytes[dst + 1] = data[src + 1];
            bytes[dst + 2] = data[src];
        }
    return bytes;
}

async function encodeAvif(canvas: HTMLCanvasElement, quality: number) {
    if (!(await isImageFormatSupported("avif")))
        throw new Error("当前环境不支持 avif 编码");
    const width = canvas.width;
    const height = canvas.height;
    const bitrate = Math.max(
        1,
        Math.round(width * height * Math.max(0.2, quality) * 8),
    );
    const { promise, resolve, reject } = Promise.withResolvers<Uint8Array>();
    const chunks: Uint8Array[] = [];
    const encoder = new VideoEncoder({
        output: (chunk) => {
            const data = new Uint8Array(chunk.byteLength);
            chunk.copyTo(data);
            chunks.push(data);
        },
        error: (e) => reject(e),
    });
    try {
        try {
            encoder.configure({
                codec: avifCodec,
                width,
                height,
                framerate: 1,
                bitrate,
                latencyMode: "quality",
            });
        } catch {
            encoder.configure({
                codec: avifCodec,
                width,
                height,
                framerate: 1,
                bitrate,
            });
        }
        const frame = new VideoFrame(canvas, {
            timestamp: 0,
            duration: 1e6,
        });
        encoder.encode(frame, { keyFrame: true });
        frame.close();
        await encoder.flush();
        const first = chunks[0];
        if (!first) throw new Error("avif 编码失败");
        resolve(muxAvifStill({ width, height, data: first }));
    } catch (e) {
        reject(e);
    } finally {
        encoder.close();
    }
    return promise;
}
