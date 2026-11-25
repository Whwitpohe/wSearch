import { afterEach, describe, expect, it, vi } from "vitest";
import {
    endpoints,
    generateText,
    listModels,
    type Model,
    type Provider,
    providerOf,
} from "../lib/modelApi";
import { toolbarLayout } from "../lib/toolbarLayout";

const fixture = (type: Provider): Model => ({
    type,
    name: "fixture",
    model: "model-a",
    key: "fixture-key",
    url: endpoints[type],
    supportVision: true,
    config: {},
});
const messages = [
    { role: "system", content: { text: "Translate." } },
    {
        role: "user",
        content: { text: "hello", img: "data:image/png;base64,AQID" },
    },
] as const;
const signal = () => AbortSignal.timeout(5000);
afterEach(() => vi.unstubAllGlobals());
describe("model provider protocols", () => {
    for (const type of ["openai", "anthropic", "gemini"] as const)
        it(
            type +
                " sends native text and image blocks and reads split Unicode events",
            async () => {
                const events =
                    type === "openai"
                        ? [{ choices: [{ delta: { content: "你好" } }] }]
                        : type === "anthropic"
                          ? [
                                {
                                    type: "content_block_delta",
                                    delta: { type: "text_delta", text: "你好" },
                                },
                            ]
                          : [
                                {
                                    candidates: [
                                        {
                                            content: {
                                                parts: [
                                                    {
                                                        text: "hidden",
                                                        thought: true,
                                                    },
                                                    { text: "你好" },
                                                ],
                                            },
                                        },
                                    ],
                                },
                            ];
                const bytes = new TextEncoder().encode(
                    `${events
                        .map((p) => `data: ${JSON.stringify(p)}\r\n\r\n`)
                        .join("")}data: [DONE]\n\n`,
                );
                const transport: typeof fetch = async (url, init) => {
                    const h = new Headers(init?.headers),
                        b = JSON.parse(String(init?.body));
                    if (type === "openai") {
                        expect(h.get("authorization")).toBe(
                            "Bearer fixture-key",
                        );
                        expect(String(url)).toMatch(/\/v1\/chat\/completions$/);
                        expect(
                            b.messages[1].content[1].image_url.url,
                        ).toContain("AQID");
                    }
                    if (type === "anthropic") {
                        expect(h.get("x-api-key")).toBe("fixture-key");
                        expect(String(url)).toMatch(/\/v1\/messages$/);
                        expect(b.system).toBe("Translate.");
                        expect(b.messages[0].content[0].source.data).toBe(
                            "AQID",
                        );
                    }
                    if (type === "gemini") {
                        expect(h.get("x-goog-api-key")).toBe("fixture-key");
                        expect(String(url)).toContain(
                            "/v1beta/models/model-a:streamGenerateContent?alt=sse",
                        );
                        expect(b.contents[0].parts[0].inlineData).toEqual({
                            mimeType: "image/png",
                            data: "AQID",
                        });
                    }
                    return new Response(
                        new ReadableStream({
                            start(c) {
                                for (const byte of bytes)
                                    c.enqueue(Uint8Array.of(byte));
                                c.close();
                            },
                        }),
                        { headers: { "content-type": "text/event-stream" } },
                    );
                };
                const chunks: string[] = [];
                expect(
                    await generateText(
                        fixture(type),
                        [...messages],
                        signal(),
                        (t) => chunks.push(t),
                        transport,
                    ),
                ).toBe("你好");
                expect(chunks).toEqual(["你好"]);
            },
        );
    it("keeps compatible gateways on OpenAI and recognizes old official-host profiles", () => {
        expect(providerOf({ type: "chatgpt", url: endpoints.anthropic })).toBe(
            "anthropic",
        );
        expect(
            providerOf({
                type: "chatgpt",
                url: "https://example.org/proxy/v1/",
            }),
        ).toBe("openai");
        expect(providerOf({ type: "openai", url: endpoints.anthropic })).toBe(
            "openai",
        );
    });
    it("settles on HTTP errors and on a failure event", async () => {
        for (const response of [
            new Response("", { status: 429 }),
            new Response('data: {"error":{"type":"overloaded"}}\n\n', {
                headers: { "content-type": "text/event-stream" },
            }),
        ]) {
            await expect(
                generateText(
                    fixture("anthropic"),
                    [...messages],
                    signal(),
                    undefined,
                    async () => response,
                ),
            ).rejects.toThrow();
        }
    });
    it("lists Gemini generation models across pages", async () => {
        const urls: string[] = [];
        vi.stubGlobal("fetch", async (url: URL) => {
            urls.push(url.toString());
            return Response.json({
                models: [
                    {
                        name: "models/a",
                        supportedGenerationMethods: ["generateContent"],
                    },
                    {
                        name: "models/b",
                        supportedGenerationMethods: ["embedContent"],
                    },
                ],
                nextPageToken: urls.length === 1 ? "page2" : undefined,
            });
        });
        expect(await listModels(fixture("gemini"), signal())).toEqual(["a"]);
        expect(urls[1]).toContain("pageToken=page2");
    });
});
describe("toolbar layout", () => {
    const capture = ["copy", "save"],
        draw = ["shape.rect", "draw.free"];
    it("keeps the membership and order of legacy More, including three-lane saves", () => {
        for (const saved of [
            null,
            {
                capture: ["save"],
                draw: [],
                hidden: ["draw.free", "copy", "shape.rect"],
            },
        ]) {
            expect(toolbarLayout(saved, ["save"], [], capture, draw)).toEqual({
                capture: ["save"],
                draw: [],
                more: draw,
                hidden: ["copy"],
            });
        }
    });
    it("honors an explicitly empty More and keeps newly added buttons hidden", () => {
        expect(
            toolbarLayout(
                {
                    capture: [],
                    draw: ["copy", "copy", "unknown"],
                    more: [],
                    hidden: ["shape.rect"],
                },
                [],
                [],
                capture,
                draw,
            ),
        ).toEqual({
            capture: [],
            draw: ["copy"],
            more: [],
            hidden: ["shape.rect", "save", "draw.free"],
        });
    });
    it("allows an ordered mix of capture and drawing buttons in More", () => {
        expect(
            toolbarLayout(
                {
                    capture: [],
                    draw: [],
                    more: ["draw.free", "copy", "shape.rect", "copy"],
                    hidden: ["save"],
                },
                [],
                [],
                capture,
                draw,
            ).more,
        ).toEqual(["draw.free", "copy", "shape.rect"]);
    });
});
