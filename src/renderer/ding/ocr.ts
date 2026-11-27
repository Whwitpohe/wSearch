import { ele } from "dkh-ui";
import store from "../../../lib/store/renderStore";
import { t } from "../../../lib/translate/translate";
import { loadTranslator } from "../lib/translate";
import { defaultOcrId, loadOCR } from "../ocr/ocr";
import { foreground, type TextBox, trailingAccent } from "./translationInk";
import { drawTranslation } from "./translationOverlay";

let lo: import("esearch-ocr").initType;

export async function initOCR() {
    if (!lo) {
        const x = await loadOCR(store, store.get("OCR.类型") || defaultOcrId);
        if (!x) throw Error(t("此模式无法加载所选 OCR 引擎"));
        lo = await x.ocr.init(x.config);
    }
}

export type OcrResult = Awaited<ReturnType<typeof ocr>>;

async function ocr(img: string) {
    const p = await lo.ocr(img);
    return p.columns.flatMap((c) => c.parragraphs);
}

export async function recognizeImage(url: string) {
    await initOCR();
    return ocr(url);
}

export class UnConfigTranslateError extends Error {}

export function loadImage(url: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = url;
    });
}

export async function paintOcrLayer(
    source: HTMLImageElement,
    paragraphs: OcrResult,
    target: string,
) {
    const canvas = ele("canvas").attr({
        width: source.naturalWidth,
        height: source.naturalHeight,
    }).el;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw Error(t("无法绘制截图"));
    const translateE = loadTranslator(store, target);
    if (!translateE) throw new UnConfigTranslateError();
    const lines = paragraphs.length
        ? await translateE(paragraphs.map((p) => p.parse.text))
        : [];
    if (!lines.length) return { layer: canvas, lines };
    ctx.drawImage(source, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    function bounds(box: OcrResult[0]["parse"]["box"]): TextBox {
        const xs = box.map((p) => p[0]),
            ys = box.map((p) => p[1]);
        return {
            left: Math.max(0, Math.floor(Math.min(...xs))),
            top: Math.max(0, Math.floor(Math.min(...ys))),
            right: Math.min(canvas.width, Math.ceil(Math.max(...xs))),
            bottom: Math.min(canvas.height, Math.ceil(Math.max(...ys))),
        };
    }
    const boxes = paragraphs.map((p) => bounds(p.parse.box));
    const obstacles = [...boxes];
    for (const [index, text] of lines.entries()) {
        const paragraph = paragraphs[index];
        if (paragraph?.src.length && text !== paragraph.parse.text)
            eraseText(ctx, paragraph.src);
    }
    for (const [index, text] of lines.entries()) {
        const paragraph = paragraphs[index];
        if (!paragraph?.src.length || text === paragraph.parse.text) continue;
        const { box } = paragraph.parse;
        const rect = boxes[index];
        if (rect.right <= rect.left || rect.bottom <= rect.top) continue;
        ctx.fillStyle = color2rgb(paragraph.src[0].style.text);
        if (
            box[1][0] > box[0][0] &&
            Math.abs(box[1][1] - box[0][1]) <= 1 &&
            Math.abs(box[3][0] - box[0][0]) <= 1 &&
            box[3][1] > box[0][1]
        ) {
            const first = paragraph.src[0];
            const lineBoxes = paragraph.src.map((l) => bounds(l.box));
            const ink = foreground(
                pixels,
                lineBoxes,
                first.style.bg,
                first.style.text,
            );
            ctx.fillStyle = color2rgb(ink);
            drawTranslation(
                ctx,
                pixels,
                rect,
                obstacles,
                text,
                first.style.bg,
                Math.max(1, Math.round(distance(first.box[3], first.box[0]))),
                trailingAccent(
                    pixels,
                    lineBoxes[lineBoxes.length - 1],
                    paragraph.src[paragraph.src.length - 1].style.bg,
                    ink,
                    paragraph.parse.text,
                    text,
                ),
            );
        } else {
            drawRotatedText(text, ctx, box, paragraph.src);
        }
    }
    return { layer: canvas, lines };
}

function distance(a: [number, number], b: [number, number]) {
    return Math.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
}

function drawRotatedText(
    text: string,
    ctx: CanvasRenderingContext2D,
    box: OcrResult[0]["parse"]["box"],
    boxSrc: OcrResult[0]["src"],
) {
    const textList = Array.from(seg.segment(text));

    const firstline = boxSrc[0].box;
    const lineHeight = distance(firstline[3], firstline[0]);
    const lineNum = boxSrc.length;
    let fontSize = lineHeight;
    ctx.font = `${fontSize}px serif`;
    const textWidth = ctx.measureText(text).width;
    const boxWidth = distance(box[1], box[0]);
    const boxHeight = distance(box[3], box[0]);
    const oneLineWidth = boxWidth * lineNum;
    if (textWidth > oneLineWidth) {
        fontSize = Math.floor((fontSize * oneLineWidth) / textWidth);
        ctx.font = `${fontSize}px serif`;
    }

    const gap =
        lineNum === 1 ? 0 : (boxHeight - lineHeight * lineNum) / (lineNum - 1);
    const lines = splitText(textList, ctx, boxWidth);

    const angle = Math.atan2(box[1][1] - box[0][1], box[1][0] - box[0][0]);
    const yBaseVector = [
        (box[3][0] - box[0][0]) / boxHeight,
        (box[3][1] - box[0][1]) / boxHeight,
    ];
    ctx.textBaseline = "top";
    for (const [i, line] of lines.entries()) {
        const yn = i * lineHeight + i * gap;
        const x = box[0][0] + yBaseVector[0] * yn;
        const y = box[0][1] + yBaseVector[1] * yn;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillText(line, 0, 0, boxWidth);
        ctx.restore();
    }
}

function eraseText(ctx: CanvasRenderingContext2D, lines: OcrResult[0]["src"]) {
    for (const { box, style } of lines) {
        ctx.fillStyle = color2rgb(style.bg);
        ctx.strokeStyle = ctx.fillStyle;
        ctx.beginPath();
        ctx.moveTo(...box[0]);
        for (const point of box.slice(1)) ctx.lineTo(...point);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }
}

function color2rgb(color: number[]) {
    return `rgb(${color.join(",")})`;
}

function splitText(
    text: Intl.SegmentData[],
    ctx: CanvasRenderingContext2D,
    maxWidth: number,
) {
    // todo 性能
    // todo 符号不能在开头
    let line = "";
    const lines: string[] = [];
    for (let i = 0; i < text.length; i++) {
        const t = text[i].segment;
        if (ctx.measureText(line + t).width < maxWidth) {
            line += t;
        } else {
            lines.push(line);
            line = t;
        }
    }
    if (line) {
        lines.push(line);
    }

    return lines.map((l) => l.trimEnd());
}

let seg: Intl.Segmenter;
try {
    seg = new Intl.Segmenter(
        store.get("屏幕翻译.语言.to") ||
            store.get("语言.语言") ||
            navigator.language,
        { granularity: "word" },
    );
} catch (error) {
    seg = new Intl.Segmenter("zh-HANS", { granularity: "word" });
}
