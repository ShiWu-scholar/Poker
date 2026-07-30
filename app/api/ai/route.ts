type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type RawTerm = {
  text?: unknown;
  start?: unknown;
  end?: unknown;
  canonicalKey?: unknown;
  suggestedQuestion?: unknown;
};

const SYSTEM_PROMPT = `你是 Explore 的回答与术语标注引擎。
请只返回 JSON，不要使用 Markdown 代码块。格式必须是：
{
  "answer": "完整中文回答",
  "terms": [
    {
      "text": "必须原样出现在 answer 中的专业名词",
      "start": 该名词在 answer 中按 JavaScript UTF-16 计算的起始索引,
      "end": 结束索引,
      "canonicalKey": "稳定、简短的术语标识",
      "suggestedQuestion": "用户点击该名词后适合继续追问的问题"
    }
  ]
}
回答应清晰、准确。只标注真正值得展开的专业名词，每次 1 到 6 个；不要标注普通词、整句或相互重叠的文本。`;

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function validateEndpoint(value: string) {
  const endpoint = new URL(value);
  const hostname = endpoint.hostname.toLowerCase();
  if (endpoint.protocol !== "https:") {
    throw new Error("API URL 必须使用 HTTPS");
  }
  if (
    endpoint.username ||
    endpoint.password ||
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    isPrivateIpv4(hostname)
  ) {
    throw new Error("该 API 地址不可用");
  }
  // Auto-append /v1/chat/completions if user only provided base URL
  const rawPath = endpoint.pathname.replace(/\/+$/g, "");
  if (!rawPath || rawPath === "/" || rawPath === "/v1") {
    endpoint.pathname = "/v1/chat/completions";
  }
  return endpoint.toString();
}

function parseModelJson(content: string) {
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  try {
    return JSON.parse(stripped) as { answer?: unknown; terms?: unknown };
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("模型没有返回有效的结构化回复");
    return JSON.parse(stripped.slice(start, end + 1)) as {
      answer?: unknown;
      terms?: unknown;
    };
  }
}

function normalizeTerms(answer: string, value: unknown) {
  const rawTerms = Array.isArray(value) ? (value as RawTerm[]) : [];
  const normalized = rawTerms
    .map((raw) => {
      const text = typeof raw.text === "string" ? raw.text.trim() : "";
      if (text.length < 2 || text.length > 48) return null;

      const requestedStart =
        typeof raw.start === "number" && Number.isInteger(raw.start)
          ? raw.start
          : -1;
      const requestedEnd =
        typeof raw.end === "number" && Number.isInteger(raw.end)
          ? raw.end
          : -1;
      const exactAtRequestedPosition =
        requestedStart >= 0 &&
        requestedEnd === requestedStart + text.length &&
        answer.slice(requestedStart, requestedEnd) === text;
      const start = exactAtRequestedPosition
        ? requestedStart
        : answer.indexOf(text);
      if (start < 0) return null;

      const fallbackKey = text.toLocaleLowerCase().replace(/\s+/g, "-");
      const canonicalKey =
        typeof raw.canonicalKey === "string" && raw.canonicalKey.trim()
          ? raw.canonicalKey.trim().toLocaleLowerCase().slice(0, 80)
          : fallbackKey;
      const suggestedQuestion =
        typeof raw.suggestedQuestion === "string" &&
        raw.suggestedQuestion.trim()
          ? raw.suggestedQuestion.trim().slice(0, 160)
          : `请详细解释「${text}」`;

      return {
        text,
        start,
        end: start + text.length,
        canonicalKey,
        suggestedQuestion,
      };
    })
    .filter((term): term is NonNullable<typeof term> => Boolean(term))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const accepted: typeof normalized = [];
  for (const term of normalized) {
    if (accepted.length >= 6) break;
    const previous = accepted.at(-1);
    if (previous && term.start < previous.end) continue;
    if (
      accepted.some(
        (item) =>
          item.start === term.start && item.canonicalKey === term.canonicalKey,
      )
    ) {
      continue;
    }
    accepted.push(term);
  }
  return accepted;
}

function extractProviderMessage(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string") return error.slice(0, 240);
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message.slice(0, 240);
  }
  return "";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      endpoint?: unknown;
      apiKey?: unknown;
      model?: unknown;
      messages?: unknown;
    };
    const endpoint =
      typeof payload.endpoint === "string"
        ? validateEndpoint(payload.endpoint.trim())
        : "";
    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    const model = typeof payload.model === "string" ? payload.model.trim() : "";
    const messages = Array.isArray(payload.messages)
      ? (payload.messages as ChatMessage[])
          .filter(
            (message) =>
              (message?.role === "user" || message?.role === "assistant") &&
              typeof message.content === "string" &&
              message.content.trim(),
          )
          .slice(-12)
          .map((message) => ({
            role: message.role,
            content: message.content.trim().slice(0, 12000),
          }))
      : [];

    if (!endpoint || !apiKey || !model || messages.length === 0) {
      return Response.json(
        { error: "API URL、API Key、模型 ID 与消息均不能为空" },
        { status: 400 },
      );
    }

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(45000),
    });

    const upstreamText = await upstream.text();
    let upstreamPayload: Record<string, unknown>;
    try {
      upstreamPayload = JSON.parse(upstreamText) as Record<string, unknown>;
    } catch {
      upstreamPayload = {};
    }

    if (!upstream.ok) {
      const providerMessage = extractProviderMessage(upstreamPayload);
      const hint = upstreamText
        ? providerMessage || upstreamText.slice(0, 200)
        : `HTTP ${upstream.status}`;
      return Response.json(
        { error: `上游接口返回错误：${hint}` },
        { status: 502 },
      );
    }

    const rawContent = (upstreamPayload as {
      choices?: Array<{
        message?: {
          content?: string | Array<{ type?: string; text?: string }>;
        };
      }>;
    }).choices?.[0]?.message?.content;
    const content = Array.isArray(rawContent)
      ? rawContent.map((part) => part.text ?? "").join("")
      : rawContent;
    if (!content) throw new Error("模型没有返回回复内容");

    const parsed = parseModelJson(content);
    if (typeof parsed.answer !== "string" || !parsed.answer.trim()) {
      throw new Error("模型回复缺少 answer 字段");
    }
    const answer = parsed.answer.trim().slice(0, 30000);
    const terms = normalizeTerms(answer, parsed.terms);

    return Response.json(
      { answer, terms, providerModel: model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error && error.name === "TimeoutError"
        ? "模型接口请求超时"
        : error instanceof Error
          ? error.message
          : "模型接口请求失败";
    return Response.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
