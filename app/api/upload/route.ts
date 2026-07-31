/**
 * File upload API endpoint.
 *
 * Accepts multipart file uploads, extracts text content from supported formats,
 * and returns structured metadata for attachment display and AI context injection.
 */
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "csv", "json", "xml", "yaml", "yml",
  "js", "ts", "jsx", "tsx", "py", "rs", "go", "java",
  "c", "cpp", "h", "hpp", "css", "html", "htm", "svg",
  "sql", "sh", "bash", "zsh", "ps1", "toml", "ini", "cfg",
  "log", "env",
]);

function extensionFrom(filename: string) {
  const dot = filename.lastIndexOf(".");
  if (dot < 0) return "";
  return filename.slice(dot + 1).toLowerCase();
}

function mimeIsText(mime: string) {
  if (!mime) return false;
  return (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/xml" ||
    mime === "application/x-yaml" ||
    mime === "application/x-sh"
  );
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return Response.json(
        { error: "请求格式必须为 multipart/form-data" },
        { status: 400 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return Response.json(
        { error: "无法解析上传的表单数据" },
        { status: 400 },
      );
    }

    const entries = formData.getAll("file");
    if (!entries.length) {
      return Response.json(
        { error: "未收到任何文件" },
        { status: 400 },
      );
    }

    const results: Array<{
      name: string;
      type: string;
      size: number;
      text?: string;
      truncated: boolean;
    }> = [];

    for (const entry of entries) {
      if (!(entry instanceof File)) continue;

      const name = entry.name || "unknown";
      const mime = entry.type || "application/octet-stream";
      const size = entry.size;

      if (size > MAX_FILE_BYTES) {
        return Response.json(
          { error: `文件「${name}」超过 10 MB 上限` },
          { status: 413 },
        );
      }

      const ext = extensionFrom(name);
      const isText = mimeIsText(mime) || TEXT_EXTENSIONS.has(ext);

      let text: string | undefined;
      let truncated = false;

      if (isText) {
        try {
          text = await entry.text();
          // Truncate to 80 KB to keep AI context manageable
          if (text.length > 80 * 1024) {
            text = text.slice(0, 80 * 1024);
            truncated = true;
          }
        } catch {
          // Binary file misidentified — skip text extraction
        }
      }

      results.push({ name, type: mime, size, text, truncated });
    }

    if (!results.length) {
      return Response.json(
        { error: "未收到有效的文件" },
        { status: 400 },
      );
    }

    return Response.json(
      { files: results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "文件上传处理失败";
    return Response.json(
      { error: message },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
