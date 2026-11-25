import type { IconType } from "../src/iconTypes";
import type { DrawingAction, SelectionAction, 功能 } from "../src/ShareTypes";

export type ClipDrawToolMeta = {
    key: string;
    icon?: IconType;
    title: string;
};

export const clipDrawTools: ClipDrawToolMeta[] = [
    { key: "draw.free", icon: "draw", title: "画笔" },
    { key: "draw.eraser", icon: "eraser", title: "橡皮" },
    { key: "draw.spray", icon: "spray", title: "喷刷" },
    { key: "shape.line", icon: "line", title: "线条" },
    { key: "shape.circle", icon: "circle", title: "圆" },
    { key: "shape.rect", icon: "rect", title: "矩形" },
    { key: "shape.frame", icon: "frame", title: "框" },
    { key: "shape.polyline", icon: "polyline", title: "折线" },
    { key: "shape.polygon", icon: "polygon", title: "多边形" },
    { key: "shape.text", icon: "text", title: "文字" },
    { key: "shape.number", icon: "number", title: "序号" },
    { key: "shape.arrow", icon: "arrow", title: "箭头" },
    { key: "shape.mask", icon: "mask", title: "遮罩" },
    { key: "filter.pixelate", icon: "pixelate", title: "马赛克" },
    { key: "filter.blur", icon: "blur", title: "模糊" },
    { key: "filter.brightness", icon: "brightness", title: "亮度" },
    { key: "filter.contrast", icon: "contrast", title: "对比度" },
    { key: "filter.saturation", icon: "saturation", title: "饱和度" },
    { key: "filter.hue", icon: "hue", title: "色调" },
    { key: "filter.gamma", title: "伽马" },
    { key: "filter.noise", title: "噪点" },
    { key: "filter.gray_average", title: "灰度（平均值）" },
    { key: "filter.gray_lightness", title: "灰度（明度）" },
    { key: "filter.gray_luminosity", title: "灰度（加权亮度）" },
    { key: "filter.invert", title: "负片" },
    { key: "filter.sepia", title: "棕褐色" },
    { key: "filter.bw", title: "黑白" },
    { key: "filter.brownie", title: "布朗尼" },
    { key: "filter.vintage", title: "老式" },
    { key: "filter.koda", title: "柯达彩色胶片" },
    { key: "filter.techni", title: "特艺色彩" },
    { key: "filter.polaroid", title: "宝丽来" },
    { key: "position.front", icon: "position_front", title: "移动到最顶端" },
    {
        key: "position.forwards",
        icon: "position_forwards",
        title: "向上移动一层",
    },
    {
        key: "position.backwards",
        icon: "position_backwards",
        title: "向下移动一层",
    },
    { key: "position.back", icon: "position_back", title: "移动到最底端" },
    { key: "action.undo", icon: "left", title: "撤回" },
    { key: "action.redo", icon: "right", title: "重做" },
    { key: "action.copy", icon: "copy", title: "复制选中元素" },
    { key: "action.delete", icon: "clear", title: "删除选中元素" },
];

export const captureTools: {
    key: 功能;
    icon: IconType;
    title: string;
    group: string;
}[] = [
    { key: "close", icon: "close", title: "关闭", group: "截屏控制" },
    { key: "screens", icon: "screen", title: "屏幕管理", group: "截屏控制" },
    { key: "ocr", icon: "ocr", title: "文字识别", group: "识别与翻译" },
    { key: "search", icon: "search", title: "以图搜图", group: "识别与翻译" },
    { key: "QR", icon: "scan", title: "二维码", group: "识别与翻译" },
    { key: "open", icon: "open", title: "其他应用打开", group: "打开与编辑" },
    { key: "ding", icon: "ding", title: "屏幕贴图", group: "贴图与录制" },
    {
        key: "dingLive",
        icon: "live_ding",
        title: "动态贴图",
        group: "贴图与录制",
    },
    { key: "record", icon: "record", title: "录屏", group: "贴图与录制" },
    { key: "long", icon: "long_clip", title: "广截屏", group: "贴图与录制" },
    {
        key: "translate",
        icon: "translate",
        title: "屏幕翻译",
        group: "识别与翻译",
    },
    {
        key: "editor",
        icon: "super_edit",
        title: "高级图片编辑",
        group: "打开与编辑",
    },
    { key: "copy", icon: "copy", title: "复制截图", group: "复制与保存" },
    { key: "save", icon: "save", title: "保存截图", group: "复制与保存" },
];

const drawingKeys = new Set(
    clipDrawTools
        .filter((tool) => /^(draw|shape|filter)\./.test(tool.key))
        .map((tool) => tool.key),
);
export function isDrawingAction(key: string): key is DrawingAction {
    return drawingKeys.has(key);
}
export type SelectionTool = {
    key: SelectionAction;
    title: string;
    group: string;
    icon?: IconType;
};
export const selectionTools: SelectionTool[] = [
    ...["识别与翻译", "复制与保存", "贴图与录制", "打开与编辑"].flatMap(
        (group) => captureTools.filter((t) => t.group === group),
    ),
    ...clipDrawTools.flatMap((t) =>
        isDrawingAction(t.key)
            ? [
                  {
                      ...t,
                      key: t.key,
                      group: t.key.startsWith("draw.")
                          ? "自由绘画"
                          : t.key.startsWith("shape.")
                            ? "形状与文字"
                            : "图像滤镜",
                  },
              ]
            : [],
    ),
];
export function isSelectionAction(key: string): key is SelectionAction {
    return isDrawingAction(key) || captureTools.some((t) => t.key === key);
}
