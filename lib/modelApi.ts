import type { setting } from "../src/ShareTypes";

export type Provider = "openai" | "anthropic" | "gemini";
export type Model = setting["AI"]["在线模型"][number];
export type Message = {
    role: "system" | "user" | "assistant";
    content: { text: string; img?: string };
};
export const endpoints: Record<Provider, string> = {
    openai: "https://api.openai.com/v1/",
    anthropic: "https://api.anthropic.com/v1/",
    gemini: "https://generativelanguage.googleapis.com/v1beta/",
};

export function providerOf(model: Pick<Model, "type" | "url">): Provider {
    if (
        model.type === "openai" ||
        model.type === "anthropic" ||
        model.type === "gemini"
    )
        return model.type;
    const host = URL.canParse(model.url) ? new URL(model.url).hostname : "";
    if (host === "api.anthropic.com") return "anthropic";
    if (host === "generativelanguage.googleapis.com") return "gemini";
    return "openai";
}

function endpoint(model: Model, route: string) {
    const provider = providerOf(model);
    const url = new URL(model.url.trim() || endpoints[provider]);
    if (
        !["https:", "http:"].includes(url.protocol) ||
        url.username ||
        url.password
    )
        throw Error("Invalid API URL");
    let path = url.pathname
        .replace(/\/+$/, "")
        .replace(
            /\/(?:chat\/completions|messages|models(?:\/[^/]+:(?:streamGenerateContent|generateContent))?)$/,
            "",
        );
    if (!path) path = provider === "gemini" ? "/v1beta" : "/v1";
    url.pathname = `${path}/${route}`;
    return url;
}
export function requestOptions(model: Model) {
    return Object.fromEntries(
        Object.entries(model.config || {}).filter(
            ([key]) =>
                ![
                    "authorization",
                    "x-api-key",
                    "x-goog-api-key",
                    "headers",
                ].includes(key.toLowerCase()),
        ),
    );
}
export function modelHeaders(model: Model, browser = false) {
    const headers: Record<string, string> = {
        "content-type": "application/json",
    };
    switch (providerOf(model)) {
        case "anthropic":
            headers["anthropic-version"] = "2023-06-01";
            headers["x-api-key"] = model.key;
            if (browser)
                headers["anthropic-dangerous-direct-browser-access"] = "true";
            break;
        case "gemini":
            headers["x-goog-api-key"] = model.key;
            break;
        case "openai":
            if (model.key) headers.authorization = `Bearer ${model.key}`;
            break;
    }
    return headers;
}
export function messagesUrl(model: Model) {
    return endpoint(model, "messages").toString();
}
function imageParts(img: string) {
    const m = /^data:(image\/[\w.+-]+);base64,([\s\S]+)$/.exec(img);
    if (!m) throw Error("Expected a base64 image");
    return { mimeType: m[1], data: m[2] };
}
type Packet = {
    error?: { message?: string; type?: string };
    type?: string;
    choices?: {
        delta?: { content?: string };
        message?: { content?: string };
        finish_reason?: string;
    }[];
    content?: { type: string; text?: string }[];
    delta?: { type?: string; text?: string };
    stop_reason?: string;
    candidates?: {
        finishReason?: string;
        content?: { parts?: { text?: string; thought?: boolean }[] };
    }[];
};
function packetText(provider: Provider, packet: Packet) {
    if (packet.error) throw Error(packet.error.type || "Model request failed");
    if (provider === "anthropic")
        return packet.delta?.type === "text_delta"
            ? packet.delta.text || ""
            : packet.content
                  ?.filter((p) => p.type === "text")
                  .map((p) => p.text)
                  .join("") || "";
    if (provider === "gemini")
        return (
            packet.candidates?.[0]?.content?.parts
                ?.filter((p) => !p.thought)
                .map((p) => p.text || "")
                .join("") || ""
        );
    return (
        packet.choices?.[0]?.delta?.content ??
        packet.choices?.[0]?.message?.content ??
        ""
    );
}
export async function generateText(
    model: Model,
    messages: Message[],
    signal: AbortSignal,
    onText?: (text: string) => void,
    transport: typeof fetch = fetch,
    browser = false,
) {
    const provider = providerOf(model),
        stream = Boolean(onText);
    const system = messages
        .filter((m) => m.role === "system")
        .map((m) => m.content.text)
        .join("\n");
    const turns = messages.filter((m) => m.role !== "system");
    let url: URL, body: Record<string, unknown>;
    if (provider === "anthropic") {
        url = endpoint(model, "messages");
        body = {
            max_tokens: 4096,
            ...requestOptions(model),
            model: model.model,
            stream,
            ...(system ? { system } : {}),
            messages: turns.map(({ role, content }) => {
                const parts: object[] = [];
                if (content.img) {
                    const i = imageParts(content.img);
                    parts.push({
                        type: "image",
                        source: {
                            type: "base64",
                            media_type: i.mimeType,
                            data: i.data,
                        },
                    });
                }
                parts.push({ type: "text", text: content.text || " " });
                return { role, content: parts };
            }),
        };
    } else if (provider === "gemini") {
        const name = model.model.replace(/^models\//, "");
        url = endpoint(
            model,
            "models/" +
                encodeURIComponent(name) +
                ":" +
                (stream ? "streamGenerateContent" : "generateContent"),
        );
        if (stream) url.searchParams.set("alt", "sse");
        body = {
            ...requestOptions(model),
            ...(system
                ? { systemInstruction: { parts: [{ text: system }] } }
                : {}),
            contents: turns.map(({ role, content }) => ({
                role: role === "assistant" ? "model" : "user",
                parts: [
                    ...(content.img
                        ? [{ inlineData: imageParts(content.img) }]
                        : []),
                    { text: content.text },
                ],
            })),
        };
    } else {
        url = endpoint(model, "chat/completions");
        body = {
            ...requestOptions(model),
            model: model.model,
            stream,
            messages: messages.map(({ role, content }) => ({
                role,
                content: content.img
                    ? [
                          { type: "text", text: content.text },
                          {
                              type: "image_url",
                              image_url: { url: content.img },
                          },
                      ]
                    : content.text,
            })),
        };
    }
    const response = await transport(url.toString(), {
        method: "POST",
        headers: modelHeaders(model, browser),
        body: JSON.stringify(body),
        signal,
        redirect: "error",
    });
    if (!response.ok)
        throw Error(
            `${provider} HTTP ${response.status} ${response.statusText}`,
        );
    if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        const value = packetText(provider, await response.json());
        if (!value) throw Error("Empty model response");
        onText?.(value);
        return value;
    }
    if (!response.body) throw Error("Empty model response");
    const reader = response.body.getReader(),
        decoder = new TextDecoder();
    let pending = "",
        output = "",
        data: string[] = [];
    function dispatch() {
        const raw = data.join("\n");
        data = [];
        if (!raw || raw === "[DONE]") return;
        const part = packetText(provider, JSON.parse(raw));
        if (part) {
            output += part;
            onText?.(output);
        }
    }
    function line(s: string) {
        s = s.replace(/\r$/, "");
        if (!s) {
            dispatch();
            return;
        }
        if (s.startsWith("data:")) data.push(s.slice(5).trimStart());
    }
    try {
        while (true) {
            const chunk = await reader.read();
            pending += decoder.decode(chunk.value, { stream: !chunk.done });
            const lines = pending.split("\n");
            pending = lines.pop() || "";
            for (const value of lines) line(value);
            if (chunk.done) break;
        }
        if (pending) line(pending);
        dispatch();
    } finally {
        reader.releaseLock();
    }
    if (!output) throw Error("Empty model response");
    return output;
}
export async function listModels(model: Model, signal: AbortSignal) {
    const provider = providerOf(model),
        names = new Set<string>(),
        seen = new Set<string>();
    const url = endpoint(model, "models");
    while (true) {
        const res = await fetch(url, {
            headers: modelHeaders(model, true),
            signal,
            redirect: "error",
        });
        if (!res.ok) throw Error(`${provider} HTTP ${res.status}`);
        const result = (await res.json()) as {
            data?: { id: string }[];
            models?: { name: string; supportedGenerationMethods?: string[] }[];
            has_more?: boolean;
            last_id?: string;
            nextPageToken?: string;
        };
        if (provider === "gemini") {
            for (const m of result.models ?? [])
                if (
                    !m.supportedGenerationMethods ||
                    m.supportedGenerationMethods.includes("generateContent")
                )
                    names.add(m.name.replace(/^models\//, ""));
        } else for (const m of result.data ?? []) names.add(m.id);
        const next =
            provider === "gemini"
                ? result.nextPageToken
                : provider === "anthropic" && result.has_more
                  ? result.last_id
                  : undefined;
        if (!next || seen.has(next)) break;
        seen.add(next);
        url.searchParams.set(
            provider === "gemini" ? "pageToken" : "after_id",
            next,
        );
    }
    return [...names];
}
