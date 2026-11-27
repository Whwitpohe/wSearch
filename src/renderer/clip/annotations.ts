import { EraserBrush } from "@erase2d/fabric";
import {
    ActiveSelection,
    Canvas,
    Circle,
    type CircleProps,
    classRegistry,
    controlsUtils,
    FabricImage,
    filters,
    IText,
    PencilBrush,
    Point,
    Polygon,
    Polyline,
    Rect,
    Shadow,
    SprayBrush,
    util,
} from "fabric";
import { colorPicker } from "../lib/colorPicker";

type ArrowStyle = {
    arrowW: number;
    arrowH: number;
    arrowType: "fill" | "stroke";
};
let numberFont: string;
let getArrowPro: () => ArrowStyle;

function rotate(x: number, y: number, r: number) {
    const s = Math.sin(r);
    const c = Math.cos(r);
    return [x * c - y * s, x * s + y * c];
}

class mask extends Rect {
    static type = "mask";
    static customProperties = ["形状", "canChangeFill", "feather"];
    /** 羽化半径，单位为对象坐标 */
    declare feather?: number;
    private bandCanvas?: HTMLCanvasElement;

    render(ctx: CanvasRenderingContext2D): void {
        const canvas = this.canvas;
        if (!canvas) return;

        const feather = Math.max(0, this.feather ?? 0);
        const radius = Math.min(this.rx || 0, this.width / 2, this.height / 2);
        const fill = this.fill?.toString() || "";

        if (feather <= 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, canvas.width, canvas.height);
            this.transform(ctx);
            ctx.roundRect(
                -this.width / 2,
                -this.height / 2,
                this.width,
                this.height,
                radius,
            );
            ctx.fillStyle = fill;
            ctx.fill("evenodd");
            ctx.restore();
            return;
        }

        // 只在洞口附近做模糊，避免整幅画布参与滤镜计算
        const center = this.getCenterPoint();
        const matrix = this.calcTransformMatrix();
        const scale = util.qrDecompose(matrix);
        const factor = (Math.abs(scale.scaleX) + Math.abs(scale.scaleY)) / 2;
        const blur = feather * factor;
        const size =
            Math.hypot(this.width * scale.scaleX, this.height * scale.scaleY) +
            blur * 6;
        const left = Math.max(0, Math.round(center.x - size / 2));
        const top = Math.max(0, Math.round(center.y - size / 2));
        const right = Math.min(canvas.width, Math.round(center.x + size / 2));
        const bottom = Math.min(canvas.height, Math.round(center.y + size / 2));
        const width = right - left;
        const height = bottom - top;
        if (width <= 0 || height <= 0) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.restore();
            return;
        }

        const band = this.getBandCanvas(width, height);
        const bctx = band.getContext("2d")!;
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.filter = "none";
        bctx.globalCompositeOperation = "source-over";
        bctx.clearRect(0, 0, width, height);
        bctx.fillStyle = fill;
        bctx.fillRect(0, 0, width, height);
        bctx.globalCompositeOperation = "destination-out";
        bctx.translate(-left, -top);
        bctx.transform(...matrix);
        bctx.beginPath();
        bctx.roundRect(
            -this.width / 2,
            -this.height / 2,
            this.width,
            this.height,
            radius,
        );
        bctx.filter = `blur(${blur}px)`;
        bctx.fillStyle = "#000";
        bctx.fill();

        // 洞外区域平铺，和羽化区域按整数像素拼接，避免接缝
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, canvas.width, canvas.height);
        ctx.rect(left, top, width, height);
        ctx.fillStyle = fill;
        ctx.fill("evenodd");
        ctx.restore();
        ctx.drawImage(band, left, top);
    }

    private getBandCanvas(width: number, height: number) {
        if (
            !this.bandCanvas ||
            this.bandCanvas.width !== width ||
            this.bandCanvas.height !== height
        ) {
            this.bandCanvas = document.createElement("canvas");
            this.bandCanvas.width = width;
            this.bandCanvas.height = height;
        }
        return this.bandCanvas;
    }
}

classRegistry.setClass(mask);
classRegistry.setSVGClass(mask);

class Frame extends Rect {
    static type = "frame";
    static customProperties = ["形状"];
    constructor(options?: ConstructorParameters<typeof Rect>[0]) {
        super(options);
        this.set({ fill: null });
        if (this.strokeWidth < 1) this.set("strokeWidth", 1);
    }
}

classRegistry.setClass(Frame);

class xnumber extends Circle {
    static type = "number";
    static customProperties = ["text", "fontSize", "canChangeFill", "形状"];
    declare fontSize: number;
    declare text: string;
    constructor(
        options?: Partial<CircleProps & { fontSize: number; text: string }>,
    ) {
        super();
        this.setOptions(options);
    }
    _render(ctx: CanvasRenderingContext2D): void {
        super._render(ctx);
        ctx.save();

        const x = 0;
        const y = 5;

        // 绘制数字
        ctx.fillStyle = this.stroke?.toString() || "#000";
        ctx.font = `${this.fontSize}px ${numberFont || "Arial"}`;
        ctx.textAlign = "center";
        ctx.fillText(String(this.text), x, y);
        ctx.restore();
    }
}

classRegistry.setClass(xnumber);
classRegistry.setSVGClass(xnumber);

const lineHitWidth = 12;

class line extends Polyline {
    static type = "line";
    static customProperties = ["形状"];
    constructor(
        points?: ConstructorParameters<typeof Polyline>[0],
        options?: ConstructorParameters<typeof Polyline>[1],
    ) {
        super(points, options);
        this.controls = controlsUtils.createPolyControls(this.points.length, {
            cursorStyle: "crosshair",
        });
        this.hasBorders = false;
    }
    getLocalPoints() {
        const { pathOffset } = this;
        return [
            new Point(this.points[0]).subtract(pathOffset),
            new Point(this.points[this.points.length - 1]).subtract(pathOffset),
        ];
    }
    getHitWidth() {
        const scale = Math.max(Math.abs(this.scaleX), Math.abs(this.scaleY));
        const zoom = this.canvas?.getZoom() ?? 1;
        return Math.max(
            (this.strokeWidth * scale) / 2,
            lineHitWidth / 2 / zoom,
        );
    }
    calcACoords() {
        const matrix = this.calcOwnMatrix();
        const [start, end] = this.getLocalPoints().map((p) =>
            p.transform(matrix),
        );
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const length = Math.hypot(dx, dy);
        if (!length) return super.calcACoords();
        const half = this.getHitWidth();
        const nx = (-dy / length) * half;
        const ny = (dx / length) * half;
        return {
            tl: new Point(start.x + nx, start.y + ny),
            tr: new Point(end.x + nx, end.y + ny),
            br: new Point(end.x - nx, end.y - ny),
            bl: new Point(start.x - nx, start.y - ny),
        };
    }
}

classRegistry.setClass(line);

class arrow extends line {
    static type = "arrow";
    static customProperties = ["arrowW", "arrowH", "arrowType", "形状"];
    declare arrowW: number;
    declare arrowH: number;
    declare arrowType: "fill" | "stroke";
    constructor(
        points?: ConstructorParameters<typeof Polyline>[0],
        options?: ConstructorParameters<typeof Polyline>[1] & {
            arrowW?: number;
            arrowH?: number;
            arrowType?: "fill" | "stroke";
        },
    ) {
        super(points, options);
    }
    getHitWidth() {
        const scale = Math.max(Math.abs(this.scaleX), Math.abs(this.scaleY));
        return Math.max(
            super.getHitWidth(),
            ((this.arrowW ?? getArrowPro().arrowW) / 2) * scale,
        );
    }
    _render(ctx: CanvasRenderingContext2D): void {
        super._render(ctx);

        const [start, end] = this.getLocalPoints();
        const angle =
            Math.atan2(end.y - start.y, end.x - start.x) + Math.PI / 2;
        const pro = getArrowPro();
        const w = this.arrowW ?? pro.arrowW;
        const h = this.arrowH ?? pro.arrowH;
        const type = this.arrowType ?? pro.arrowType;

        const [x3, y3] = rotate(-w / 2, h, angle);
        const [x4, y4] = rotate(w / 2, h, angle);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x + x3, end.y + y3);
        if (type === "stroke") {
            ctx.moveTo(end.x, end.y);
            ctx.lineTo(end.x + x4, end.y + y4);
        } else {
            ctx.lineTo(end.x + x4, end.y + y4);
            ctx.closePath();
        }

        ctx.fillStyle = this.stroke?.toString() || "";
        ctx.lineWidth = this.strokeWidth || 1;
        ctx.strokeStyle = this.stroke?.toString() || "";
        if (type !== "stroke") ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

classRegistry.setClass(arrow);
classRegistry.setSVGClass(arrow);

class polyline extends Polyline {
    constructor(
        points?: ConstructorParameters<typeof Polyline>[0],
        options?: ConstructorParameters<typeof Polyline>[1],
    ) {
        super(points, options);
        this.controls = controlsUtils.createPolyControls(this.points.length);
        this.hasBorders = false;
        this.perPixelTargetFind = true;
    }
}

class polygon extends Polygon {
    constructor(
        points?: ConstructorParameters<typeof Polygon>[0],
        options?: ConstructorParameters<typeof Polygon>[1],
    ) {
        super(points, options);
        this.controls = controlsUtils.createPolyControls(this.points.length);
        this.hasBorders = false;
        this.perPixelTargetFind = true;
    }
}

classRegistry.setClass(polyline);
classRegistry.setClass(polygon);

export function createAnnotations(
    element: HTMLCanvasElement,
    width: number,
    height: number,
    font: string,
    arrowStyle: () => ArrowStyle,
) {
    numberFont = font;
    getArrowPro = arrowStyle;
    const canvas = new Canvas(element, {
        width,
        height,
        enableRetinaScaling: false,
    });
    canvas.setTargetFindTolerance(5);
    return {
        canvas,
        colorPicker,
        mask,
        Frame,
        xnumber,
        line,
        arrow,
        polyline,
        polygon,
        ActiveSelection,
        Circle,
        Rect,
        IText,
        PencilBrush,
        SprayBrush,
        EraserBrush,
        Shadow,
        FabricImage,
        Point,
        util,
        filters,
    };
}

export { createPropertyPanels } from "./propertyPanels";
