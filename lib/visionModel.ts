import type { setting } from "../src/ShareTypes";

export function selectedVisionModel(
    ocr: string,
    models: setting["AI"]["在线模型"],
) {
    return models.find(
        (model) => ocr === `ai-${model.name}` && model.supportVision,
    );
}
