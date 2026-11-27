import { findOffset } from "picture_match";
import { LongStitcher } from "../../../lib/longStitch";

export { longOverlapLevel } from "../../../lib/longStitch";
export function createStitcher(direction: "y" | "xy") {
    return new LongStitcher({ findOffset, direction });
}
