/**
 * ShaderPlayground — Design Tokens (SINGLE SOURCE OF TRUTH)
 * =========================================================
 * 이 파일이 모든 색/타이포/모션 값의 유일한 출처다.
 * 디자인을 바꾸면 여기서 바꾸고, README·컴포넌트는 이 값을 "참조"만 한다.
 * (README에는 hex를 복붙하지 말 것 — drift의 원인.)
 *
 * 재구현 시 이 파일을 src/theme.ts 로 옮기고, 필요하면 :root CSS 변수로도
 * 파생(예: --surface-panel: #131519). 아래 cssVars() 참고.
 *
 * 버전: v1 · 2026-07-13
 */

export const tokens = {
  // ── Surface (elevation, 어두운 → 밝은) ──────────────────────────────
  surface: {
    appDarker: "#08090b",      // 앱 최외곽 배경
    app: "#0b0c0e",            // 캔버스 / 뷰포트 바탕
    panel: "#131519",          // 패널 본체
    card: "#1a1d22",           // 카드 · 버튼 기본
    input: "#22262c",          // 입력 필드
    hover: "#2a2f36",          // 호버
    dockingHeader: "#101216",  // 도킹 패널 헤더
    rail: "#0f1114",           // 좌측 레일
    nodeCard: "linear-gradient(180deg,#1e2126,#16181c)", // 노드 카드 본체
  },

  // ── Border ──────────────────────────────────────────────────────────
  border: {
    default: "#20242a",
    strong: "#2b3037",
    stronger: "#3a414a",
    headerDivider: "#17191e",
    node: "#0b0c0e",           // 노드 카드 외곽
  },

  // ── Accent (브랜드 블루) ─────────────────────────────────────────────
  accent: {
    default: "#3d9bff",
    hover: "#57a9ff",
    active: "#2b6fe0",
    muted: "#1c3452",
  },

  // ── Text ────────────────────────────────────────────────────────────
  text: {
    primary: "#e7eaee",
    brightBody: "#c4cad2",
    secondary: "#9aa2ac",
    muted: "#656d78",
    disabled: "#454c55",
  },

  // ── Semantic ────────────────────────────────────────────────────────
  semantic: {
    success: "#34d399",
    warning: "#f5b13d",
    error: "#f0555c",
    info: "#3d9bff",
  },

  // ── Node categories (노드 카드 헤더/아이콘) ──────────────────────────
  // 헤더 그라디언트: linear-gradient(180deg, rgba(<hex>,0.22~0.30), rgba(<hex>,0.08~0.12))
  nodeCategory: {
    source: "#4bbf89",     // Mesh · Image · Webcam · Video · Audio
    process: "#3d9bff",    // Shader · Compute
    output: "#e05c93",     // Output
    value: "#d4a53c",      // Param · Math · Swizzle · Combine
    container: "#77828f",  // Group
  },

  // ── Port type families ★ (형태=방향, 색=타입 패밀리) ─────────────────
  // 6종 포트를 4패밀리로 그룹핑. input = hollow ring, output = solid disc.
  portFamily: {
    resource: "#a06bff",   // mesh, texture
    scalar: "#7ed957",     // float
    vector: "#f0b429",     // vec2, vec3, vec4
    matrix: "#2dd4bf",     // mat (예약)
  },
  // 브리프 6종 → 패밀리 매핑 (색맹 대응 위해 형태도 함께 인코딩)
  portTypeToFamily: {
    mesh: "resource", texture: "resource",
    float: "scalar",
    vec2: "vector", vec3: "vector", vec4: "vector",
  } as const,

  // ── Code syntax (CodeMirror 6 HighlightStyle) ───────────────────────
  syntax: {
    keyword: "#c586c0",
    type: "#4ec9b0",
    variable: "#9cdcfe",
    function: "#dcdcaa",
    number: "#b5cea8",
    comment: "#6a737d",
    string: "#ce9178",
  },

  // ── Typography ──────────────────────────────────────────────────────
  font: {
    ui: "'IBM Plex Sans', system-ui, sans-serif",     // 400/500/600/700
    mono: "'JetBrains Mono', monospace",               // 400/500/600
  },
  // 대표 사이즈(px): 배지 8-11 · 본문 11-13 · 화면 제목 14-15
  // 패널 헤더 라벨: 대문자 + letterSpacing 0.8~0.9px

  // ── Radius (px) ─────────────────────────────────────────────────────
  radius: {
    nodeCard: 11,
    button: 7,
    input: 7,
    chip: 6,
    iconBox: 5,
    panel: 14,
  },

  // ── Shadow ──────────────────────────────────────────────────────────
  shadow: {
    nodeCard: "0 8px 20px rgba(0,0,0,0.5)",
    nodeCardHero: "0 12px 30px rgba(0,0,0,0.6)",
    selectRing: "0 0 0 1.5px rgba(61,155,255,0.75), 0 0 18px rgba(61,155,255,0.4)",
    errorRing: "0 0 0 1.5px rgba(240,85,92,0.7), 0 0 18px rgba(240,85,92,0.35)",
    portOutputGlow: (famHex: string) => `0 0 7px ${famHex}aa`,
  },

  // ── Motion ──────────────────────────────────────────────────────────
  // 발광/펄스는 상태 표시(녹화·에러·선택·컴파일)에만. 상시 애니메이션 금지.
  motion: {
    durationMs: { min: 90, max: 150 },
    easing: "cubic-bezier(.2,.7,.3,1)",
  },
} as const;

/** 포트 지름(px). 카드 컨텍스트=11, 히어로/모션=13 */
export const PORT_DIAMETER = { card: 11, hero: 13 } as const;

/**
 * 포트 지오메트리 규칙 (React Flow Handle 배치 시 준수):
 *   input  x = node.left
 *   output x = node.left + node.width
 *   center y = node.top + portTop + 5.5
 * portTop 은 노드 실제 높이(header 30 + pad 9 + previewH + pad 9) 안에 들 것.
 * 엣지 path 는 위 포트 중심 좌표에 맞춘 베지어(stroke-width 2.5, 색=소스 패밀리).
 */

/** :root CSS 변수로 파생하고 싶을 때 (선택) */
export function cssVars(): string {
  const t = tokens;
  return [
    ...Object.entries(t.surface).map(([k, v]) => `--surface-${kebab(k)}: ${v};`),
    ...Object.entries(t.border).map(([k, v]) => `--border-${kebab(k)}: ${v};`),
    ...Object.entries(t.accent).map(([k, v]) => `--accent-${kebab(k)}: ${v};`),
    ...Object.entries(t.text).map(([k, v]) => `--text-${kebab(k)}: ${v};`),
    ...Object.entries(t.semantic).map(([k, v]) => `--${k}: ${v};`),
  ].join("\n");
}
function kebab(s: string) { return s.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()); }

export type Tokens = typeof tokens;
