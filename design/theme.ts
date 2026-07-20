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
 * 버전: v2.1 · 2026-07-20
 * v1.3/v1.4/v1.5: 신규 토큰 0 — 병합분 없음(S25). 값 정본은 이 파일, 변경 사유는 CHANGELOG.md.
 * S26(v2.0 완성도): 드리프트 정리 — accent.bright / semantic.successBright / nodeCategory.*Bright / gradient.viewportActive·shaderSphere 신규, 중간 회색·근-검정 표면·yellow 변형 흡수. 버전 번호 유지(v2.0).
 * v2.1: 신규 토큰 0. radius/shadow.skeletonStatus → floatingPill 개명(그래프 스켈레톤 상태 필 + 캔버스 add-node pill 공용, X14). 나머지는 현행 승인/문서 정정.
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
    letterbox: "#08090b",      // Webcam/Video 프리뷰 레터박스 (= appDarker) [D8]
  },

  // ── Overlay channels (알파 파생용 명명 토큰) [D9] ────────────────────
  // 캔버스 텍스처/오버레이 레이어에서 white/black 채널을 코드가 직접
  // 파생하지 않도록 이름을 부여. withAlpha(<hex>, a) 로 사용.
  overlay: {
    gridDot: "rgba(255,255,255,0.045)",  // 노드 캔버스 도트 그리드
    scrim: "rgba(0,0,0,0.5)",            // GPU 칩(향후 몰입 모드) 공용 스크림 [B-1 v1.2: 범위 축소 — 모달 백드롭은 withAlpha(appDarker,0.72) M7-U5]
    track: "rgba(255,255,255,0.18)",     // Video 스크럽 트랙 등 중립 트랙/필 표면 [B-4]
  },

  // ── Gradients (종점을 토큰으로) [D10] ────────────────────────────────
  gradient: {
    // 뷰포트 빈/오프 상태 배경 (surface.app 근처 2종점 radial). 정본 — 모든 empty/off
    // 뷰포트가 이 값을 쓴다(Viewport/Welcome/System States/node-connect empty). [S26-E]
    emptyState: "radial-gradient(circle at 50% 40%, #10131a 0%, #0a0b0e 70%)",
    // 활성 뷰포트 navy 백드롭 (셰이더 구체 뒤). [S26-E]
    viewportActive: "radial-gradient(circle at 50% 42%, #12325e 0%, #0c1c38 40%, #080a10 80%)",
    // 셰이더 프리뷰 구체(디폴트 미리보기 렌더). 5종점, 복붙 금지 — 이 문자열이 정본. [S26-E]
    shaderSphere: "radial-gradient(circle at 40% 32%, #bcdcff 0%, #4ba3ff 26%, #2b6fe0 52%, #12336b 78%, #08152e 100%)",
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
    bright: "#7dbcff",   // hover보다 밝은 단계 — 틴트 배경 위 아이콘/텍스트·a:hover. [S26-B]
    active: "#2b6fe0",
    muted: "#1c3452",
  },

  // ── Text ────────────────────────────────────────────────────────────
  text: {
    // [S26-A] 중간 회색 유령값 흡수 — 새 토큰 없이 기존 단계로 통일:
    //   #565e68 / #59626c / #5f7488 → muted   ·   #8f97a1 / #8890a0 → secondary   ·   #c2c8d0 → brightBody
    primary: "#e7eaee",
    emphasis: "#ffffff",    // 순백 강조 — 인라인 rename 편집 중 상태 [B-2]
    brightBody: "#c4cad2",
    secondary: "#9aa2ac",
    muted: "#656d78",
    disabled: "#454c55",
  },

  // ── Semantic ────────────────────────────────────────────────────────
  semantic: {
    success: "#34d399",
    successBright: "#6fe3b8",  // 밝은 success — GPU active 표시·Shader perf 배지. [S26-D]
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
    sourceBright: "#6fd6a3", // source 카테고리의 밝은 변형 (Webcam 렌즈 링 등) [B-3]
    // [S26-D] 카테고리 밝은 변형 — 선택/호버/아이콘·배지의 lighten 변형(기존엔 source만 있었음).
    processBright: "#7dbcff", // = accent.bright
    valueBright: "#e2ba57",   // value 아이콘·perf 배지 yellow 통합(#f4d774 흡수)
    outputBright: "#ee7fac",
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
  // [B-7 / Q10] standalone 웹폰트 번들은 취소(v1.3). 번들 예산(385 KiB, 여유 ~2.1 KiB)
  // 충돌 + woff2 산출물 부재로, standalone export 는 system-ui 폴백을 그대로 유지한다.
  // 브랜드 타이포(IBM Plex Sans)는 앱 UI 에만 웹폰트로 로드되고 export 에는 싣지 않는다.
  // → fontBundle 토큰은 소비 불가한 서술 문자열이라 제거(src/theme.ts 미포팅, Q10-b).
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
    transportBar: 12,          // 풀 트랜스포트 바
    overlay: 9,                // 풀 뷰포트 오버레이 버튼
    transportBarCompact: 11,   // 컴팩트(≤990px) 트랜스포트 바 [B-5]
    overlayCompact: 8,         // 컴팩트 오버레이 버튼 [B-5]
    floatingPill: 10,          // 캔버스 플로팅 필 (그래프 스켈레톤 상태 + add-node pill 공용) [B-6·X14]
  },

  // ── Shadow ──────────────────────────────────────────────────────────
  shadow: {
    nodeCard: "0 8px 20px rgba(0,0,0,0.5)",
    nodeCardHero: "0 12px 30px rgba(0,0,0,0.6)",
    selectRing: "0 0 0 1.5px rgba(61,155,255,0.75), 0 0 18px rgba(61,155,255,0.4)",
    errorRing: "0 0 0 1.5px rgba(240,85,92,0.7), 0 0 18px rgba(240,85,92,0.35)",
    // 권한 차단 카드 링. errorRing 과 동일한 0.7 알파 패밀리 일관성 유지 [D12].
    warnRing: "0 0 0 1.5px rgba(245,177,61,0.7), 0 0 14px rgba(245,177,61,0.3)",
    // 캔버스 플로팅 필 (그래프 스켈레톤 상태 + add-node pill 공용). nodeCard 패밀리 + blur 24 [B-6·X14].
    floatingPill: "0 8px 24px rgba(0,0,0,0.5)",
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
