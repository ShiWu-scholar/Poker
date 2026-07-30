import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
const apiRoute = readFileSync(
  new URL("../app/api/ai/route.ts", import.meta.url),
  "utf8",
);

test("every modal has independent close paths", () => {
  assert.match(page, /className="modal-backdrop"[\s\S]*onMouseDown=\{onClose\}/);
  assert.match(page, /<IconButton label="关闭" onClick=\{onClose\}>/);
  assert.match(page, /event\.key === "Escape"[\s\S]*setModal\(null\)/);
});

test("floating model menu closes without requiring a selection", () => {
  assert.match(page, /modelPickerRef\.current\.contains/);
  assert.match(page, /setModelOpen\(false\)/);
  assert.match(page, /window\.addEventListener\("pointerdown", closeFloatingMenus\)/);
});

test("mobile side panels cannot trap the interface", () => {
  assert.match(page, /className="mobile-scrim"/);
  assert.match(page, /aria-label="关闭侧边面板"/);
  assert.match(page, /setSidebarOpen\(false\);[\s\S]*setUniverseOpen\(false\)/);
  assert.match(page, /if \(isMobileViewport\(\)\) setUniverseOpen\(false\)/);
  assert.match(page, /if \(isMobileViewport\(\)\) setSidebarOpen\(false\)/);
});

test("side panels start collapsed and expand from edge hover", () => {
  assert.match(page, /const \[sidebarOpen, setSidebarOpen\] = useState\(false\)/);
  assert.match(page, /const \[universeOpen, setUniverseOpen\] = useState\(false\)/);
  assert.match(page, /className="edge-hover-zone edge-hover-left"/);
  assert.match(page, /className="edge-hover-zone edge-hover-right"/);
  assert.match(page, /onMouseEnter=\{\(\) => openSidebar\(\)\}/);
  assert.match(page, /onMouseEnter=\{\(\) => openUniverse\(\)\}/);
});

test("side panels close five seconds after pointer leaves", () => {
  assert.match(page, /const schedulePanelClose = [\s\S]*}, 5000\)/);
  assert.match(page, /onMouseLeave=\{\(\) => schedulePanelClose\("sidebar"\)\}/);
  assert.match(page, /onMouseLeave=\{\(\) => schedulePanelClose\("universe"\)\}/);
  assert.match(page, /window\.clearTimeout\(sidebarCloseTimerRef\.current\)/);
  assert.match(page, /window\.clearTimeout\(universeCloseTimerRef\.current\)/);
});

test("double-clicking non-interactive conversation content collapses both panels", () => {
  assert.match(page, /onDoubleClick=\{\(event\) => \{/);
  assert.match(page, /closest\("button, a, input, textarea, select"\)/);
  assert.match(page, /collapseSidebars\(\)/);
  assert.match(
    page,
    /const collapseSidebars = \(\) => \{[\s\S]*closePanel\("sidebar"\);[\s\S]*closePanel\("universe"\)/,
  );
});

test("secondary login actions never submit the form", () => {
  assert.match(
    page,
    /type="button"\s+className="text-button"[\s\S]*密码重置入口为演示状态/,
  );
});

test("folder creation cannot silently submit an empty name", () => {
  assert.match(page, /autoFocus\s+required/);
  assert.match(page, /disabled=\{!folderName\.trim\(\)\}/);
});

test("onboarding card can be closed or deleted without trapping the user", () => {
  assert.match(page, /<IconButton label="关闭新手引导" onClick=\{closeIntroCard\}>/);
  assert.match(page, /const closeIntroCard = \(\) => \{[\s\S]*openQuickChat/);
  assert.match(page, /setProjects\(\(current\) => current\.filter/);
  assert.match(page, /aria-label=\{`删除项目\$\{project\}`\}/);
});

test("quick chat bypasses project creation and starts with an empty conversation", () => {
  assert.match(page, /<span>新对话<\/span>/);
  assert.match(page, /const openQuickChat = [\s\S]*setActiveProject\("新对话"\)/);
  assert.match(page, /const openQuickChat = [\s\S]*startCardSession\("新对话", \[\]\)/);
  assert.doesNotMatch(
    page.match(/const openQuickChat = [\s\S]*?^  };/m)?.[0] ?? "",
    /setProjects/,
  );
  assert.match(page, /<h2>开始一段新对话<\/h2>/);
});

test("new branches become active while the previous card moves behind", () => {
  assert.match(page, /type ConversationCardState = \{/);
  assert.match(page, /setBackgroundCardId\(parent\.id\)/);
  assert.match(page, /commitActiveCard\(id\)/);
  assert.match(page, /className="conversation-card active-card"/);
  assert.match(page, /className="conversation-card background-card stacked-card path-card"/);
  assert.match(css, /\.stacked-card[\s\S]*rotate\(var\(--stack-rotation\)\)/);
  assert.match(css, /@keyframes card-pop-forward/);
});

test("parallel cards share the current card parent instead of becoming children", () => {
  assert.match(page, /const activeSource =[\s\S]*activeCardIdRef\.current/);
  assert.match(
    page,
    /kind === "branch" && activeSource\.parentId[\s\S]*activeSource\.parentId[\s\S]*: activeSource\.id/,
  );
  assert.match(page, /parentId: parent\.id/);
});

test("each card stores its own turns and restores them when selected", () => {
  assert.match(page, /cards\.find\(\(card\) => card\.id === activeCardId\)/);
  assert.match(page, /card\.id === cardId \? \{ \.\.\.card, turns: updater\(card\.turns\) \}/);
  assert.match(page, /const activateCard = \(cardId: string, announcement\?: string\) => \{/);
  assert.match(page, /setBackgroundCardId\(activeCardIdRef\.current\)/);
});

test("mind universe nodes activate their corresponding stored cards", () => {
  assert.match(page, /const universeLayout = universeTree\.nodes/);
  assert.match(page, /\{universeLayout\.map\(/);
  assert.match(page, /onClick=\{\(\) => activateCard\(card\.id\)\}/);
  assert.match(page, /card\.id === activeCardId \? " selected" : ""/);
  assert.match(page, /universeCanvasRef[\s\S]*setUniverseView\(\(current\) =>/);
});

test("mind universe supports cursor-centered wheel zoom and pointer panning", () => {
  assert.match(page, /const \[universeView, setUniverseView\] = useState\(\{ scale: 1, x: 0, y: 0 \}\)/);
  assert.match(page, /const zoomUniverseAt = \(nextScale: number, anchorX: number, anchorY: number\)/);
  assert.match(page, /Math\.max\(0\.5, Math\.min\(2\.25, nextScale\)\)/);
  assert.match(page, /contentX = \(anchorX - current\.x\) \/ current\.scale/);
  assert.match(page, /const handleUniverseWheel = \(event: ReactWheelEvent<HTMLDivElement>\)/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(page, /setPointerCapture\(event\.pointerId\)/);
  assert.match(page, /universePanRef\.current[\s\S]*originX: universeView\.x/);
  assert.match(page, /onWheel=\{handleUniverseWheel\}/);
  assert.match(page, /onPointerMove=\{moveUniversePan\}/);
  assert.match(
    page,
    /transform: `translate\(\$\{universeView\.x\}px, \$\{universeView\.y\}px\) scale\(\$\{universeView\.scale\}\)`/,
  );
  assert.match(page, /aria-label="复位思维宇宙"/);
  assert.match(css, /\.universe-canvas \{[\s\S]*touch-action: none[\s\S]*cursor: grab/);
  assert.match(css, /\.universe-canvas\.dragging[\s\S]*cursor: grabbing/);
  assert.match(css, /\.universe-tree \{[\s\S]*transform-origin: 0 0/);
});

test("new mind universe nodes arrive from their parent with a synchronized edge animation", () => {
  assert.match(page, /const \[enteringNodeIds, setEnteringNodeIds\] = useState<Set<string>>/);
  assert.match(page, /const markUniverseNodeEntering = \(cardId: string\)/);
  assert.match(page, /markUniverseNodeEntering\(id\)[\s\S]*commitCards/);
  assert.match(page, /enteringNodeIds\.has\(card\.id\) \? " entering-node" : ""/);
  assert.match(page, /enteringParentIds\.has\(card\.id\) \? " spawning-parent" : ""/);
  assert.match(page, /"--node-enter-x":/);
  assert.match(page, /"--node-enter-y":/);
  assert.match(page, /event\.animationName === "mind-node-arrive"/);
  assert.match(page, /enteringNodeIds\.has\(card\.id\) \? "new-edge" : ""/);
  assert.match(page, /pathLength=\{1\}/);
  assert.match(css, /@keyframes mind-node-arrive/);
  assert.match(css, /@keyframes universe-edge-reveal/);
  assert.match(css, /@keyframes mind-parent-ripple/);
  assert.match(
    css,
    /\.universe-open \.mind-node\.entering-node[\s\S]*animation: mind-node-arrive/,
  );
});

test("random preset replies expose underlined phrases that create child cards", () => {
  assert.match(page, /const presetReplies = \[/);
  assert.match(page, /Math\.floor\(Math\.random\(\) \* presetReplies\.length\)/);
  assert.match(page, /const buildDemoReply = \(\): AiReplyPayload/);
  assert.match(page, /className="branch-phrase"/);
  assert.match(page, /onClick=\{\(\) => onTermClick\(term\)\}/);
  assert.match(page, /openAnnotatedBranch\(sourceCardId, id, term\)/);
  assert.match(css, /\.branch-phrase[\s\S]*border-bottom: 1px solid currentColor/);
});

test("underlined branch links reuse their recorded card id until deletion", () => {
  assert.match(page, /linkKey\?: string/);
  assert.match(page, /branchTargetRef = useRef\(new Map<string, string>\(\)\)/);
  assert.match(
    page,
    /const linkKey = `\$\{parentId\}::term::\$\{messageId\}::\$\{term\.canonicalKey\}::\$\{term\.start\}`/,
  );
  assert.match(page, /branchTargetRef\.current\.get\(linkKey\)/);
  assert.match(page, /cardsRef\.current\.find\(\(card\) => card\.linkKey === linkKey\)/);
  assert.match(page, /activateCard\(linkedCard\.id, "该专业名词已有关联卡片，已直接为你打开"\)/);
  assert.match(page, /branchTargetRef\.current\.delete\(activeCard\.linkKey\)/);
});

test("BYOK settings keep the key session-only and call the local AI gateway", () => {
  assert.match(page, /API URL[\s\S]*?ref=\{apiUrlInputRef\}/);
  assert.match(page, /API Key[\s\S]*?type="password"/);
  assert.match(page, /模型 ID[\s\S]*?value=\{apiModel\}/);
  assert.match(page, /window\.sessionStorage\.setItem\("explore-api-key", apiKey\.trim\(\)\)/);
  assert.match(page, /window\.localStorage\.setItem\("explore-api-url"/);
  assert.match(page, /window\.localStorage\.setItem\("explore-api-model"/);
  assert.doesNotMatch(page, /localStorage\.setItem\("explore-api-key"/);
  assert.match(page, /fetch\("\/api\/ai"/);
  assert.match(page, /disabled=\{sending\}/);
});

test("saving BYOK settings verifies the live connection and shows a status lamp", () => {
  assert.match(
    page,
    /type ApiConnectionStatus = "idle" \| "checking" \| "connected" \| "error"/,
  );
  assert.match(page, /const saveApiSettings = async \(event: FormEvent\)/);
  assert.match(page, /setApiConnectionStatus\("checking"\)/);
  assert.match(page, /content: "请用一句简短中文确认连接测试成功。"/);
  assert.match(page, /if \(!response\.ok\)/);
  assert.match(page, /setApiConnectionStatus\("connected"\)/);
  assert.match(page, /setApiConnectionStatus\("error"\)/);
  assert.match(page, /apiConnectionTestRef\.current !== testId/);
  assert.match(page, /className=\{`api-status \$\{apiConnectionStatus\}`\}/);
  assert.match(page, /role="status"/);
  assert.match(page, /resetApiConnectionStatus\(\)/);
  assert.match(page, /apiConnectionStatus === "checking"\s+\? "正在检验…"/);
  assert.match(css, /\.api-status\.checking i[\s\S]*api-status-pulse/);
  assert.match(css, /\.api-status\.connected i[\s\S]*background: var\(--text\)/);
  assert.match(css, /\.api-status\.error i[\s\S]*border: 2px solid var\(--text\)/);
});

test("AI gateway requests structured annotations without persisting credentials", () => {
  assert.match(apiRoute, /API URL 必须使用 HTTPS/);
  assert.match(apiRoute, /hostname === "localhost"/);
  assert.match(apiRoute, /Authorization: `Bearer \$\{apiKey\}`/);
  assert.match(apiRoute, /只返回 JSON/);
  assert.match(apiRoute, /function normalizeTerms/);
  assert.match(apiRoute, /answer\.slice\(requestedStart, requestedEnd\) === text/);
  assert.match(apiRoute, /accepted\.length >= 6/);
  assert.match(apiRoute, /Cache-Control": "no-store"/);
  assert.doesNotMatch(apiRoute, /localStorage|sessionStorage|console\.(?:log|error)/);
});

test("the central stack contains only the active ancestry path", () => {
  assert.match(page, /buildCardStackLayout\(cards, activeCardId\)/);
  assert.match(page, /const activePath: ConversationCardState\[\] = \[\]/);
  assert.match(page, /const ancestors = activePath\.slice\(0, -1\)\.reverse\(\)/);
  assert.match(page, /const pathCards = ancestors\.slice\(0, 2\)/);
  assert.match(page, /\{stackedCards\.map\(/);
  assert.match(page, /"--stack-rotation": `\$\{rotation\}deg`/);
  assert.match(page, /data-card-id=\{card\.id\}/);
  assert.match(page, /L\{depth\} · \{card\.id\.slice\(-5\)\}/);
  assert.match(page, /data-stack-mode="active-path"/);
  assert.match(css, /\.stacked-card:hover,[\s\S]*translate\(var\(--stack-x\), var\(--stack-hover-y\)\)/);
});

test("off-path subtrees collapse into stable left and right branch docks", () => {
  assert.match(page, /const branchDocks: Array</);
  assert.match(page, /offPathChildren[\s\S]*!pathIds\.has\(child\.id\)/);
  assert.match(page, /totalCards: countSubtree\(card\.id\)/);
  assert.match(page, /leftBranchDocks[\s\S]*rightBranchDocks/);
  assert.match(page, /className="branch-rail branch-rail-left"/);
  assert.match(page, /className="branch-rail branch-rail-right"/);
  assert.match(page, /onClick=\{\(\) => activateCard\(card\.id\)\}/);
  assert.match(css, /\.branch-rail-left \.branch-dock:hover[\s\S]*translateX\(12px\)/);
  assert.match(css, /\.branch-rail-right \.branch-dock:hover[\s\S]*translateX\(-12px\)/);
});

test("deep ancestry becomes readable title docks instead of more full cards", () => {
  assert.match(page, /deepAncestors: ancestors\.slice\(2\)/);
  assert.match(page, /deepAncestors\.map\(\(card, index\) =>/);
  assert.match(page, /className="branch-dock ancestor-dock"/);
  assert.match(page, /更早路径 · L\{index \+ 3\}/);
  assert.match(css, /\.ancestor-dock[\s\S]*border-style: dashed/);
});

test("mind universe edges connect each actual parent to its child", () => {
  assert.match(page, /buildUniverseLayout\(cards, activeCardId\)/);
  assert.match(page, /const placeSubtree = \(card: ConversationCardState\)/);
  assert.match(page, /childXs\.length > 0[\s\S]*childXs\[0\][\s\S]*childXs\[childXs\.length - 1\]/);
  assert.match(page, /sidePadding \+ leafIndex\+\+ \* leafGap/);
  assert.match(page, /\.filter\(\(\{ parentPosition \}\) => parentPosition\)/);
  assert.match(page, /data-parent-card-id=\{card\.parentId \?\? "root"\}/);
  assert.match(page, /data-child-card-id=\{card\.id\}/);
  assert.match(page, /parentPosition\?\.x[\s\S]*position\.x[\s\S]*position\.y/);
  assert.match(page, /isOnActivePath \? "active-edge " : ""/);
  assert.match(page, /width=\{universeTree\.canvasWidth\}/);
  assert.match(page, /height=\{universeTree\.canvasHeight\}/);
  assert.match(page, /preserveAspectRatio="xMinYMin meet"/);
  assert.match(css, /\.universe-tree \{[\s\S]*contain: layout paint/);
  assert.doesNotMatch(
    css.match(/\.universe-tree \{[\s\S]*?\n\}/)?.[0] ?? "",
    /min-width|min-height/,
  );
  assert.match(
    css,
    /\.universe-canvas path \{[\s\S]*stroke: color-mix\(in srgb, var\(--text\) 30%, transparent\)[\s\S]*stroke-dasharray: none[\s\S]*opacity: 0\.72/,
  );
  assert.match(css, /path\.active-edge[\s\S]*stroke-width: 2\.2/);
});

test("hover lifts a background card without changing its layer", () => {
  const hoverRule =
    css.match(/\.stacked-card:hover,[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(hoverRule, /translate\(var\(--stack-x\), var\(--stack-hover-y\)\)/);
  assert.doesNotMatch(hoverRule, /z-index|opacity|filter|box-shadow/);
});

test("palette is grayscale and typography prioritizes Microsoft YaHei", () => {
  assert.match(css, /font-family: "Microsoft YaHei", "微软雅黑"/);
  const hexColors = [...`${page}\n${css}`.matchAll(/#[0-9a-fA-F]{6}/g)].map(
    ([value]) => value,
  );
  for (const value of hexColors) {
    const red = value.slice(1, 3).toLowerCase();
    const green = value.slice(3, 5).toLowerCase();
    const blue = value.slice(5, 7).toLowerCase();
    assert.equal(red, green, `${value} is not grayscale`);
    assert.equal(green, blue, `${value} is not grayscale`);
  }
});
