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
请只返回 JSON，不要使用 Markdown 代码块包裹整个回复。格式必须是：
{
  "answer": "完整中文回答（可适度使用 Markdown：## 标题、- 列表、**粗体**、$$公式$$、\\(行内公式\\)、\\[行间公式\\]、\`\`\`代码块\`\`\`、\`\`\`mermaid\`\`\` 图表、表格等增强可读性）",
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
在 answer 中适度使用 Markdown 格式（标题、列表、粗体、公式、代码块、表格等）来增强可读性，
但要保证术语的 UTF-16 字符起始和结束索引与 answer 字符串中的位置完全对应。
回答应清晰、准确。只标注真正值得展开的专业名词，宁缺毋滥；不要标注普通词、泛化词、整句或相互重叠的文本。
请尽力覆盖文中所有值得展开的专业术语，数量不限，但每一条都必须是真正专业、值得用户点击追问的术语。`;

const STREAMING_SYSTEM_PROMPT = `你是 Explore 的知识回答引擎。请用清晰、准确的中文回答用户的问题。
回答应详细、完整且结构清晰。直接输出符合 Markdown 语法的回答内容。

你可以使用以下 Markdown 格式来增强可读性：
- 使用 ## 或 ### 创建层级标题
- 使用 - 创建无序列表，使用 1. 创建有序列表
- 使用 **粗体** 强调关键概念
- 使用 $$公式$$ 或 $公式$ 嵌入数学公式（LaTeX 语法）
- 也可使用 \\(行内公式\\)、\\[行间公式\\] 或 \\begin{equation} 等 LaTeX 环境写法
- 使用 \`\`\`language 创建代码块
- 使用 \`\`\`mermaid 创建流程图或时序图
- 使用表格对比信息
- 使用 > 引用重点内容

注意：不要用三个反引号包裹整个回答，直接输出 Markdown 文本内容即可。`;

// Asking for the full JSON annotation (offsets + canonicalKey + question)
// makes DeepSeek emit hundreds of KB of reasoning even with effort:none,
// blowing the timeout. A bare term array returns in ~1.5s; the server fills
// in offsets (via indexOf) and defaults for the other fields.
const TERMS_EXTRACTION_PROMPT = `你是 Explore 的术语标注引擎。
请为以下文本标注专业术语，只返回 JSON，不要使用 Markdown 代码块。
格式必须是：{"terms":["专业名词1","专业名词2"]}
只标注真正值得展开的专业名词，宁缺毋滥；不要标注普通词、泛化词、整句或相互重叠的文本。
请尽力覆盖文中所有值得展开的专业术语，数量不限，但每一条都必须是真正专业、值得用户点击追问的术语。`;

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
    // No hard cap — the model is trusted to judge quality. Keep only the
    // dedupe and overlap filters, which prevent duplicate/crossing markers.
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

async function extractTerms(
  answerText: string,
  endpoint: string,
  apiKey: string,
  model: string,
): Promise<NonNullable<ReturnType<typeof normalizeTerms>>> {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: TERMS_EXTRACTION_PROMPT },
          // Key terms overwhelmingly appear in the opening definition of a
          // reply. Keeping the excerpt short is what makes DeepSeek's
          // extraction hit its fast path (~300ms); full replies (>2k chars)
          // reliably hit the slow path and time out even with effort:none.
          { role: "user", content: answerText.slice(0, 500) },
        ],
        temperature: 0.1,
        // Term extraction is a pure structured task — disable thinking so it
        // returns in ~300ms instead of 45s+ (reasoner effort would time out).
        reasoning: { effort: "none" },
        // Stream the extraction: in the local Cloudflare worker runtime the
        // non-streaming path has a large fixed latency, while streaming
        // upstream calls return promptly (same as /api/ai).
        stream: true,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok || !response.body) return [];
    // Accumulate the SSE streamed content.
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const chunk = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const delta = chunk.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) content += delta;
        } catch {
          // Skip unparseable chunks
        }
      }
    }
    if (!content) return [];

    const parsed = parseModelJson(content);
    // New prompt returns a bare string array: {"terms":["术语1",...]}.
    // Convert to the object shape normalizeTerms expects; offsets are resolved
    // server-side via indexOf, and canonicalKey/suggestedQuestion get defaults.
    const rawTerms = parsed.terms;
    const objectTerms = Array.isArray(rawTerms)
      ? rawTerms.map((item) =>
          typeof item === "string" ? { text: item } : item,
        )
      : [];
    const result = normalizeTerms(answerText, objectTerms);
    return result;
  } catch (e) {
    return [];
  }
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
      stream?: unknown;
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

    // --- Streaming SSE response ---
    const shouldStream = payload.stream === true;
    if (shouldStream) {
      const upstreamResponse = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: STREAMING_SYSTEM_PROMPT },
            ...messages,
          ],
          stream: true,
          temperature: 0.4,
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!upstreamResponse.ok || !upstreamResponse.body) {
        const errorText = await upstreamResponse.text();
        let errorPayload: Record<string, unknown> = {};
        try {
          errorPayload = JSON.parse(errorText) as Record<string, unknown>;
        } catch {
          /* ignore */
        }
        return Response.json(
          {
            error:
              extractProviderMessage(errorPayload) ||
              `上游错误 ${upstreamResponse.status}`,
          },
          { status: 502 },
        );
      }

      const encoder = new TextEncoder();
      let accumulatedAnswer = "";

      const sseStream = new ReadableStream({
        async start(controller) {
          const reader = upstreamResponse.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          try {
            // Pass 1: stream delta tokens
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith("data:")) continue;
                const data = trimmed.slice(5).trim();
                if (data === "[DONE]") continue;

                try {
                  const chunk = JSON.parse(data);
                  const delta = (
                    chunk as {
                      choices?: Array<{ delta?: { content?: string } }>;
                    }
                  ).choices?.[0]?.delta?.content;
                  if (typeof delta === "string" && delta.length > 0) {
                    accumulatedAnswer += delta;
                    const ssePayload = JSON.stringify({
                      type: "delta",
                      content: delta,
                    });
                    controller.enqueue(
                      encoder.encode(`data: ${ssePayload}\n\n`),
                    );
                  }
                } catch {
                  // Skip unparseable chunks
                }
              }
            }

            // Terms are harvested CLIENT-SIDE via POST /api/terms based on the
            // exact streamed answer text. We deliberately do NOT use the
            // parallel non-streaming request's terms here: that request
            // generates its OWN answer text, so its start/end offsets never
            // match the streamed body and would mis-annotate the buttons.
            // Close the stream immediately so the body renders right away.
            const termsPayload = JSON.stringify({
              type: "terms",
              terms: [],
              providerModel: model,
            });
            controller.enqueue(encoder.encode(`data: ${termsPayload}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (error) {
            try {
              const msg =
                error instanceof Error ? error.message : "Stream error";
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "error", message: msg })}\n\n`,
                ),
              );
            } catch {
              /* ignore */
            }
            controller.error(error);
          }
        },
      });

      return new Response(sseStream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        },
      });
    }

    // --- Non-streaming path (existing behavior) ---
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

// Exported for reuse by the /api/terms route (client-side term re-fetch after
// the streaming response has already closed).
export { extractTerms, validateEndpoint };
