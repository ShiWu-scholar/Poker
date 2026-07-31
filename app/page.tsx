"use client";

import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Bot,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Cloud,
  Download,
  FilePlus2,
  FolderPlus,
  GitBranch,
  Globe2,
  HardDrive,
  Hexagon,
  Languages,
  LayoutPanelLeft,
  Lock,
  LogIn,
  Mail,
  Menu,
  MessageCircle,
  Network,
  Paperclip,
  Plus,
  Send,
  Settings,
  Sparkles,
  Trash2,
  UserRound,
  X,
  Zap,
} from "lucide-react";
import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  createElement,
  isValidElement,
  cloneElement,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import { lowlight } from "lowlight/lib/common";

import "katex/dist/katex.min.css";

type ModalName = "settings" | "account" | "guide" | "folder" | null;
type ThemeName = "light" | "dark";
type ApiConnectionStatus = "idle" | "checking" | "connected" | "error";

type TurnAttachment = {
  name: string;
  type: string;
  size: number;
};

type ChatTurn = {
  id: number;
  title: string;
  body: React.ReactNode;
  user?: string;
  assistantText?: string;
  attachments?: TurnAttachment[];
};

type BranchKind = "root" | "child" | "divergent" | "branch";

type TermAnnotation = {
  text: string;
  start: number;
  end: number;
  canonicalKey: string;
  suggestedQuestion: string;
};

type AiReplyPayload = {
  answer: string;
  terms: TermAnnotation[];
  providerModel?: string;
};

type SseDeltaEvent = { type: "delta"; content: string };
type SseTermsEvent = { type: "terms"; terms: TermAnnotation[]; providerModel?: string };
type SseErrorEvent = { type: "error"; message: string };
type SseEvent = SseDeltaEvent | SseTermsEvent | SseErrorEvent;

type AttachmentFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  text?: string;
  truncated: boolean;
  uploading: boolean;
};

type ConversationCardState = {
  id: string;
  title: string;
  parentId: string | null;
  linkKey?: string;
  kind: BranchKind;
  turns: ChatTurn[];
};

const initialTurns: ChatTurn[] = [
  {
    id: 1,
    title: "点击该轮对话以展开",
    body: (
      <p>
        Explore 里会把上文的对话自动折叠起来，方便你快速定位。将鼠标悬浮在右侧导航上，也可以快速跳转到任意一轮对话。
      </p>
    ),
  },
  {
    id: 2,
    title: "应用设置介绍 · 颜色主题与语言",
    body: (
      <>
        <h3>🎨 颜色主题</h3>
        <p>你可以在设置中切换不同的颜色主题，获得最舒适的对话阅读体验。</p>
        <h3>🌐 语言设置</h3>
        <p>选择你喜欢的语言，AI 会默认遵循该语言与你交流。</p>
      </>
    ),
  },
  {
    id: 3,
    title: "应用功能介绍 · 层级对话与文献阅读",
    user: "Hi!",
    body: (
      <>
        <div className="thinking">
          <span>
            <Sparkles size={14} /> 思考完成
          </span>
          <span>11s</span>
        </div>
        <h2>欢迎来到 Explore！</h2>
        <p className="lead">Explore，与 AI 一起探索一切。</p>
        <p>
          Explore 可以让你和 AI 更高效地交流，在这里进行深度学习、思考与创作，并通过卡片保留每一条探索路径。
        </p>
        <h3>🧠 层级对话</h3>
        <p>
          使用卡片旁的三个创建按钮，生成深入、发散与平行分支。点击右侧思维宇宙中的节点，可在卡片之间切换。
        </p>
        <h3>✨ 哪里不懂点哪里</h3>
        <p>
          选择回答里的术语，创建新的子卡片继续追问，直到完全理解。重要内容可以被引用、收藏或整理进项目。
        </p>
        <h3>📖 零阻力文献阅读</h3>
        <p>
          上传文档后，内容会被拆分为便于阅读的段落，并保留同样的层级探索体验。
        </p>
        <h3>🌌 思维宇宙</h3>
        <p>
          用自己的语言表达理解，逐步把知识节点连接成属于你的思维网络。
        </p>
      </>
    ),
  },
];

const settingTabs = [
  "可用模型",
  "模型分配",
  "颜色主题",
  "修改权限",
  "快捷键",
  "自动引用",
  "语言",
  "布局",
];

const modelOptions = [
  ["deepseek-v4-flash-202605/reasoner", "Tencent TokenHub · Built-in model", "×0.3"],
  ["deepseek-v4-flash-202605/chat", "Tencent TokenHub · Built-in model", "×0.3"],
  ["Step-3.5-Flash", "AIPing · Enough for simple tasks", "×0.2"],
  ["qwen3.5-flash/reasoner", "Fast vision and functional model", "×0.2"],
];

const themeOptions: { key: ThemeName; name: string; colors: string[] }[] = [
  { key: "light", name: "雅黑 · 白", colors: ["#ffffff", "#f2f2f2", "#111111"] },
  { key: "dark", name: "雅黑 · 黑", colors: ["#090909", "#1d1d1d", "#ffffff"] },
];

// Default API configuration used when no credentials are stored yet,
// so quick debugging works out of the box.
const DEFAULT_API_URL = "https://api.deepseek.com/";
const DEFAULT_API_MODEL = "deepseek-v4-flash";
const DEFAULT_API_KEY = "sk-9344648bf24d4d93a183b180f99dfc4f";

const presetReplies = [
  {
    lead: "这个问题可以继续拆开分析，建议先从",
    phrase: "概念背后的因果链",
    tail: "开始建立新的探索分支。",
  },
  {
    lead: "如果换一个角度，我们还可以比较",
    phrase: "不同方案的边界条件",
    tail: "，看看结论会怎样变化。",
  },
  {
    lead: "接下来值得单独整理",
    phrase: "实际应用中的关键例子",
    tail: "，用具体情境验证当前理解。",
  },
  {
    lead: "为了让推理更完整，可以进一步追踪",
    phrase: "这个判断依赖的隐藏假设",
    tail: "，并为它创建一张深入卡片。",
  },
];

function getTreeDepth(
  cardId: string,
  byId: Map<string, ConversationCardState>,
  cache: Map<string, number>,
): number {
  const cached = cache.get(cardId);
  if (cached !== undefined) return cached;
  const card = byId.get(cardId);
  if (!card?.parentId || !byId.has(card.parentId)) {
    cache.set(cardId, 0);
    return 0;
  }
  const depth = 1 + getTreeDepth(card.parentId, byId, cache);
  cache.set(cardId, depth);
  return depth;
}

function buildCardStackLayout(cards: ConversationCardState[], activeCardId: string) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const childrenByParent = new Map<string, ConversationCardState[]>();
  for (const card of cards) {
    if (!card.parentId) continue;
    const siblings = childrenByParent.get(card.parentId) ?? [];
    siblings.push(card);
    childrenByParent.set(card.parentId, siblings);
  }
  const depthCache = new Map<string, number>();
  const activePath: ConversationCardState[] = [];
  const visited = new Set<string>();
  let cursor = byId.get(activeCardId);
  while (cursor && !visited.has(cursor.id)) {
    activePath.unshift(cursor);
    visited.add(cursor.id);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  const pathIds = new Set(activePath.map((card) => card.id));
  const ancestors = activePath.slice(0, -1).reverse();
  const pathCards = ancestors.slice(0, 2).map((card, index) => {
    const distance = index + 1;
    const y = -36 - index * 42;
    return {
      card,
      depth: getTreeDepth(card.id, byId, depthCache),
      distance,
      x: -distance * 7,
      y,
      rotation: 0,
      scale: 1 - distance * 0.012,
      hoverY: y - 12,
      zIndex: 30 - distance,
      opacity: 0.94 - distance * 0.07,
    };
  });

  const countSubtree = (cardId: string, seen = new Set<string>()): number => {
    if (seen.has(cardId)) return 0;
    seen.add(cardId);
    return (
      1 +
      (childrenByParent.get(cardId) ?? []).reduce(
        (total, child) => total + countSubtree(child.id, seen),
        0,
      )
    );
  };

  const branchDocks: Array<{
    card: ConversationCardState;
    parentTitle: string;
    totalCards: number;
    side: "left" | "right";
    pathDistance: number;
  }> = [];

  activePath.forEach((parent, pathIndex) => {
    const offPathChildren = (childrenByParent.get(parent.id) ?? []).filter(
      (child) => !pathIds.has(child.id),
    );
    const pathDistance = activePath.length - 1 - pathIndex;
    offPathChildren.forEach((card, branchIndex) => {
      const side =
        offPathChildren.length === 1
          ? pathDistance % 2 === 0
            ? "right"
            : "left"
          : branchIndex % 2 === 0
            ? "left"
            : "right";
      branchDocks.push({
        card,
        parentTitle: parent.title,
        totalCards: countSubtree(card.id),
        side,
        pathDistance,
      });
    });
  });

  cards
    .filter((card) => !card.parentId && !pathIds.has(card.id))
    .forEach((card, index) => {
      branchDocks.push({
        card,
        parentTitle: "其他主卡片",
        totalCards: countSubtree(card.id),
        side: index % 2 === 0 ? "left" : "right",
        pathDistance: activePath.length,
      });
    });

  branchDocks.sort(
    (a, b) => a.pathDistance - b.pathDistance || cards.indexOf(a.card) - cards.indexOf(b.card),
  );

  return {
    pathCards,
    deepAncestors: ancestors.slice(2),
    branchDocks,
  };
}

function buildUniverseLayout(cards: ConversationCardState[], activeCardId: string) {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const childrenByParent = new Map<string, ConversationCardState[]>();
  for (const card of cards) {
    if (!card.parentId) continue;
    const children = childrenByParent.get(card.parentId) ?? [];
    children.push(card);
    childrenByParent.set(card.parentId, children);
  }
  const depthCache = new Map<string, number>();
  const positions = new Map<string, { x: number; y: number }>();
  const roots = cards.filter((card) => !card.parentId || !byId.has(card.parentId));
  const activePathIds = new Set<string>();
  let activeCursor = byId.get(activeCardId);
  while (activeCursor && !activePathIds.has(activeCursor.id)) {
    activePathIds.add(activeCursor.id);
    activeCursor = activeCursor.parentId ? byId.get(activeCursor.parentId) : undefined;
  }

  const leafGap = 78;
  const sidePadding = 48;
  let leafIndex = 0;
  const placeSubtree = (card: ConversationCardState): number => {
    const children = childrenByParent.get(card.id) ?? [];
    const childXs = children.map((child) => placeSubtree(child));
    const x =
      childXs.length > 0
        ? (childXs[0] + childXs[childXs.length - 1]) / 2
        : sidePadding + leafIndex++ * leafGap;
    const depth = getTreeDepth(card.id, byId, depthCache);
    positions.set(card.id, { x, y: 54 + depth * 112 });
    return x;
  };

  roots.forEach((root) => placeSubtree(root));
  cards.filter((card) => !positions.has(card.id)).forEach((card) => placeSubtree(card));

  const rawWidth = Math.max(96, sidePadding * 2 + Math.max(0, leafIndex - 1) * leafGap);
  const canvasWidth = Math.max(225, rawWidth);
  const horizontalShift = (canvasWidth - rawWidth) / 2;
  positions.forEach((position, cardId) => {
    positions.set(cardId, { ...position, x: position.x + horizontalShift });
  });
  const maximumDepth = Math.max(
    0,
    ...cards.map((card) => getTreeDepth(card.id, byId, depthCache)),
  );

  return {
    canvasWidth,
    canvasHeight: Math.max(620, 118 + maximumDepth * 112),
    nodes: cards.map((card) => ({
      card,
      depth: getTreeDepth(card.id, byId, depthCache),
      position: positions.get(card.id) ?? { x: canvasWidth / 2, y: 54 },
      parentPosition: card.parentId ? positions.get(card.parentId) ?? null : null,
      parentTitle: card.parentId ? byId.get(card.parentId)?.title ?? "未知父卡片" : null,
      isOnActivePath: activePathIds.has(card.id),
    })),
  };
}

function IconButton({
  label,
  children,
  danger,
  active,
  disabled,
  onClick,
}: {
  label: string;
  children: React.ReactNode;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={`icon-button${danger ? " danger" : ""}${active ? " active" : ""}`}
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ModalShell({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal-shell${wide ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="eyebrow">EXPLORE</span>
            <h2>{title}</h2>
          </div>
          <IconButton label="关闭" onClick={onClose}>
            <X size={19} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}

// --- lowlight / highlight.js setup ---
// lowlight/lib/common provides a pre-populated Lowlight instance
// bundled with ~35 common languages.
const lowlightInstance = lowlight;

function highlightCode(code: string, language: string): React.ReactNode {
  // The lowlight instance from "lowlight/lib/common" comes pre-bundled
  // with ~35 common languages (javascript, python, bash, etc.).
  if (!lowlightInstance.registered(language)) {
    return <code>{code}</code>;
  }
  try {
    const root = lowlightInstance.highlight(language, code);
    return createLowlightElement(root);
  } catch {
    return <code>{code}</code>;
  }
}

function MarkdownCode({
  className,
  children,
  ...props
}: {
  className?: string;
  children?: React.ReactNode;
  inline?: boolean;
}) {
  const match = /language-(\w+)/.exec(className || "");
  if (match && match[1] === "mermaid") {
    return <MermaidBlock code={String(children).replace(/\n$/, "")} />;
  }
  const language = match ? match[1] : undefined;
  if (!props.inline && language) {
    try {
      return highlightCode(String(children).replace(/\n$/, ""), language);
    } catch {
      // Fall through to plain pre/code
    }
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

function createLowlightElement(tree: unknown): React.ReactNode {
  const root = tree as {
    type?: string;
    value?: string;
    tagName?: string;
    properties?: { className?: string[] };
    children?: typeof root[];
  };
  if (!root) return null;
  if (root.type === "text" || root.type === undefined) {
    return String(root.value ?? "");
  }
  if (root.type === "element") {
    const tag = root.tagName ?? "span";
    const cls = root.properties?.className?.join(" ") || undefined;
    const children = root.children
      ? root.children.map((child, index) =>
          // Give each list child a stable key to satisfy React.
          addLowlightKey(createLowlightElement(child), index),
        )
      : null;
    return createElement(tag, { className: cls }, children);
  }
  if (root.children) {
    return root.children.map((child, index) =>
      addLowlightKey(createLowlightElement(child), index),
    );
  }
  return null;
}

function addLowlightKey(node: React.ReactNode, index: number): React.ReactNode {
  if (isValidElement(node)) {
    return cloneElement(node, { key: index });
  }
  return node;
}

// Math environment names that KaTeX supports as top-level display math.
// These get wrapped in $$ ... $$ when the model emits them bare.
const MATH_ENV_PATTERN =
  "equation\\*?|align\\*?|aligned|gather\\*?|gathered|alignat\\*?|cases|dcases|rcases|drcases|matrix\\*?|[pbBVv]matrix\\*?|smallmatrix|CD";

/**
 * Finds the end index of the first complete paragraph at or after `from`.
 * A paragraph ends at a blank line ("\n\n") or at a newline that begins a
 * heading/list marker ("\n## ", "\n- ", "\n1. ", "\n> ", "\n```").
 * Returns -1 when no complete paragraph boundary exists yet (still streaming).
 */
function findParagraphBoundary(
  text: string,
  from: number,
): number {
  // Blank-line separator — the canonical paragraph break.
  const blank = text.indexOf("\n\n", from);
  if (blank >= 0) return blank;

  // Newline followed by a block-level marker on the next line.
  const marker = /(?:\r?\n)(?=[#>|`\-\d]+[\s.])/g;
  marker.lastIndex = from;
  const m = marker.exec(text);
  if (m && m.index >= from) return m.index;

  return -1;
}

/**
 * Normalizes the various LaTeX math delimiters AI models output into the
 * $-style delimiters remark-math understands:
 *
 *   \( ... \)                 → $ ... $           (inline)
 *   \[ ... \]                 → $$\n...\n$$       (display)
 *   \begin{env}...\end{env}   → $$\n\begin{...}...\end{...}\n$$   (bare env)
 *
 * Robustness for streaming:
 *   - Code blocks and inline code are extracted first so $-signs or \begin
 *     inside them are never rewritten.
 *   - Unclosed \[ or \( are left untouched (safe while a stream is mid-formula;
 *     the next delta re-renders and completes the conversion).
 *   - Idempotent: already-$$-wrapped environments are not double-wrapped.
 */
function normalizeMathDelimiters(source: string): string {
  // 1. Protect code regions (fenced blocks + inline code) with placeholders.
  const protectedBlocks: string[] = [];
  const codePattern =
    /```[\s\S]*?```|`[^`\n]*`|~{2,}[\s\S]*?~{2,}/g;
  let result = source.replace(codePattern, (match) => {
    protectedBlocks.push(match);
    return ` MATHCODE${protectedBlocks.length - 1} `;
  });

  // 2. Display math: \[ ... \] → $$\n...\n$$  (dotAll, non-greedy)
  result = result.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`,
  );

  // 3. Inline math: \( ... \) → $ ... $  (single-line body, non-greedy)
  result = result.replace(
    /\\\(([^\n]*?)\\\)/g,
    (_match, body: string) => `$${body.trim()}$`,
  );

  // 4. Bare \begin{env}...\end{env} → wrap in $$ ... $$ unless already wrapped.
  const envRegex = new RegExp(
    `(?<![$])(^|\\n\\n)\\\\begin\\{(${MATH_ENV_PATTERN})\\}([\\s\\S]*?)\\\\end\\{\\2\\}(\\n\\n|$)(?![$])`,
    "g",
  );
  result = result.replace(
    envRegex,
    (_match, before: string, envName: string, body: string, after: string) =>
      `${before}\n$$\n\\begin{${envName}}${body}\\end{${envName}}\n$$\n${after}`,
  );

  // 5. Restore code blocks.
  result = result.replace(/ MATHCODE(\d+) /g, (_match, index) => {
    return protectedBlocks[Number(index)] ?? "";
  });

  return result;
}

/**
 * Returns true if the character range [start, end) lies entirely inside a
 * math formula (…$…$, $$…$$, \(…\), \[…\], or \begin{env}…\end{env}).
 * Used to skip term-tag injection inside formulas — injecting <term> inside
 * the $ delimiters makes remark-math mis-parse the math boundary, leaving a
 * literal <term> tag behind and corrupting the formula.
 */
function isInsideFormula(source: string, start: number, end: number): boolean {
  const mathPattern =
    /\$\$[\s\S]*?\$\$|\$[^$\n]*\$|\\\([^)]*\\\)|\\\[[\s\S]*?\\\]|\\begin\{([^}]+)\}[\s\S]*?\\end\{\1\}/g;
  let m: RegExpExecArray | null;
  while ((m = mathPattern.exec(source)) !== null) {
    const fStart = m.index;
    const fEnd = m.index + m[0].length;
    if (start >= fStart && end <= fEnd) return true;
  }
  return false;
}

// Shared markdown renderer used both during streaming and for final answers.
// KaTeX runs with throwOnError disabled so incomplete/partial formulas that
// arrive mid-stream degrade to their LaTeX source instead of crashing.
function MarkdownBody({ source }: { source: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeKatex, { throwOnError: false, strict: false }],
      ]}
      components={{ code: MarkdownCode }}
    >
      {normalizeMathDelimiters(source)}
    </ReactMarkdown>
  );
}

/**
 * Prepares an answer string for annotated rendering:
 *  1. normalizes math delimiters (so term offsets match parsed text),
 *  2. re-locates each term in the normalized text (skipping terms that fall
 *     inside formulas or vanished after normalization),
 *  3. injects <term data-index="i">…</term> tags.
 * Returns the processed string plus an index → term map for the renderer.
 */
function injectTermTags(
  answer: string,
  terms: TermAnnotation[],
): { processed: string; placedByIndex: Map<number, TermAnnotation> } {
  const normalizedAnswer = normalizeMathDelimiters(answer);

  const seenSpans = new Set<string>();
  const sortedTerms = [...terms]
    .sort((a, b) => b.start - a.start)
    .filter((t) => {
      const key = `${t.start}:${t.text}`;
      if (seenSpans.has(key)) return false;
      seenSpans.add(key);
      return true;
    });

  const placedTerms: { term: TermAnnotation; start: number; end: number }[] = [];
  for (const t of sortedTerms) {
    const searchFrom = Math.max(
      0,
      Math.min(t.start, normalizedAnswer.length - t.text.length),
    );
    let relStart = normalizedAnswer.indexOf(t.text, searchFrom);
    if (relStart < 0) relStart = normalizedAnswer.indexOf(t.text);
    if (relStart < 0) continue;
    const relEnd = relStart + t.text.length;
    if (isInsideFormula(normalizedAnswer, relStart, relEnd)) continue;
    placedTerms.push({ term: t, start: relStart, end: relEnd });
  }

  const sortedByStartDesc = [...placedTerms].sort((a, b) => b.start - a.start);
  let processed = normalizedAnswer;
  for (let i = 0; i < sortedByStartDesc.length; i++) {
    const { start, end } = sortedByStartDesc[i];
    processed =
      processed.slice(0, start) +
      `<term data-index="${i}">${processed.slice(start, end)}</term>` +
      processed.slice(end);
  }
  const placedByIndex = new Map<number, TermAnnotation>();
  sortedByStartDesc.forEach((p, index) => placedByIndex.set(index, p.term));
  return { processed, placedByIndex };
}

/** Shared <term> → clickable button mapping used by both renderers. */
function TermButtonMapper({
  placedByIndex,
  onTermClick,
}: {
  placedByIndex: Map<number, TermAnnotation>;
  onTermClick: (term: TermAnnotation) => void;
}) {
  return (function TermMapping({
    children,
    "data-index": dataIndex,
  }: {
    children?: React.ReactNode;
    "data-index"?: string;
  }) {
    const index = Number(dataIndex);
    const term = placedByIndex.get(index);
    if (term) {
      return (
        <button
          type="button"
          className="branch-phrase"
          title={`创建深入卡片：${term.suggestedQuestion}`}
          onClick={() => onTermClick(term)}
        >
          {term.text}
        </button>
      );
    }
    return <>{children}</>;
  });
}

function AnnotatedReply({
  answer,
  terms,
  modelLabel,
  networkEnabled,
  demo,
  onTermClick,
}: {
  answer: string;
  terms: TermAnnotation[];
  modelLabel: string;
  networkEnabled: boolean;
  demo?: boolean;
  onTermClick: (term: TermAnnotation) => void;
}) {
  const { processed, placedByIndex } = injectTermTags(answer, terms);

  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeKatex, { throwOnError: false, strict: false }],
        ]}
        components={{
          code: MarkdownCode,
          term: TermButtonMapper({ placedByIndex, onTermClick }),
        } as React.ComponentProps<typeof ReactMarkdown>["components"]}
      >
        {processed}
      </ReactMarkdown>
      <p className="muted-copy">
        点击带下划线的专业名词即可弹起一张新卡片 · 当前模型：{modelLabel}
        {networkEnabled ? " · 已启用联网" : ""}
        {demo ? " · 演示回复" : ""}
      </p>
    </>
  );
}

/**
 * Streaming variant of AnnotatedReply: renders the live markdown body with
 * whatever terms have been discovered so far, plus the blinking cursor.
 * Used DURING streaming so paragraph term results appear incrementally while
 * the body keeps flowing (and critically, does NOT set assistantText, so the
 * streaming flush interval keeps updating the turn).
 */
function StreamingAnnotatedReply({
  answer,
  terms,
  onTermClick,
}: {
  answer: string;
  terms: TermAnnotation[];
  onTermClick: (term: TermAnnotation) => void;
}) {
  const { processed, placedByIndex } = injectTermTags(answer, terms);

  return (
    <div className="streaming-answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeKatex, { throwOnError: false, strict: false }],
        ]}
        components={{
          code: MarkdownCode,
          term: TermButtonMapper({ placedByIndex, onTermClick }),
        } as React.ComponentProps<typeof ReactMarkdown>["components"]}
      >
        {processed}
      </ReactMarkdown>
      <span className="streaming-cursor" />
    </div>
  );
}

function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("mermaid")
      .then((mermaid) => {
        if (cancelled) return;
        mermaid.default.initialize({ startOnLoad: false, theme: "neutral" });
        mermaid.default
          .render(`mermaid-${Date.now()}`, code)
          .then(({ svg: rendered }) => {
            if (!cancelled) setSvg(rendered);
          })
          .catch(() => {
            if (!cancelled) setError(true);
          });
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) return <pre><code>{code}</code></pre>;
  if (!svg)
    return (
      <div className="typing-line">
        <span />
        <span />
        <span />
      </div>
    );
  return (
    <div
      className="mermaid-container"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

function StreamingReply({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="typing-line">
        <span />
        <span />
        <span />
      </div>
    );
  }
  // Render the full markdown live during streaming so headers, lists,
  // tables, formulas and code blocks appear as soon as they complete,
  // instead of waiting for the whole response then re-rendering.
  // The blinking cursor is appended after the content.
  return (
    <div className="streaming-answer">
      <MarkdownBody source={text} />
      <span className="streaming-cursor" />
    </div>
  );
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [universeOpen, setUniverseOpen] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [settingsTab, setSettingsTab] = useState("可用模型");
  const [theme, setTheme] = useState<ThemeName>("light");
  const [storage, setStorage] = useState<"local" | "cloud">("local");
  const [modelOpen, setModelOpen] = useState(false);
  const [model, setModel] = useState("Step-3.5-Flash");
  const [apiUrl, setApiUrl] = useState(DEFAULT_API_URL);
  const [apiKey, setApiKey] = useState(DEFAULT_API_KEY);
  const [apiModel, setApiModel] = useState(DEFAULT_API_MODEL);
  const [apiConnectionStatus, setApiConnectionStatus] =
    useState<ApiConnectionStatus>("idle");
  const [apiConnectionMessage, setApiConnectionMessage] = useState(
    "保存设置后将自动检验连接",
  );
  const [sending, setSending] = useState(false);
  const [networkEnabled, setNetworkEnabled] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [cards, setCards] = useState<ConversationCardState[]>([
    {
      id: "intro-main",
      title: "应用介绍",
      parentId: null,
      kind: "root",
      turns: initialTurns,
    },
  ]);
  const [activeCardId, setActiveCardId] = useState("intro-main");
  const [backgroundCardId, setBackgroundCardId] = useState<string | null>(null);
  const cardsRef = useRef(cards);
  const activeCardIdRef = useRef(activeCardId);
  const branchTargetRef = useRef(new Map<string, string>());
  const [message, setMessage] = useState("");
  const [projects, setProjects] = useState(["应用介绍"]);
  const [activeProject, setActiveProject] = useState("应用介绍");
  const [folderName, setFolderName] = useState("");
  const [toast, setToast] = useState("");
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const uploadingRef = useRef(false);
  const pendingAttachmentContextRef = useRef("");
  // Per-card streaming state. Each card gets its own slot so concurrent
  // streams (e.g. a parent card still streaming while a term-card is spawned)
  // render independently without overwriting each other.
  const streamingRefs = useRef(
    new Map<
      string,
      { text: string; dirty: boolean; turnId: number; terms: TermAnnotation[] }
    >(),
  );
  const [loginMode, setLoginMode] = useState<"login" | "register">("login");
  const [cardOffset, setCardOffset] = useState({ x: 0, y: 0 });
  const [universeView, setUniverseView] = useState({ scale: 1, x: 0, y: 0 });
  const [universeDragging, setUniverseDragging] = useState(false);
  const [enteringNodeIds, setEnteringNodeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const universePanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const attachmentRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);
  const universeCanvasRef = useRef<HTMLDivElement>(null);
  const modelPickerRef = useRef<HTMLDivElement>(null);
  const apiUrlInputRef = useRef<HTMLInputElement>(null);
  const apiConnectionTestRef = useRef(0);
  const sidebarCloseTimerRef = useRef<number | null>(null);
  const universeCloseTimerRef = useRef<number | null>(null);

  const layoutClass = useMemo(
    () =>
      `${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${
        universeOpen ? "universe-open" : "universe-closed"
      }`,
    [sidebarOpen, universeOpen],
  );
  const activeCard = useMemo(
    () => cards.find((card) => card.id === activeCardId) ?? cards[0],
    [activeCardId, cards],
  );
  const cardStackLayout = useMemo(
    () => buildCardStackLayout(cards, activeCardId),
    [activeCardId, cards],
  );
  const stackedCards = cardStackLayout.pathCards;
  const deepAncestors = cardStackLayout.deepAncestors;
  const leftBranchDocks = cardStackLayout.branchDocks.filter(
    (dock) => dock.side === "left",
  );
  const rightBranchDocks = cardStackLayout.branchDocks.filter(
    (dock) => dock.side === "right",
  );
  const universeTree = useMemo(
    () => buildUniverseLayout(cards, activeCardId),
    [activeCardId, cards],
  );
  const universeLayout = universeTree.nodes;
  const enteringParentIds = useMemo(
    () =>
      new Set(
        universeLayout
          .filter(({ card }) => enteringNodeIds.has(card.id) && card.parentId)
          .map(({ card }) => card.parentId as string),
      ),
    [enteringNodeIds, universeLayout],
  );
  const turns = activeCard?.turns ?? [];
  const apiConfigured = Boolean(
    apiUrl.trim() && apiKey.trim() && apiModel.trim(),
  );
  const apiStatusLabel =
    apiConnectionStatus === "checking"
      ? "检测中"
      : apiConnectionStatus === "connected"
        ? "连接正常"
        : apiConnectionStatus === "error"
          ? "连接失败"
          : apiConfigured
            ? "待检验"
            : "未配置";

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setApiUrl(window.localStorage.getItem("explore-api-url") ?? DEFAULT_API_URL);
      setApiModel(window.localStorage.getItem("explore-api-model") ?? DEFAULT_API_MODEL);
      setApiKey(window.sessionStorage.getItem("explore-api-key") ?? DEFAULT_API_KEY);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setModal(null);
        setModelOpen(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const closeFloatingMenus = (event: PointerEvent) => {
      if (
        modelOpen &&
        modelPickerRef.current &&
        !modelPickerRef.current.contains(event.target as Node)
      ) {
        setModelOpen(false);
      }
    };
    window.addEventListener("pointerdown", closeFloatingMenus);
    return () => window.removeEventListener("pointerdown", closeFloatingMenus);
  }, [modelOpen]);

  useEffect(() => {
    if (!universeOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const canvas = universeCanvasRef.current;
      const selectedNode = universeLayout.find(({ card }) => card.id === activeCardId);
      if (!canvas || !selectedNode) return;
      setUniverseView((current) => ({
        ...current,
        x: canvas.clientWidth / 2 - selectedNode.position.x * current.scale,
        y: canvas.clientHeight / 2 - selectedNode.position.y * current.scale,
      }));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [
    activeCardId,
    universeOpen,
    universeLayout,
    universeTree.canvasHeight,
    universeTree.canvasWidth,
  ]);

  const zoomUniverseAt = (nextScale: number, anchorX: number, anchorY: number) => {
    setUniverseView((current) => {
      const scale = Math.max(0.5, Math.min(2.25, nextScale));
      const contentX = (anchorX - current.x) / current.scale;
      const contentY = (anchorY - current.y) / current.scale;
      return {
        scale,
        x: anchorX - contentX * scale,
        y: anchorY - contentY * scale,
      };
    });
  };

  const handleUniverseWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorX = event.clientX - rect.left;
    const anchorY = event.clientY - rect.top;
    const zoomFactor = Math.exp(-event.deltaY * 0.0014);
    zoomUniverseAt(universeView.scale * zoomFactor, anchorX, anchorY);
  };

  const beginUniversePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      (event.target as HTMLElement).closest(".mind-node, .universe-viewport-tools")
    ) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    universePanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: universeView.x,
      originY: universeView.y,
    };
    setUniverseDragging(true);
  };

  const moveUniversePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pan = universePanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    setUniverseView((current) => ({
      ...current,
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    }));
  };

  const endUniversePan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (universePanRef.current?.pointerId !== event.pointerId) return;
    universePanRef.current = null;
    setUniverseDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const changeUniverseZoom = (factor: number) => {
    const canvas = universeCanvasRef.current;
    if (!canvas) return;
    zoomUniverseAt(
      universeView.scale * factor,
      canvas.clientWidth / 2,
      canvas.clientHeight / 2,
    );
  };

  const resetUniverseView = () => {
    const canvas = universeCanvasRef.current;
    const selectedNode = universeLayout.find(({ card }) => card.id === activeCardId);
    if (!canvas || !selectedNode) return;
    setUniverseView({
      scale: 1,
      x: canvas.clientWidth / 2 - selectedNode.position.x,
      y: canvas.clientHeight / 2 - selectedNode.position.y,
    });
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragRef.current) return;
      const { x, y, ox, oy } = dragRef.current;
      setCardOffset({
        x: Math.max(-170, Math.min(170, ox + event.clientX - x)),
        y: Math.max(-80, Math.min(80, oy + event.clientY - y)),
      });
    };
    const up = () => {
      dragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  useEffect(
    () => () => {
      if (sidebarCloseTimerRef.current !== null) {
        window.clearTimeout(sidebarCloseTimerRef.current);
      }
      if (universeCloseTimerRef.current !== null) {
        window.clearTimeout(universeCloseTimerRef.current);
      }
    },
    [],
  );

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      ox: cardOffset.x,
      oy: cardOffset.y,
    };
  };

  const notify = (text: string) => setToast(text);

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const incoming = Array.from(fileList);
    const pending: AttachmentFile[] = incoming.map((file) => ({
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      uploading: true,
      truncated: false,
    }));

    setAttachments((current) => [...current, ...pending]);

    for (let i = 0; i < incoming.length; i++) {
      const file = incoming[i];
      const pendingId = pending[i].id;
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const result = (await response.json()) as {
          error?: string;
          files?: Array<{
            name: string;
            type: string;
            size: number;
            text?: string;
            truncated: boolean;
          }>;
        };
        if (!response.ok) {
          throw new Error(result.error || "上传失败");
        }
        const uploaded = result.files?.[0];
        setAttachments((current) =>
          current.map((att) =>
            att.id === pendingId
              ? {
                  ...att,
                  uploading: false,
                  text: uploaded?.text,
                  truncated: uploaded?.truncated ?? false,
                }
              : att,
          ),
        );
      } catch (error) {
        setAttachments((current) =>
          current.filter((att) => att.id !== pendingId),
        );
        const message =
          error instanceof Error ? error.message : "文件上传失败";
        notify(`上传失败：${message}`);
      }
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => current.filter((att) => att.id !== id));
  };

  const clearAttachments = () => setAttachments([]);

  const uploadDocumentAndCreateCard = async (file: File) => {
    notify(`正在处理文档：${file.name}…`);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as {
        error?: string;
        files?: Array<{
          name: string;
          type: string;
          size: number;
          text?: string;
          truncated: boolean;
        }>;
      };
      if (!response.ok) {
        throw new Error(result.error || "文档上传失败");
      }
      const uploaded = result.files?.[0];
      if (!uploaded) throw new Error("未收到文档内容");

      const docTurns: ChatTurn[] = [];
      if (uploaded.text) {
        // Split text by double-newline into paragraphs for reading turns
        const paragraphs = uploaded.text
          .split(/\n{2,}/)
          .map((para) => para.trim())
          .filter((para) => para.length > 0);
        if (paragraphs.length > 0) {
          const chunks: string[] = [];
          let chunk = "";
          for (const para of paragraphs) {
            if (chunk && chunk.length + para.length > 1800) {
              chunks.push(chunk);
              chunk = para;
            } else {
              chunk = chunk ? `${chunk}\n\n${para}` : para;
            }
          }
          if (chunk) chunks.push(chunk);

          docTurns.push(
            ...chunks.map((text, index) => {
              const id = Date.now() + index;
              const preview = text.slice(0, 42).replace(/\n/g, " ");
              return {
                id,
                title: chunks.length === 1
                  ? `文档内容 · ${uploaded.name}`
                  : `第 ${index + 1}/${chunks.length} 段 · ${preview}…`,
                body: (
                  <>
                    {chunks.length > 1 && (
                      <div className="thinking">
                        <span>
                          <Sparkles size={14} /> 段落 {index + 1} / {chunks.length}
                        </span>
                        <span>{uploaded.name}</span>
                      </div>
                    )}
                    {text.split("\n").map((line, lineIndex) => (
                      <p key={lineIndex}>{line || " "}</p>
                    ))}
                  </>
                ),
              };
            }),
          );
        }
      }
      if (docTurns.length === 0) {
        // Binary file or unreadable text
        docTurns.push({
          id: Date.now(),
          title: `文档 · ${uploaded.name}`,
          body: (
            <>
              <p>
                文件 <strong>{uploaded.name}</strong>（{formatFileSize(uploaded.size)}
                ）已上传。
              </p>
              <p className="muted-copy">
                此文件为{uploaded.type.split("/")[0] === "text" ? "文本" : "二进制"}格式
                {uploaded.type ? `（${uploaded.type}）` : ""}
                ，无法直接提取文本内容进行分段阅读。
              </p>
            </>
          ),
        });
      }

      const title = `文档 · ${uploaded.name}`;
      const cardId = `root-${Date.now()}`;
      const nextCard: ConversationCardState = {
        id: cardId,
        title,
        parentId: null,
        kind: "root",
        turns: docTurns,
      };
      const nextCards = [nextCard];
      branchTargetRef.current.clear();
      markUniverseNodeEntering(cardId);
      commitCards(nextCards);
      commitActiveCard(cardId);
      setBackgroundCardId(null);
      resetCardView();
      setActiveProject(title);
      setProjects((current) =>
        current.includes(title) ? current : [...current, title],
      );
      if (isMobileViewport()) setSidebarOpen(false);
      notify(
        uploaded.text
          ? `已解析文档「${uploaded.name}」为 ${docTurns.length} 个段落`
          : `已上传「${uploaded.name}」`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "文档处理失败";
      notify(`文档处理失败：${message}`);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const resetApiConnectionStatus = () => {
    apiConnectionTestRef.current += 1;
    setApiConnectionStatus("idle");
    setApiConnectionMessage("设置已更改，请重新保存并检验");
  };

  const saveApiSettings = async (event: FormEvent) => {
    event.preventDefault();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(apiUrl.trim());
    } catch {
      setApiConnectionStatus("error");
      setApiConnectionMessage("API URL 格式无效");
      notify("请输入完整、有效的 API URL");
      apiUrlInputRef.current?.focus();
      return;
    }
    if (parsedUrl.protocol !== "https:") {
      setApiConnectionStatus("error");
      setApiConnectionMessage("API URL 必须使用 HTTPS");
      notify("API URL 必须使用 HTTPS");
      apiUrlInputRef.current?.focus();
      return;
    }
    if (!apiKey.trim() || !apiModel.trim()) {
      setApiConnectionStatus("error");
      setApiConnectionMessage("API Key 与模型 ID 不能为空");
      notify("请完整填写 API Key 与模型 ID");
      return;
    }
    window.localStorage.setItem("explore-api-url", parsedUrl.toString());
    window.localStorage.setItem("explore-api-model", apiModel.trim());
    window.sessionStorage.setItem("explore-api-key", apiKey.trim());
    setApiUrl(parsedUrl.toString());
    setApiModel(apiModel.trim());
    setModel(apiModel.trim());
    const testId = apiConnectionTestRef.current + 1;
    apiConnectionTestRef.current = testId;
    setApiConnectionStatus("checking");
    setApiConnectionMessage("正在验证地址、密钥与模型响应…");

    try {
      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: parsedUrl.toString(),
          apiKey: apiKey.trim(),
          model: apiModel.trim(),
          messages: [
            {
              role: "user",
              content: "请用一句简短中文确认连接测试成功。",
            },
          ],
        }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || "接口未通过连接检验");
      }
      if (apiConnectionTestRef.current !== testId) return;
      setApiConnectionStatus("connected");
      setApiConnectionMessage(`连接成功 · ${apiModel.trim()}`);
      notify("BYOK 接口已连接并启用");
    } catch (error) {
      if (apiConnectionTestRef.current !== testId) return;
      const message =
        error instanceof Error ? error.message : "接口未通过连接检验";
      setApiConnectionStatus("error");
      setApiConnectionMessage(message);
      notify("API 连接检验失败");
    }
  };

  const clearApiKey = () => {
    window.sessionStorage.removeItem("explore-api-key");
    setApiKey("");
    apiConnectionTestRef.current += 1;
    setApiConnectionStatus("idle");
    setApiConnectionMessage("API Key 已清除");
    notify("已清除本次会话中的 API Key");
  };

  const isMobileViewport = () => window.matchMedia("(max-width: 850px)").matches;
  const supportsHover = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  const clearPanelCloseTimer = (panel: "sidebar" | "universe") => {
    const timerRef = panel === "sidebar" ? sidebarCloseTimerRef : universeCloseTimerRef;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const closePanel = (panel: "sidebar" | "universe") => {
    clearPanelCloseTimer(panel);
    if (panel === "sidebar") setSidebarOpen(false);
    else setUniverseOpen(false);
  };

  const schedulePanelClose = (panel: "sidebar" | "universe") => {
    clearPanelCloseTimer(panel);
    if (!supportsHover()) return;
    const timerRef = panel === "sidebar" ? sidebarCloseTimerRef : universeCloseTimerRef;
    timerRef.current = window.setTimeout(() => {
      if (panel === "sidebar") setSidebarOpen(false);
      else setUniverseOpen(false);
      timerRef.current = null;
    }, 5000);
  };

  const collapseSidebars = () => {
    closePanel("sidebar");
    closePanel("universe");
  };

  const openSidebar = (autoClose = true) => {
    clearPanelCloseTimer("sidebar");
    if (isMobileViewport()) setUniverseOpen(false);
    setSidebarOpen(true);
    if (autoClose) schedulePanelClose("sidebar");
  };

  const toggleUniverse = () => {
    if (universeOpen) {
      closePanel("universe");
      return;
    }
    openUniverse();
  };

  const openUniverse = (autoClose = true) => {
    clearPanelCloseTimer("universe");
    if (isMobileViewport()) setSidebarOpen(false);
    setUniverseOpen(true);
    if (autoClose) schedulePanelClose("universe");

    // Wait for the CSS enter transition (~220ms) to finish so the canvas
    // has a real width before centering on the active card.
    const frame = window.requestAnimationFrame(() => {
      window.setTimeout(() => {
        const canvas = universeCanvasRef.current;
        const selectedNode = universeLayout.find(
          ({ card }) => card.id === activeCardId,
        );
        if (!canvas || !selectedNode) return;
        setUniverseView((current) => ({
          ...current,
          x: canvas.clientWidth / 2 - selectedNode.position.x * current.scale,
          y: canvas.clientHeight / 2 - selectedNode.position.y * current.scale,
        }));
      }, 250);
    });
  };

  const resetCardView = () => {
    setCardOffset({ x: 0, y: 0 });
    setFavorite(false);
  };

  const commitCards = (nextCards: ConversationCardState[]) => {
    cardsRef.current = nextCards;
    setCards(nextCards);
  };

  const commitActiveCard = (cardId: string) => {
    activeCardIdRef.current = cardId;
    setActiveCardId(cardId);
  };

  const markUniverseNodeEntering = (cardId: string) => {
    setEnteringNodeIds((current) => {
      const next = new Set(current);
      next.add(cardId);
      return next;
    });
  };

  const finishUniverseNodeEntering = (cardId: string) => {
    setEnteringNodeIds((current) => {
      if (!current.has(cardId)) return current;
      const next = new Set(current);
      next.delete(cardId);
      return next;
    });
  };

  const startCardSession = (title: string, initialCardTurns: ChatTurn[]) => {
    const cardId = `root-${Date.now()}`;
    const nextCards: ConversationCardState[] = [
      {
        id: cardId,
        title,
        parentId: null,
        kind: "root",
        turns: initialCardTurns,
      },
    ];
    branchTargetRef.current.clear();
    markUniverseNodeEntering(cardId);
    commitCards(nextCards);
    commitActiveCard(cardId);
    setBackgroundCardId(null);
    resetCardView();
  };

  const openQuickChat = (announcement = "已开启新对话") => {
    setActiveProject("新对话");
    setMessage("");
    startCardSession("新对话", []);
    if (isMobileViewport()) setSidebarOpen(false);
    notify(announcement);
  };

  const openProject = (project: string) => {
    setActiveProject(project);
    startCardSession(project, project === "应用介绍" ? initialTurns : []);
    if (isMobileViewport()) setSidebarOpen(false);
  };

  const createProject = () => {
    let nextNumber = 2;
    while (projects.includes(`未命名项目 ${nextNumber}`)) nextNumber += 1;
    const name = `未命名项目 ${nextNumber}`;
    setProjects((current) => [...current, name]);
    openProject(name);
    notify("已创建新项目");
  };

  const closeIntroCard = () => {
    openQuickChat("已关闭新手引导，可随时从项目列表重新打开");
  };

  const deleteProject = (project: string) => {
    setProjects((current) => current.filter((item) => item !== project));
    if (activeProject === project) {
      openQuickChat(
        project === "应用介绍" ? "已删除新手引导项目" : `已删除项目「${project}」`,
      );
      return;
    }
    notify(project === "应用介绍" ? "已删除新手引导项目" : `已删除项目「${project}」`);
  };

  const createFolder = (event: FormEvent) => {
    event.preventDefault();
    if (!folderName.trim()) return;
    notify(`已创建文件夹「${folderName.trim()}」`);
    setFolderName("");
    setModal(null);
  };

  const updateCardTurns = (
    cardId: string,
    updater: (current: ChatTurn[]) => ChatTurn[],
  ) => {
    commitCards(
      cardsRef.current.map((card) =>
        card.id === cardId ? { ...card, turns: updater(card.turns) } : card,
      ),
    );
  };

  // Stable ref for the streaming flush effect so it doesn't re-subscribe on every render
  const updateCardTurnsRef = useRef(updateCardTurns);
  updateCardTurnsRef.current = updateCardTurns;

  // Flush streaming text to React state at ~50ms intervals
  useEffect(() => {
    const interval = window.setInterval(() => {
      // Flush every card that has pending streaming deltas. Per-card state
      // means concurrent cards stream independently. If a card already has
      // terms, render the annotated streaming view so buttons persist while
      // the body keeps flowing.
      for (const [cardId, state] of streamingRefs.current) {
        if (!state.dirty) continue;
        state.dirty = false;
        updateCardTurnsRef.current(cardId, (turns) =>
          turns.map((turn) =>
            turn.id === state.turnId
              ? turn.assistantText
                ? turn
                : {
                    ...turn,
                    body:
                      state.terms.length > 0 ? (
                        <StreamingAnnotatedReply
                          answer={state.text}
                          terms={state.terms}
                          onTermClick={(term) =>
                            openAnnotatedBranch(cardId, turn.id, term)
                          }
                        />
                      ) : (
                        <StreamingReply text={state.text} />
                      ),
                  }
              : turn,
          ),
        );
      }
    }, 50);
    return () => window.clearInterval(interval);
  }, []);

  const activateCard = (cardId: string, announcement?: string) => {
    if (cardId === activeCardIdRef.current) return;
    const target = cardsRef.current.find((card) => card.id === cardId);
    if (!target) return;
    setBackgroundCardId(activeCardIdRef.current);
    commitActiveCard(cardId);
    setCardOffset({ x: 0, y: 0 });
    setFavorite(false);
    notify(announcement ?? `已切换至「${target.title}」`);
  };

  const createCard = (
    kind: Exclude<BranchKind, "root">,
    seedPhrase?: string,
    parentId?: string,
    linkKey?: string,
    titleOverride?: string,
    autoQuestion?: string,
  ) => {
    const currentCards = cardsRef.current;
    if (linkKey) {
      const linkedId = branchTargetRef.current.get(linkKey);
      const linkedCard =
        currentCards.find((card) => card.id === linkedId) ??
        currentCards.find((card) => card.linkKey === linkKey);
      if (linkedCard) {
        branchTargetRef.current.set(linkKey, linkedCard.id);
        activateCard(linkedCard.id, "已打开该短语关联的已有卡片");
        return;
      }
    }
    const activeSource =
      currentCards.find((card) => card.id === activeCardIdRef.current) ?? currentCards[0];
    const resolvedParentId =
      parentId ??
      (kind === "branch" && activeSource.parentId
        ? activeSource.parentId
        : activeSource.id);
    const parent =
      currentCards.find((card) => card.id === resolvedParentId) ??
      activeSource;
    if (!parent) return;
    const labels = {
      child: "深入卡片",
      divergent: "发散卡片",
      branch: "平行分支",
    };
    const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const title = titleOverride ?? seedPhrase ?? `${labels[kind]} ${currentCards.length}`;
    const seededTurns: ChatTurn[] = seedPhrase && !autoQuestion
      ? [
          {
            id: Date.now(),
            title: `继续探索 · ${seedPhrase}`,
            body: (
              <>
                <p>
                  这张卡片从「{parent.title}」分支而来，接下来将围绕
                  <strong>「{seedPhrase}」</strong>继续展开。
                </p>
                <p className="muted-copy">原卡片已保留在后方，可从思维宇宙随时切回。</p>
              </>
            ),
          },
        ]
      : [];
    const nextCard: ConversationCardState = {
      id,
      title,
      parentId: parent.id,
      linkKey,
      kind,
      turns: seededTurns,
    };
    if (linkKey) branchTargetRef.current.set(linkKey, id);
    markUniverseNodeEntering(id);
    commitCards([
      ...currentCards,
      nextCard,
    ]);
    setBackgroundCardId(parent.id);
    commitActiveCard(id);
    setCardOffset({ x: 0, y: 0 });
    setFavorite(false);
    notify(`已创建并打开${labels[kind]}`);
    if (autoQuestion) {
      // Pass the parent card's turns as invisible context so the term-spawned
      // card understands the term's situational context (what discussion the
      // term came from). Not shown to the user — only feeds the AI request.
      //
      // If the parent is still streaming, its current turn has no assistantText
      // yet (it's only set when the stream finishes). Supplement it with the
      // live streamed text from streamingRefs so the child card still gets the
      // in-progress answer as context instead of only the question.
      const parentForContext = cardsRef.current.find(
        (card) => card.id === parent.id,
      );
      let parentTurns = parentForContext?.turns ?? [];
      const parentStream = streamingRefs.current.get(parent.id);
      if (parentStream) {
        parentTurns = parentTurns.map((turn) =>
          turn.id === parentStream.turnId && !turn.assistantText && parentStream.text
            ? { ...turn, assistantText: parentStream.text }
            : turn,
        );
      }
      window.setTimeout(() => {
        sendProgrammaticMessage(autoQuestion, id, undefined, parentTurns);
      }, 80);
    }
  };

  const openAnnotatedBranch = (
    parentId: string,
    messageId: number,
    term: TermAnnotation,
  ) => {
    const linkKey = `${parentId}::term::${messageId}::${term.canonicalKey}::${term.start}`;
    const linkedId = branchTargetRef.current.get(linkKey);
    const linkedCard =
      cardsRef.current.find((card) => card.id === linkedId) ??
      cardsRef.current.find((card) => card.linkKey === linkKey);
    if (linkedCard) {
      branchTargetRef.current.set(linkKey, linkedCard.id);
      activateCard(linkedCard.id, "该专业名词已有关联卡片，已直接为你打开");
      return;
    }
    createCard(
      "child",
      term.suggestedQuestion,
      parentId,
      linkKey,
      term.text,
      term.suggestedQuestion,
    );
  };

  const buildDemoReply = (): AiReplyPayload => {
    const reply = presetReplies[Math.floor(Math.random() * presetReplies.length)];
    const answer = `${reply.lead} ${reply.phrase}${reply.tail}`;
    const start = answer.indexOf(reply.phrase);
    return {
      answer,
      terms: [
        {
          text: reply.phrase,
          start,
          end: start + reply.phrase.length,
          canonicalKey: reply.phrase,
          suggestedQuestion: `请深入解释「${reply.phrase}」`,
        },
      ],
    };
  };

  const requestAiReply = async (
    question: string,
    sourceCard: ConversationCardState | undefined,
  ): Promise<AiReplyPayload> => {
    if (!apiUrl.trim() || !apiKey.trim() || !apiModel.trim()) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      return buildDemoReply();
    }

    const context = (sourceCard?.turns ?? [])
      .slice(-6)
      .flatMap((turn) => {
        const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
        if (turn.user) messages.push({ role: "user", content: turn.user });
        if (turn.assistantText) {
          messages.push({ role: "assistant", content: turn.assistantText });
        }
        return messages;
      });

    // Append attachment content from ref (set by sendMessage, never shown to user)
    const attachmentContext = pendingAttachmentContextRef.current;
    pendingAttachmentContextRef.current = "";
    const enrichedQuestion = attachmentContext
      ? `${question}${attachmentContext}`
      : question;

    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: apiUrl.trim(),
        apiKey: apiKey.trim(),
        model: apiModel.trim(),
        messages: [...context, { role: "user", content: enrichedQuestion }],
      }),
    });
    const payload = (await response.json()) as AiReplyPayload & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || "模型接口请求失败");
    }
    return payload;
  };

  const requestAiReplyStream = async (
    question: string,
    sourceCard: ConversationCardState | undefined,
    onDelta: (cumulativeText: string) => void,
    onParagraph: (paragraphText: string, offset: number) => void,
    extraContextTurns?: ChatTurn[],
  ): Promise<AiReplyPayload> => {
    // Demo mode — simulate streaming character by character
    if (!apiUrl.trim() || !apiKey.trim() || !apiModel.trim()) {
      const reply = buildDemoReply();
      let displayed = "";
      for (let i = 0; i < reply.answer.length; i++) {
        displayed += reply.answer[i];
        onDelta(displayed);
        await new Promise((r) => window.setTimeout(r, 30));
      }
      return reply;
    }

    const turnToMessages = (
      turn: ChatTurn,
    ): Array<{ role: "user" | "assistant"; content: string }> => {
      const messages: Array<{
        role: "user" | "assistant";
        content: string;
      }> = [];
      if (turn.user) messages.push({ role: "user", content: turn.user });
      if (turn.assistantText) {
        messages.push({ role: "assistant", content: turn.assistantText });
      }
      return messages;
    };

    // Prepend the parent card's context (invisible to the user — only feeds the
    // AI request) so term-spawned cards understand the term's situational
    // context instead of answering in a vacuum. Then the card's own history.
    const context = [
      ...(extraContextTurns ?? []).slice(-4).flatMap(turnToMessages),
      ...(sourceCard?.turns ?? []).slice(-6).flatMap(turnToMessages),
    ];

    const attachmentContext = pendingAttachmentContextRef.current;
    pendingAttachmentContextRef.current = "";
    const enrichedQuestion = attachmentContext
      ? `${question}${attachmentContext}`
      : question;

    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: apiUrl.trim(),
        apiKey: apiKey.trim(),
        model: apiModel.trim(),
        messages: [...context, { role: "user", content: enrichedQuestion }],
        stream: true,
      }),
    });

    const contentType = response.headers.get("content-type") || "";

    // Fallback: upstream doesn't support streaming — simulate from JSON response
    if (!contentType.includes("text/event-stream")) {
      const payload = (await response.json()) as AiReplyPayload & {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "模型接口请求失败");
      }
      let displayed = "";
      for (let i = 0; i < payload.answer.length; i++) {
        displayed += payload.answer[i];
        onDelta(displayed);
        await new Promise((r) => window.setTimeout(r, 10));
      }
      return payload;
    }

    // Process SSE stream
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedAnswer = "";
    let terms: TermAnnotation[] = [];
    let providerModel = "";
    let streamError = "";
    // Tracks how far we've scanned accumulatedAnswer for complete paragraphs,
    // so each paragraph is handed to onParagraph exactly once.
    let paragraphScanIndex = 0;

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
        if (data === "[DONE]") {
          // Body text is complete — resolve immediately so the UI renders
          // without waiting for terms. Terms (if any) arrive in the earlier
          // "terms" event or are re-fetched via /api/terms afterwards.
          break;
        }

        try {
          const event = JSON.parse(data) as SseEvent;
          if (event.type === "delta") {
            accumulatedAnswer += event.content;
            onDelta(accumulatedAnswer);
            // Scan for newly-completed paragraphs (separated by blank line,
            // or a line break followed by a heading/list marker) and hand each
            // off for parallel term extraction as it finishes streaming.
            while (paragraphScanIndex < accumulatedAnswer.length) {
              const nextBoundary = findParagraphBoundary(
                accumulatedAnswer,
                paragraphScanIndex,
              );
              if (nextBoundary < 0) break; // no complete paragraph yet
              const paragraphText = accumulatedAnswer
                .slice(paragraphScanIndex, nextBoundary)
                .trim();
              if (paragraphText) {
                onParagraph(paragraphText, paragraphScanIndex);
              }
              paragraphScanIndex = nextBoundary + 1;
            }
          } else if (event.type === "terms") {
            terms = event.terms;
            providerModel = event.providerModel || "";
          } else if (event.type === "error") {
            streamError = event.message;
          }
        } catch {
          // Skip unparseable events
        }
      }
    }

    // Flush the remaining tail as the final paragraph (last paragraph has no
    // trailing blank line, so it only completes when the stream ends).
    if (paragraphScanIndex < accumulatedAnswer.length) {
      const tailText = accumulatedAnswer.slice(paragraphScanIndex).trim();
      if (tailText) {
        onParagraph(tailText, paragraphScanIndex);
      }
    }

    if (streamError) throw new Error(streamError);
    return { answer: accumulatedAnswer, terms, providerModel };
  };

  // Merge new terms into the accumulated list: sort by start, drop
  // overlapping or duplicate entries (same text at same position).
  const mergeTerms = (
    existing: TermAnnotation[],
    incoming: TermAnnotation[],
  ): TermAnnotation[] => {
    if (incoming.length === 0) return existing;
    const seen = new Set<string>();
    const merged: TermAnnotation[] = [];
    for (const t of [...existing, ...incoming].sort(
      (a, b) => a.start - b.start || b.end - a.end,
    )) {
      // Dedupe by text: the same phrase appearing in multiple paragraphs
      // should only produce one clickable term (at its earliest occurrence).
      const key = `${t.text}`;
      if (seen.has(key)) continue;
      const prev = merged.at(-1);
      if (prev && t.start < prev.end) continue; // overlap
      seen.add(key);
      merged.push(t);
    }
    return merged;
  };

  // Fetch terms for a text excerpt via the standalone /api/terms endpoint.
  // `offset` is the character position of this excerpt within the full answer;
  // the endpoint returns segment-relative offsets, which we shift to absolute.
  const requestTerms = async (
    answer: string,
    offset = 0,
  ): Promise<TermAnnotation[]> => {
    if (!apiUrl.trim() || !apiKey.trim() || !apiModel.trim()) return [];
    const response = await fetch("/api/terms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: apiUrl.trim(),
        apiKey: apiKey.trim(),
        model: apiModel.trim(),
        answer,
      }),
    });
    if (!response.ok) return [];
    const payload = (await response.json()) as { terms?: TermAnnotation[] };
    if (!Array.isArray(payload.terms)) return [];
    // Shift segment-relative offsets into full-answer coordinates.
    return payload.terms
      .map((t) => ({
        ...t,
        start: t.start + offset,
        end: t.end + offset,
      }))
      .filter((t) => t.start >= 0 && t.end > t.start);
  };

  const sendProgrammaticMessage = async (
    question: string,
    cardId: string,
    turnAttachments?: TurnAttachment[],
    contextTurns?: ChatTurn[],
  ) => {
    const sourceCard = cardsRef.current.find((card) => card.id === cardId);
    if (!sourceCard) return;
    const id = Date.now();
    let didSuppress = false;
    updateCardTurns(cardId, (current) => {
      // Ignore duplicate sends (the same question already in-flight for this card)
      const pending = current.find(
        (turn) => turn.user === question && !turn.assistantText,
      );
      if (pending) {
        didSuppress = true;
        return current;
      }
      return [
        ...current,
        {
          id,
          title: question.length > 26 ? `${question.slice(0, 26)}…` : question,
          user: question,
          attachments: turnAttachments,
          body: (
            <div className="typing-line">
              <span />
              <span />
              <span />
            </div>
          ),
        },
      ];
    });
    if (didSuppress) return;
    try {
      const demo = !apiUrl.trim() || !apiKey.trim() || !apiModel.trim();

      // Set up per-card streaming state. Each card owns its own slot, so a
      // child card spawned from a still-streaming parent streams independently.
      const streamingSlot = { text: "", dirty: false, turnId: id, terms: [] as TermAnnotation[] };
      streamingRefs.current.set(cardId, streamingSlot);

      // Accumulates terms discovered from each completed paragraph during
      // streaming. Each new batch is merged (sorted, deduped) and handed to
      // the streaming slot; the 50ms flush interval renders them so buttons
      // appear as soon as they're known without stopping the body flow.
      let turnTerms: TermAnnotation[] = [];

      // Re-render the turn with the current set of terms. During streaming
      // (final=false) we render a streaming-aware annotated body and do NOT set
      // assistantText, so the flush interval keeps updating the body as new
      // deltas arrive. Only the final render (final=true) sets assistantText
      // and switches to the static AnnotatedReply.
      const renderTurnWithTerms = (
        answerText: string,
        termsForTurn: TermAnnotation[],
        final: boolean,
      ) => {
        updateCardTurns(cardId, (current) =>
          current.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  ...(final ? { assistantText: answerText } : {}),
                  body: final ? (
                    <AnnotatedReply
                      answer={answerText}
                      terms={termsForTurn}
                      modelLabel={
                        demo
                          ? "演示模型"
                          : replyProvider ?? apiModel.trim()
                      }
                      networkEnabled={networkEnabled}
                      demo={demo}
                      onTermClick={(term) =>
                        openAnnotatedBranch(cardId, id, term)
                      }
                    />
                  ) : (
                    <StreamingAnnotatedReply
                      answer={answerText}
                      terms={termsForTurn}
                      onTermClick={(term) =>
                        openAnnotatedBranch(cardId, id, term)
                      }
                    />
                  ),
                }
              : turn,
          ),
        );
      };

      // Handed to requestAiReplyStream: called once per complete paragraph.
      // Kicks off an async term-extraction per paragraph (fully parallel with
      // the ongoing stream) and stores results in the streaming slot so the
      // flush interval renders annotated buttons while the body keeps flowing.
      let replyProvider = "";
      const onParagraph = (paragraphText: string, offset: number) => {
        requestTerms(paragraphText, offset)
          .then((newTerms) => {
            if (newTerms.length === 0) return;
            turnTerms = mergeTerms(turnTerms, newTerms);
            const slot = streamingRefs.current.get(cardId);
            if (slot && slot.turnId === id) {
              slot.terms = turnTerms;
              slot.dirty = true;
            }
          })
          .catch(() => {
            // Terms are optional — keep the paragraph as plain text.
          });
      };

      // Kept in sync with the streamed text so paragraph callbacks can render
      // against the latest body even while streaming is still in progress.
      const currentAnswerRef = { current: "" };

      const reply = await requestAiReplyStream(
        question,
        sourceCard,
        (cumulativeText: string) => {
          currentAnswerRef.current = cumulativeText;
          const slot = streamingRefs.current.get(cardId);
          if (slot && slot.turnId === id) {
            slot.text = cumulativeText;
            slot.dirty = true;
          }
        },
        onParagraph,
        contextTurns,
      );
      replyProvider = reply.providerModel ?? "";

      // Streaming complete — clear THIS card's streaming state and finalize
      // with AnnotatedReply. Other cards' streaming states are untouched.
      streamingRefs.current.delete(cardId);
      currentAnswerRef.current = reply.answer;

      // Merge any terms that arrived in the final "terms" SSE event.
      if (reply.terms.length > 0) {
        turnTerms = mergeTerms(turnTerms, reply.terms);
      }
      renderTurnWithTerms(reply.answer, turnTerms, true);

      // Safety net: if no paragraph ever produced terms (e.g. single-paragraph
      // reply where the flush already handled it, or all requests failed),
      // do one final attempt on the whole answer.
      if (!demo && turnTerms.length === 0) {
        requestTerms(reply.answer)
          .then((newTerms) => {
            if (newTerms.length === 0) return;
            turnTerms = mergeTerms(turnTerms, newTerms);
            renderTurnWithTerms(reply.answer, turnTerms, true);
          })
          .catch(() => {
            // Terms are optional — keep the plain answer.
          });
      }
    } catch (error) {
      streamingRefs.current.delete(cardId);

      // Demo mode fallback (shouldn't normally throw, but be safe)
      const demo = !apiUrl.trim() || !apiKey.trim() || !apiModel.trim();
      if (demo) {
        const reply = buildDemoReply();
        updateCardTurns(cardId, (current) =>
          current.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  assistantText: reply.answer,
                  body: (
                    <AnnotatedReply
                      answer={reply.answer}
                      terms={reply.terms}
                      modelLabel="演示模型"
                      networkEnabled={false}
                      demo
                      onTermClick={(term) =>
                        openAnnotatedBranch(cardId, id, term)
                      }
                    />
                  ),
                }
              : turn,
          ),
        );
        return;
      }

      // Streaming failed — try non-streaming fallback
      try {
        const reply = await requestAiReply(question, sourceCard);
        updateCardTurns(cardId, (current) =>
          current.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  assistantText: reply.answer,
                  body: (
                    <AnnotatedReply
                      answer={reply.answer}
                      terms={reply.terms}
                      modelLabel={
                        reply.providerModel ?? apiModel.trim()
                      }
                      networkEnabled={networkEnabled}
                      onTermClick={(term) =>
                        openAnnotatedBranch(cardId, id, term)
                      }
                    />
                  ),
                }
              : turn,
          ),
        );
      } catch (fallbackError) {
        // Both methods failed — show error UI
        const errorMessage =
          fallbackError instanceof Error
            ? fallbackError.message
            : "模型接口请求失败";
        updateCardTurns(cardId, (current) =>
          current.map((turn) =>
            turn.id === id
              ? {
                  ...turn,
                  body: (
                    <div className="api-reply-error" role="alert">
                      <strong>API 请求未完成</strong>
                      <p>{errorMessage}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setSettingsTab("可用模型");
                          setModal("settings");
                        }}
                      >
                        检查 API 设置
                      </button>
                    </div>
                  ),
                }
              : turn,
          ),
        );
      }
    }
  };

  const sendMessage = async () => {
    const clean = message.trim();
    const readyAttachments = attachments.filter((att) => !att.uploading);
    const hasAttachments = readyAttachments.length > 0;
    if ((!clean && !hasAttachments) || sending) return;
    setSending(true);

    const displayQuestion = clean || "请分析上传的文件内容";
    let attachmentContext = "";
    const turnAttachments: TurnAttachment[] = [];

    if (readyAttachments.length > 0) {
      for (const att of readyAttachments) {
        turnAttachments.push({ name: att.name, type: att.type, size: att.size });
      }
      // Build the full context for AI (not shown to user)
      const fileContexts = readyAttachments
        .map((att) => {
          const header = `【附件：${att.name} · ${att.type} · ${formatFileSize(att.size)}】`;
          if (att.text) {
            const label = att.truncated ? "（内容已截断至前 80 KB）" : "";
            return `${header}${label}\n${att.text}`;
          }
          return `${header}\n[二进制文件，无法提取文本内容]`;
        })
        .join("\n\n");
      attachmentContext = `\n\n--- 以下为上传文件内容，仅供分析参考 ---\n\n${fileContexts}`;
    }

    // Stash AI-only context in ref so requestAiReply can append it
    pendingAttachmentContextRef.current = attachmentContext;

    setMessage("");
    clearAttachments();
    setModelOpen(false);
    try {
      await sendProgrammaticMessage(displayQuestion, activeCardId, turnAttachments);
    } finally {
      setSending(false);
    }
    window.setTimeout(() => {
      conversationRef.current?.scrollTo({
        top: conversationRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 40);
  };

  const removeCard = () => {
    if (cards.length > 1 && activeCard) {
      const remaining = cards.filter((card) => card.id !== activeCard.id);
      const fallback =
        remaining.find((card) => card.id === activeCard.parentId) ??
        remaining.find((card) => card.id === backgroundCardId) ??
        remaining[0];
      if (activeCard.linkKey) branchTargetRef.current.delete(activeCard.linkKey);
      // Release the removed card's streaming state so its slot is reclaimed.
      streamingRefs.current.delete(activeCard.id);
      commitCards(remaining);
      commitActiveCard(fallback.id);
      setBackgroundCardId(
        remaining.find((card) => card.id !== fallback.id)?.id ?? null,
      );
      setCardOffset({ x: 0, y: 0 });
      notify("已删除当前分支并返回关联卡片");
      return;
    }
    if (projects.includes(activeProject)) {
      deleteProject(activeProject);
      return;
    }
    if (activeCard) updateCardTurns(activeCard.id, () => []);
    notify("已清空当前对话");
  };

  return (
    <main className={`explore-app theme-${theme} ${layoutClass}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <div className="grain" />

      <aside
        className="sidebar"
        aria-label="项目侧边栏"
        onMouseEnter={() => clearPanelCloseTimer("sidebar")}
        onMouseLeave={() => schedulePanelClose("sidebar")}
      >
        <div className="sidebar-actions">
          <button className="side-action" onClick={() => closePanel("sidebar")}>
            <span className="side-icon">
              <LayoutPanelLeft size={20} />
            </span>
            <span>切换侧边栏</span>
          </button>
          <button className="side-action quick-chat-action" onClick={() => openQuickChat()}>
            <span className="side-icon">
              <MessageCircle size={20} />
            </span>
            <span>新对话</span>
          </button>
          <button className="side-action" onClick={() => setModal("folder")}>
            <span className="side-icon">
              <FolderPlus size={20} />
            </span>
            <span>新建文件夹</span>
          </button>
          <button className="side-action" onClick={createProject}>
            <span className="side-icon">
              <Plus size={20} />
            </span>
            <span>新建项目</span>
          </button>
          <button className="side-action" onClick={() => fileInputRef.current?.click()}>
            <span className="side-icon">
              <FilePlus2 size={20} />
            </span>
            <span>上传文档</span>
          </button>
          <button className="side-action" onClick={() => importInputRef.current?.click()}>
            <span className="side-icon">
              <Download size={20} />
            </span>
            <span>导入项目</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".txt,.md,.csv,.json,.pdf,.docx,.pptx,.xlsx,.html,.css,.js,.ts,.py,.log,.xml,.yaml,.yml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                uploadDocumentAndCreateCard(file);
                event.target.value = "";
              }
            }}
          />
          <input
            ref={importInputRef}
            type="file"
            hidden
            accept=".json,.zip"
            onChange={(event) =>
              event.target.files?.[0] && notify(`已导入：${event.target.files[0].name}`)
            }
          />
        </div>

        <div className="project-list">
          <div className="resident-row">
            <MessageCircle size={17} />
            <span>常驻对话</span>
            <div className="storage-toggle">
              <button
                className={storage === "local" ? "selected" : ""}
                title="本地"
                onClick={() => setStorage("local")}
              >
                <HardDrive size={13} />
              </button>
              <button
                className={storage === "cloud" ? "selected" : ""}
                title="云端"
                onClick={() => {
                  setStorage("cloud");
                  notify("请登录后使用云端项目");
                }}
              >
                <Cloud size={13} />
              </button>
            </div>
          </div>
          <div className="section-label">
            <ChevronDown size={14} />
            <HardDrive size={14} />
            <span>本地项目</span>
            <i />
          </div>
          {projects.map((project) => (
            <div
              className={`project-item${activeProject === project ? " selected" : ""}`}
              key={project}
            >
              <button
                type="button"
                className="project-main"
                onClick={() => openProject(project)}
                title={`打开${project}`}
              >
                <span className="project-dot" />
                <span>{project}</span>
                {project === "应用介绍" && <Sparkles size={13} />}
              </button>
              <button
                type="button"
                className="project-delete"
                aria-label={`删除项目${project}`}
                title={`删除项目「${project}」`}
                onClick={() => deleteProject(project)}
              >
                <X size={14} />
              </button>
            </div>
          ))}
          <div className="section-label cloud-label">
            <ChevronDown size={14} />
            <Cloud size={14} />
            <span>云端项目</span>
            <i />
            <button onClick={() => setModal("account")}>会员专属</button>
          </div>
        </div>

        <div className="sidebar-footer">
          <button className="side-action" onClick={() => setModal("settings")}>
            <span className="side-icon">
              <Settings size={20} />
            </span>
            <span>设置</span>
          </button>
          <button className="side-action" onClick={() => setModal("account")}>
            <span className="side-icon avatar-icon">
              <UserRound size={17} />
            </span>
            <span>账户</span>
          </button>
        </div>
      </aside>

      {(sidebarOpen || universeOpen) && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="关闭侧边面板"
          onClick={() => {
            setSidebarOpen(false);
            setUniverseOpen(false);
          }}
        />
      )}

      {!sidebarOpen && (
        <>
          <div
            className="edge-hover-zone edge-hover-left"
            aria-hidden="true"
            onMouseEnter={() => openSidebar()}
          />
          <button
            className="edge-toggle edge-left"
            aria-label="展开项目侧边栏"
            onMouseEnter={() => openSidebar()}
            onClick={() => openSidebar()}
          >
            <ChevronRight size={18} />
          </button>
        </>
      )}

      <section
        className="workspace"
        aria-label="卡片工作区"
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest("button, a, input, textarea, select")) return;
          collapseSidebars();
        }}
      >
        <div className="brand-welcome">
          <div className="brand-word">Explore</div>
          <div className="welcome-actions">
            <button onClick={() => setModal("guide")}>
              <BookOpen size={17} /> 使用指南
            </button>
            <button
              className="sample-button"
              title="创建样例分支"
              onClick={() => createCard("divergent", "Explore 的分支卡片如何工作")}
            >
              <Sparkles size={18} />
            </button>
          </div>
        </div>

        {(deepAncestors.length > 0 || leftBranchDocks.length > 0) && (
          <aside className="branch-rail branch-rail-left" aria-label="左侧分支停靠区">
            <span className="branch-rail-label">路径与分支</span>
            {deepAncestors.map((card, index) => (
              <button
                className="branch-dock ancestor-dock"
                data-card-id={card.id}
                key={`ancestor-${card.id}`}
                onClick={() => activateCard(card.id)}
              >
                <span className="branch-dock-kicker">更早路径 · L{index + 3}</span>
                <strong>{card.title}</strong>
              </button>
            ))}
            {leftBranchDocks.map(({ card, parentTitle, totalCards }) => (
              <button
                className="branch-dock"
                data-card-id={card.id}
                data-parent-card-id={card.parentId ?? "root"}
                key={`left-${card.id}`}
                onClick={() => activateCard(card.id)}
              >
                <span className="branch-dock-kicker">
                  来自 {parentTitle} · {totalCards} 张
                </span>
                <strong>{card.title}</strong>
              </button>
            ))}
          </aside>
        )}

        {rightBranchDocks.length > 0 && (
          <aside className="branch-rail branch-rail-right" aria-label="右侧分支停靠区">
            <span className="branch-rail-label">其他分支</span>
            {rightBranchDocks.map(({ card, parentTitle, totalCards }) => (
              <button
                className="branch-dock"
                data-card-id={card.id}
                data-parent-card-id={card.parentId ?? "root"}
                key={`right-${card.id}`}
                onClick={() => activateCard(card.id)}
              >
                <span className="branch-dock-kicker">
                  来自 {parentTitle} · {totalCards} 张
                </span>
                <strong>{card.title}</strong>
              </button>
            ))}
          </aside>
        )}

        {stackedCards.map(
          ({
            card,
            depth,
            distance,
            x,
            y,
            rotation,
            scale,
            hoverY,
            zIndex,
            opacity,
          }) => (
            <article
              className="conversation-card background-card stacked-card path-card"
              data-card-id={card.id}
              data-parent-card-id={card.parentId ?? "root"}
              data-stack-mode="active-path"
              aria-label={`主路径祖先卡片：${card.title}`}
              role="button"
              tabIndex={0}
              key={card.id}
              style={
                {
                  zIndex,
                  opacity,
                  "--stack-x": `${x}px`,
                  "--stack-y": `${y}px`,
                  "--stack-rotation": `${rotation}deg`,
                  "--stack-scale": scale,
                  "--stack-hover-y": `${hoverY}px`,
                } as React.CSSProperties
              }
              onClick={() => activateCard(card.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateCard(card.id);
                }
              }}
            >
              <header className="card-header">
                <h1>{card.title}</h1>
                <span className="background-card-hint">
                  L{depth} · {card.id.slice(-5)}
                </span>
              </header>
              <div className="background-card-preview">
                <span>主路径 · 距当前 {distance} 层</span>
                <p>点击祖先卡片即可沿当前路径返回。</p>
              </div>
            </article>
          ),
        )}

        <article
          className="conversation-card active-card"
          data-card-id={activeCardId}
          key={activeCardId}
          style={{ transform: `translate(${cardOffset.x}px, ${cardOffset.y}px)` }}
        >
          <header className="card-header" onPointerDown={beginDrag}>
            <h1>{activeCard?.title ?? activeProject}</h1>
            <div className="card-actions">
              {activeProject === "应用介绍" && activeCard?.kind === "root" && (
                <IconButton label="关闭新手引导" onClick={closeIntroCard}>
                  <X size={18} />
                </IconButton>
              )}
              <IconButton label="新建深入卡片" onClick={() => createCard("child")}>
                <Plus size={19} />
              </IconButton>
              <IconButton
                label={favorite ? "取消收藏" : "收藏卡片"}
                active={favorite}
                onClick={() => {
                  setFavorite((value) => !value);
                  notify(favorite ? "已取消收藏" : "已收藏卡片");
                }}
              >
                <Bookmark size={18} fill={favorite ? "currentColor" : "none"} />
              </IconButton>
              <IconButton
                label={
                  cards.length > 1
                    ? "删除当前分支"
                    : projects.includes(activeProject)
                      ? "删除项目"
                      : "清空对话"
                }
                danger
                onClick={removeCard}
              >
                <Trash2 size={18} />
              </IconButton>
            </div>
          </header>

          <div className="conversation-scroll" ref={conversationRef}>
            {turns.length === 0 && (
              <div className="empty-conversation">
                <span>
                  <MessageCircle size={25} />
                </span>
                <h2>开始一段新对话</h2>
                <p>无需创建项目或进行设置，直接在下方输入你的问题。</p>
              </div>
            )}
            {turns.map((turn) => (
              <section className="chat-turn" key={turn.id} id={`turn-${turn.id}`}>
                <h2>{turn.title}</h2>
                {turn.user && (
                  <div className="user-message-group">
                    <div className="user-line">
                      <span>{turn.user}</span>
                      <UserRound size={16} />
                    </div>
                    {turn.attachments && turn.attachments.length > 0 && (
                      <div className="user-attachments">
                        {turn.attachments.map((att, index) => (
                          <span className="user-attachment-tag" key={index}>
                            <Paperclip size={11} />
                            <span className="user-attachment-name">{att.name}</span>
                            <span className="user-attachment-meta">
                              {att.type.split("/")[0] === "text"
                                ? att.type.split("/")[1] ?? att.type
                                : att.type.split("/")[0]}
                              {" · "}
                              {att.size < 1024
                                ? `${att.size} B`
                                : att.size < 1024 * 1024
                                  ? `${(att.size / 1024).toFixed(1)} KB`
                                  : `${(att.size / (1024 * 1024)).toFixed(1)} MB`}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="answer-copy">{turn.body}</div>
              </section>
            ))}
          </div>

          <button
            className="scroll-button scroll-top"
            title="滚动到开头"
            onClick={() => conversationRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <ChevronUp size={17} />
          </button>
          <button
            className="scroll-button scroll-bottom"
            title="滚动到最新的对话"
            onClick={() =>
              conversationRef.current?.scrollTo({
                top: conversationRef.current.scrollHeight,
                behavior: "smooth",
              })
            }
          >
            <ChevronDown size={17} />
          </button>

          <nav className="turn-rail" aria-label="对话导航">
            {turns.map((turn) => (
              <a href={`#turn-${turn.id}`} key={turn.id} title={turn.title}>
                <span />
                <em>{turn.title}</em>
              </a>
            ))}
          </nav>
        </article>

        <div className="branch-tools">
          <IconButton label="创建发散卡片" onClick={() => createCard("divergent")}>
            <GitBranch size={19} />
          </IconButton>
          <IconButton label="创建平行分支" onClick={() => createCard("branch")}>
            <Network size={19} />
          </IconButton>
          <IconButton
            label="思维宇宙"
            active={universeOpen}
            onClick={toggleUniverse}
          >
            <Hexagon size={19} />
          </IconButton>
        </div>
      </section>

      <aside
        className="universe-panel"
        aria-label="思维宇宙"
        onMouseEnter={() => clearPanelCloseTimer("universe")}
        onMouseLeave={() => schedulePanelClose("universe")}
      >
        <button
          className="universe-close"
          aria-label="收起思维宇宙"
          onClick={() => closePanel("universe")}
        >
          <ChevronRight size={16} />
        </button>
        <div className="universe-title">
          <Hexagon size={16} />
          <span>思维宇宙</span>
        </div>
        <div
          className={`universe-canvas${universeDragging ? " dragging" : ""}`}
          ref={universeCanvasRef}
          onWheel={handleUniverseWheel}
          onPointerDown={beginUniversePan}
          onPointerMove={moveUniversePan}
          onPointerUp={endUniversePan}
          onPointerCancel={endUniversePan}
        >
          <div
            className="universe-tree"
            style={{
              width: universeTree.canvasWidth,
              height: universeTree.canvasHeight,
              transform: `translate(${universeView.x}px, ${universeView.y}px) scale(${universeView.scale})`,
            }}
          >
            <svg
              width={universeTree.canvasWidth}
              height={universeTree.canvasHeight}
              viewBox={`0 0 ${universeTree.canvasWidth} ${universeTree.canvasHeight}`}
              preserveAspectRatio="xMinYMin meet"
              aria-hidden="true"
            >
              {universeLayout
                .filter(({ parentPosition }) => parentPosition)
                .map(({ card, position, parentPosition, isOnActivePath }) => {
                  const middleY = ((parentPosition?.y ?? 0) + position.y) / 2;
                  return (
                    <path
                      className={`${isOnActivePath ? "active-edge " : ""}${
                        enteringNodeIds.has(card.id) ? "new-edge" : ""
                      }`.trim() || undefined}
                      d={`M${parentPosition?.x ?? 0} ${parentPosition?.y ?? 0} C${
                        parentPosition?.x ?? 0
                      } ${middleY} ${position.x} ${middleY} ${position.x} ${position.y}`}
                      data-parent-card-id={card.parentId ?? "root"}
                      data-child-card-id={card.id}
                      key={`path-${card.id}`}
                      pathLength={1}
                    />
                  );
                })}
            </svg>
            {universeLayout.map(
              ({
                card,
                depth,
                position,
                parentPosition,
                parentTitle,
                isOnActivePath,
              }) => (
                <button
                  className={`mind-node${card.parentId ? "" : " node-main"}${
                    isOnActivePath ? " path-node" : ""
                  }${card.id === activeCardId ? " selected" : ""}${
                    enteringNodeIds.has(card.id) ? " entering-node" : ""
                  }${enteringParentIds.has(card.id) ? " spawning-parent" : ""}`}
                  data-card-id={card.id}
                  data-parent-card-id={card.parentId ?? "root"}
                  key={card.id}
                  title={`第 ${depth} 层${
                    parentTitle ? ` · 父卡片：${parentTitle}` : " · 主卡片"
                  } · 切换至${card.title}`}
                  style={{
                    left: position.x,
                    top: position.y,
                    "--node-enter-x": `${
                      (parentPosition?.x ?? position.x) - position.x
                    }px`,
                    "--node-enter-y": `${
                      (parentPosition?.y ?? position.y - 28) - position.y
                    }px`,
                  } as React.CSSProperties}
                  onClick={() => activateCard(card.id)}
                  onAnimationEnd={(event) => {
                    if (
                      event.animationName === "mind-node-arrive" &&
                      event.currentTarget === event.target
                    ) {
                      finishUniverseNodeEntering(card.id);
                    }
                  }}
                >
                  <span>{card.title}</span>
                </button>
              ),
            )}
          </div>
        </div>
        <div className="universe-viewport-tools" aria-label="思维宇宙视图控制">
          <button type="button" aria-label="缩小思维宇宙" onClick={() => changeUniverseZoom(0.82)}>
            −
          </button>
          <button type="button" aria-label="复位思维宇宙" onClick={resetUniverseView}>
            {Math.round(universeView.scale * 100)}%
          </button>
          <button type="button" aria-label="放大思维宇宙" onClick={() => changeUniverseZoom(1.22)}>
            +
          </button>
        </div>
        <span className="universe-gesture-hint">滚轮缩放 · 按住拖动</span>
      </aside>

      {!universeOpen && (
        <>
          <div
            className="edge-hover-zone edge-hover-right"
            aria-hidden="true"
            onMouseEnter={() => openUniverse()}
          />
          <button
            className="edge-toggle edge-right"
            aria-label="展开思维宇宙"
            onMouseEnter={() => openUniverse()}
            onClick={() => openUniverse()}
          >
            <ChevronLeft size={18} />
          </button>
        </>
      )}

      <section className="composer-shell" aria-label="消息输入区">
        <div className="composer">
          {attachments.length > 0 && (
            <div className="attachment-strip">
              {attachments.map((att) => (
                <span
                  className={`attachment-chip${att.uploading ? " uploading" : ""}`}
                  key={att.id}
                  title={`${att.name} · ${formatFileSize(att.size)}${att.truncated ? " · 已截断" : ""}`}
                >
                  <span className="attachment-chip-icon">
                    <Paperclip size={13} />
                  </span>
                  <span className="attachment-chip-name">{att.name}</span>
                  <span className="attachment-chip-size">{formatFileSize(att.size)}</span>
                  <button
                    type="button"
                    className="attachment-chip-remove"
                    aria-label={`移除 ${att.name}`}
                    onClick={() => removeAttachment(att.id)}
                  >
                    <X size={13} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="composer-left">
            <div className="model-picker" ref={modelPickerRef}>
              <button type="button" onClick={() => setModelOpen((open) => !open)}>
                <Bot size={15} />
                <span>{model}</span>
                <ChevronUp size={14} />
              </button>
              {modelOpen && (
                <div className="model-menu">
                  {modelOptions.map(([name, provider]) => (
                    <button
                      type="button"
                      key={name}
                      onClick={() => {
                        setModel(name);
                        setModelOpen(false);
                      }}
                    >
                      <span>
                        <strong>{name}</strong>
                        <small>{provider}</small>
                      </span>
                      {model === name && <Check size={16} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <IconButton
              label={networkEnabled ? "关闭联网" : "启用联网"}
              active={networkEnabled}
              onClick={() => {
                setNetworkEnabled((enabled) => !enabled);
                notify(networkEnabled ? "联网已关闭" : "联网已启用");
              }}
            >
              <Globe2 size={18} />
            </IconButton>
          </div>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="探索一切……（Enter 换行 · Ctrl+Enter 发送）"
            aria-label="消息"
          />
          <div className="composer-right">
            <IconButton label="添加附件" onClick={() => attachmentRef.current?.click()}>
              <Paperclip size={18} />
            </IconButton>
            <IconButton
              label={sending ? "正在生成回复" : "发送消息"}
              active={Boolean(message.trim()) && !sending}
              disabled={sending}
              onClick={sendMessage}
            >
              <Send size={17} />
            </IconButton>
          </div>
          <input
            ref={attachmentRef}
            type="file"
            hidden
            multiple
            onChange={(event) => {
              uploadFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </section>

      <button
        className="mobile-menu"
        aria-label="菜单"
        onClick={() => openSidebar()}
      >
        <Menu size={20} />
      </button>

      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}

      {modal === "folder" && (
        <ModalShell title="新建文件夹" onClose={() => setModal(null)}>
          <form className="simple-form" onSubmit={createFolder}>
            <label>
              文件夹名称
              <input
                autoFocus
                required
                value={folderName}
                onChange={(event) => setFolderName(event.target.value)}
                placeholder="例如：研究项目"
              />
            </label>
            <button className="primary-button" type="submit" disabled={!folderName.trim()}>
              创建 <ArrowRight size={16} />
            </button>
          </form>
        </ModalShell>
      )}

      {modal === "account" && (
        <ModalShell
          title={loginMode === "login" ? "登录" : "创建账号"}
          onClose={() => setModal(null)}
        >
          <form
            className="login-form"
            onSubmit={(event) => {
              event.preventDefault();
              notify("演示站点不会提交登录信息");
              setModal(null);
            }}
          >
            <div className="auth-mark">
              <Hexagon size={28} />
            </div>
            <label>
              邮箱
              <span className="input-with-icon">
                <Mail size={17} />
                <input type="email" placeholder="name@example.com" autoComplete="off" />
              </span>
            </label>
            <label>
              密码
              <span className="input-with-icon">
                <Lock size={17} />
                <input type="password" placeholder="••••••••" autoComplete="new-password" />
              </span>
            </label>
            {loginMode === "login" && (
              <button
                type="button"
                className="text-button"
                onClick={() => notify("密码重置入口为演示状态")}
              >
                忘记密码？
              </button>
            )}
            <button className="primary-button wide-button" type="submit">
              <LogIn size={17} /> {loginMode === "login" ? "登录" : "注册"}
            </button>
            <p>
              {loginMode === "login" ? "还没有账号？" : "已经有账号？"}
              <button
                type="button"
                className="inline-link"
                onClick={() => setLoginMode((mode) => (mode === "login" ? "register" : "login"))}
              >
                {loginMode === "login" ? "去注册" : "去登录"}
              </button>
            </p>
            <small>此复刻版本仅模拟界面，不会保存或发送凭据。</small>
          </form>
        </ModalShell>
      )}

      {modal === "guide" && (
        <ModalShell title="使用指南" onClose={() => setModal(null)} wide>
          <div className="guide-grid">
            {[
              [MessageCircle, "从问题开始", "在底部输入框写下问题，Ctrl+Enter 快速发送。"],
              [GitBranch, "创建探索分支", "使用卡片工具创建深入、发散或平行分支。"],
              [Network, "连接思维节点", "右侧思维宇宙会同步展示当前卡片结构。"],
              [Settings, "定制阅读体验", "在设置中更改主题、语言、模型与布局。"],
            ].map(([ItemIcon, title, copy]) => {
              const GuideIcon = ItemIcon as typeof MessageCircle;
              return (
                <article key={title as string}>
                  <span>
                    <GuideIcon size={22} />
                  </span>
                  <h3>{title as string}</h3>
                  <p>{copy as string}</p>
                </article>
              );
            })}
          </div>
        </ModalShell>
      )}

      {modal === "settings" && (
        <ModalShell title="设置" onClose={() => setModal(null)} wide>
          <div className="settings-layout">
            <nav>
              {settingTabs.map((tab) => (
                <button
                  key={tab}
                  className={settingsTab === tab ? "selected" : ""}
                  onClick={() => setSettingsTab(tab)}
                >
                  {tab}
                  <ChevronRight size={14} />
                </button>
              ))}
            </nav>
            <div className="settings-content">
              {settingsTab === "可用模型" && (
                <>
                  <div className="settings-heading">
                    <div>
                      <span className="eyebrow">MODEL LIBRARY</span>
                      <h3>可用模型</h3>
                    </div>
                    <span className="plan-pill">Free</span>
                  </div>
                  <div className="model-list">
                    {modelOptions.map(([name, provider, rate]) => (
                      <button
                        key={name}
                        className={model === name ? "selected" : ""}
                        onClick={() => setModel(name)}
                      >
                        <span>
                          <strong>{name}</strong>
                          <small>{provider}</small>
                        </span>
                        <em>{rate}</em>
                        {model === name && <Check size={17} />}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="add-model"
                    onClick={() => apiUrlInputRef.current?.focus()}
                  >
                    <Plus size={16} /> 添加 BYOK 模型
                  </button>
                  <form className="byok-form" onSubmit={saveApiSettings}>
                    <div className="byok-heading">
                      <div>
                        <span className="eyebrow">BRING YOUR OWN KEY</span>
                        <h4>自定义模型接口</h4>
                      </div>
                      <span
                        className={`api-status ${apiConnectionStatus}`}
                        role="status"
                        aria-live="polite"
                        title={apiConnectionMessage}
                      >
                        <i aria-hidden="true" />
                        {apiStatusLabel}
                      </span>
                    </div>
                    <p className="byok-note">
                      支持 OpenAI Chat Completions 兼容接口。API Key
                      仅保存在当前浏览器会话，本站不会写入数据库。
                    </p>
                    <label>
                      API URL
                      <input
                        ref={apiUrlInputRef}
                        type="url"
                        required
                        inputMode="url"
                        spellCheck={false}
                        value={apiUrl}
                        onChange={(event) => {
                          setApiUrl(event.target.value);
                          resetApiConnectionStatus();
                        }}
                        placeholder="https://api.example.com/v1/chat/completions"
                      />
                    </label>
                    <div className="byok-fields">
                      <label>
                        API Key
                        <input
                          type="password"
                          required
                          autoComplete="off"
                          spellCheck={false}
                          value={apiKey}
                          onChange={(event) => {
                            setApiKey(event.target.value);
                            resetApiConnectionStatus();
                          }}
                          placeholder="sk-••••••••"
                        />
                      </label>
                      <label>
                        模型 ID
                        <input
                          required
                          spellCheck={false}
                          value={apiModel}
                          onChange={(event) => {
                            setApiModel(event.target.value);
                            resetApiConnectionStatus();
                          }}
                          placeholder="gpt-4.1-mini"
                        />
                      </label>
                    </div>
                    <p
                      className={`api-status-detail ${apiConnectionStatus}`}
                      aria-live="polite"
                    >
                      {apiConnectionMessage}
                    </p>
                    <div className="byok-actions">
                      <button
                        className="primary-button"
                        type="submit"
                        disabled={apiConnectionStatus === "checking"}
                      >
                        {apiConnectionStatus === "checking"
                          ? "正在检验…"
                          : "保存并启用"}
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={!apiKey || apiConnectionStatus === "checking"}
                        onClick={clearApiKey}
                      >
                        清除密钥
                      </button>
                    </div>
                    <small>
                      请求由本站转发至你填写的 HTTPS 地址；接口需兼容
                      <code> /chat/completions</code> 响应格式。
                    </small>
                  </form>
                </>
              )}
              {settingsTab === "颜色主题" && (
                <>
                  <div className="settings-heading">
                    <div>
                      <span className="eyebrow">APPEARANCE</span>
                      <h3>颜色主题</h3>
                    </div>
                  </div>
                  <div className="theme-grid">
                    {themeOptions.map((option) => (
                      <button
                        key={option.key}
                        className={theme === option.key ? "selected" : ""}
                        onClick={() => setTheme(option.key)}
                      >
                        <span className="theme-preview">
                          {option.colors.map((color) => (
                            <i key={color} style={{ background: color }} />
                          ))}
                        </span>
                        <strong>{option.name}</strong>
                        {theme === option.key && <Check size={16} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {settingsTab === "语言" && (
                <div className="settings-placeholder">
                  <Languages size={34} />
                  <h3>语言</h3>
                  <p>选择 AI 默认使用的语言与界面语言。</p>
                  <select defaultValue="简体中文">
                    <option>简体中文</option>
                    <option>English</option>
                    <option>日本語</option>
                    <option>自定义语言风格</option>
                  </select>
                </div>
              )}
              {settingsTab !== "可用模型" &&
                settingsTab !== "颜色主题" &&
                settingsTab !== "语言" && (
                  <div className="settings-placeholder">
                    <Zap size={34} />
                    <h3>{settingsTab}</h3>
                    <p>该设置已在复刻版中保留交互入口，可按需要连接真实业务逻辑。</p>
                    <label className="switch-row">
                      <span>启用功能</span>
                      <input type="checkbox" defaultChecked />
                    </label>
                  </div>
                )}
            </div>
          </div>
        </ModalShell>
      )}
    </main>
  );
}
