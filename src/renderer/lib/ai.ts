import { generateText, type Message, type Model } from "../../../lib/modelApi";
export type aiData = Message;
export function runAI(messages: Message[], model: Model) {
    const controller = new AbortController();
    let update: ((text: string, end: boolean) => void) | undefined;
    let frame = 0,
        latest = "";
    function queue(value: string) {
        latest = value;
        if (!frame)
            frame = requestAnimationFrame(() => {
                frame = 0;
                update?.(latest, false);
            });
    }
    const text = Promise.resolve()
        .then(() =>
            generateText(
                model,
                messages,
                AbortSignal.any([
                    controller.signal,
                    AbortSignal.timeout(120000),
                ]),
                update ? queue : undefined,
                fetch,
                true,
            ),
        )
        .then((value) => {
            update?.(value, true);
            return value;
        })
        .finally(() => cancelAnimationFrame(frame));
    return {
        text,
        stream: (callback: NonNullable<typeof update>) => {
            update = callback;
        },
        stop: () => controller.abort(),
    };
}
