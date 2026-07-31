import { extractTerms, validateEndpoint } from "../ai/route";

/**
 * POST /api/terms — standalone term-extraction endpoint.
 *
 * The streaming path closes its SSE stream immediately after the body text
 * finishes (so the UI renders instantly); if the parallel annotation request
 * hadn't produced terms in time, the client re-fetches them here.
 *
 * Body: { answer: string, endpoint: string, apiKey: string, model: string }
 * Returns: { terms: TermAnnotation[] }
 */
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      answer?: unknown;
      endpoint?: unknown;
      apiKey?: unknown;
      model?: unknown;
    };
    const answer = typeof payload.answer === "string" ? payload.answer.trim() : "";
    const endpoint =
      typeof payload.endpoint === "string"
        ? validateEndpoint(payload.endpoint.trim())
        : "";
    const apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    const model = typeof payload.model === "string" ? payload.model.trim() : "";

    if (!answer || !endpoint || !apiKey || !model) {
      return Response.json({ terms: [] }, { status: 400 });
    }

    const terms = await extractTerms(
      answer.slice(0, 30000),
      endpoint,
      apiKey,
      model,
    );
    return Response.json(
      { terms },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ terms: [] });
  }
}
