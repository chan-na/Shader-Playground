export const meta = {
  name: "design-refactor",
  description:
    "design/ 핸드오프 v1을 마일스톤 순서로 재구현 — fable 설계·검증, 하위 모델 구현, Q&A 에스컬레이션",
  whenToUse:
    "디자인 핸드오프(.dc.html + src/theme.ts)를 실제 UI 코드로 반영할 때. args: { only?: ['M0'...], branch?, allowSpecUpdates?: bool, commit?: bool }",
  phases: [
    { title: "Setup", detail: "작업 트리 확인 · 브랜치 · 베이스라인 게이트" },
    { title: "M0 토큰 배선", detail: "theme.ts 배선 + cssVars :root 주입 + hex 치환" },
    { title: "M1 App Shell", detail: "툴바 · 도킹 패널 · 상태바 셸" },
    { title: "M2 Node Editor", detail: "React Flow nodeTypes/edgeTypes · 포트 지오메트리" },
    { title: "M3 Viewport", detail: "grid 분할 + 실제 WebGL 캔버스 + 오버레이" },
    { title: "M4 Code Editor", detail: "CodeMirror HighlightStyle + 거터/툴팁 크롬" },
    { title: "M5 Side Panel", detail: "Inspector/Assets/Problems + 폼 컨트롤 라이브러리" },
    { title: "M6 Palette·Welcome·Export", detail: "⌘K 팔레트 · 웰컴 · Export/Share" },
    { title: "M7 System States", detail: "empty / loading / error / permission" },
    { title: "M8 Motion", detail: "트랜지션 유틸 + 연결 인터랙션 타이밍" },
    { title: "Report", detail: "잔여 hex 스캔 + 최종 요약" },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────────────────────
const ROOT = "/Users/channa/Repository/github/chan-na/ShaderPlayground"
const IMPL_MODEL = "sonnet" // 일반 구현 담당 (토큰 절약)
const ORACLE_MODEL = "fable" // 설계 결정 · 검증 · 트리아지 담당 (정확도)
const SCAN_MODEL = "haiku" // 기계적 스캔 · 커밋
const MAX_QA_ROUNDS = 2 // 하위 모델 시도 횟수 (초과 시 fable이 직접 구현)
const MAX_VERIFY_ROUNDS = 3
const MAX_GATE_ROUNDS = 4

// args가 JSON 문자열로 전달되는 경우 방어 (문자열이면 파싱 실패 시 무시)
const A = (() => {
  if (!args) return {}
  if (typeof args === "string") {
    try {
      return JSON.parse(args)
    } catch {
      return {}
    }
  }
  return args
})()
const BRANCH = A.branch || "design/handoff-v1"
const ONLY = Array.isArray(A.only) ? A.only : null
const ALLOW_SPEC_UPDATES = A.allowSpecUpdates === true
const DO_COMMIT = A.commit !== false

// ─────────────────────────────────────────────────────────────────────────────
// 공통 제약 (CLAUDE.md 요약 — 모든 구현/수정 프롬프트에 삽입)
// ─────────────────────────────────────────────────────────────────────────────
const CONSTRAINTS = `
[품질 제약 — CLAUDE.md, 위반 금지]
- TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes. any / as-unknown-as 캐스팅으로 우회 금지.
- Biome warn 0건 유지. 새 biome-ignore 추가 금지 (필요하면 blocked로 반환해 상위에 질문).
- Knip 0건: 새 export는 같은 변경 안에서 실제 호출자/임포터를 함께 연결. 고아 export 금지.
- 순환 의존성 0건: store끼리 직접 상호 import 금지, 공통 의존은 별도 모듈로.
- 커버리지 임계(lines 50 / functions 47 / branches 42 / statements 50) 하락 금지 — 신규 로직에 *.test.ts(x) 동반.
- 게이트 설정 파일(tsconfig/biome.json/knip.json/vitest.config.ts/playwright 스펙) 완화 금지. test.skip/fixme 금지.
- ${
  ALLOW_SPEC_UPDATES
    ? "tests/e2e/** 스펙 수정은 사용자가 사전 승인함 — 단, 새 디자인 값/경로를 단언하는 방향만 허용 (expect 삭제·완화·skip 금지). 수정했다면 summary에 파일·사유를 반드시 명시."
    : "tests/e2e/** 수정 절대 금지 — 스펙 갱신이 필요하다고 판단되면 수정하지 말고 status:'blocked' + questions로 반환하라 (사용자 승인 필요 사항)."
}
- 색·radius·shadow·모션 값은 src/theme.ts의 tokens.* 또는 파생된 var(--*)만 사용. 컴포넌트에 raw hex 직접 쓰기 금지.
- 커밋하지 마라 — 커밋은 워크플로우가 별도 단계에서 수행한다.
- 마무리 전 자가 검증: npx tsc --noEmit, 그리고 수정 파일에 npx biome check --write 를 돌려 통과시켜라.`

// ─────────────────────────────────────────────────────────────────────────────
// 마일스톤 정의 (의존도 순서 — 브리프 마일스톤과 동일)
// ─────────────────────────────────────────────────────────────────────────────
const MILESTONES = [
  {
    id: "M0",
    phase: "M0 토큰 배선",
    design: ["design/README.md (§Design Tokens)", "design/Foundations.dc.html"],
    screens: ["design/screens/10-foundations.png"],
    hints: ["src/theme.ts", "src/main.tsx", "src/index.css"],
    goal: `src/theme.ts를 앱 테마의 단일 출처로 배선한다 (구현의 토대).
- cssVars()로 :root CSS 변수를 파생해 전역 주입 (main.tsx에서 style 주입 등 — knip에 걸리지 않게 실제 호출자와 함께 배선).
- IBM Plex Sans / JetBrains Mono 폰트 도입 (self-host 권장, design/README.md §Assets 참조) + font 토큰 적용.
- src/index.css 등 전역/공용 스타일의 하드코딩 색을 tokens.* 또는 var(--*) 참조로 치환.
- 이후 마일스톤부터 "컴포넌트에 hex 직접 사용 금지" 규칙이 성립해야 한다 (화면별 잔여 hex는 각 화면 마일스톤에서 치환).
- ★ knip 부채 해소: 현재 knip이 src/theme.ts를 미사용 파일로 잡는다 (베이스라인 기지 부채). M0 완료 시 knip 0건이 되도록 theme.ts의 모든 export(tokens, cssVars, PORT_DIAMETER, Tokens)의 import 그래프를 살려야 한다. 아직 소비처가 없는 export(예: PORT_DIAMETER는 M2에서 사용)는 (a) 토큰 불변식을 검증하는 의미 있는 단위 테스트로 커버하거나(knip entry에 *.test.ts 포함) (b) 소비 마일스톤까지 제거해뒀다 재도입 — 플래너가 결정하고 notes에 근거를 기록하라. 테스트만을 위한 인위적 export 사용은 지양(CLAUDE.md).`,
    checks: [
      ":root에 --surface-* / --border-* / --accent-* / --text-* / semantic 변수가 런타임에 실제 주입되는지",
      "src/index.css에 tokens와 어긋나는 raw hex가 남지 않았는지",
      "tokens / cssVars / PORT_DIAMETER의 호출 그래프가 살아있는지 (knip 0건)",
    ],
  },
  {
    id: "M1",
    phase: "M1 App Shell",
    design: ["design/README.md (§A)", "design/App Shell.dc.html"],
    screens: ["design/screens/01-app-shell.png"],
    hints: [
      "src/App.tsx",
      "src/ui/NodeEditor/Toolbar.tsx",
      "src/ui/Panels/StatusBar.tsx",
      "src/ui/Panels/SidePanel.tsx",
    ],
    goal: `App Shell — 앱 프레임 전체. 나머지 화면이 여기 얹힌다.
- 세로 flex: Top toolbar 48px → content(flex:1) → status bar(~34px).
- content는 도킹 영역: 좌 Node Editor / 우상 Viewport / 우하 Side Panel / 하단 Code Editor. 최소 리사이즈+접기 지원 (풀 도킹/팝아웃 범위는 플래너가 기존 구조·비용을 보고 결정).
- 도킹 헤더 공통 컴포넌트(모든 패널 재사용): grab dots + 대문자 라벨(letterSpacing 0.9) + mono 메타 배지 + ⤢/⌄ 버튼, 높이 34px.
- 툴바(좌→우): 브랜드 마크 → 구분선 → 노드 팔레트 버튼(카테고리 색 타일+글리프) → More → 구분선 → Presets → spacer → Undo/Redo → 녹화/Export/Share → Clear.
- 상태바: compiled/idle 상태 점(semantic 색) · 노드/엣지 수 · GPU ms · fps · u_time (mono 11px).`,
    checks: [
      "도킹 헤더가 공통 컴포넌트로 추출되어 4개 패널에서 재사용되는지",
      "툴바/상태바 구성 요소와 높이가 App Shell.dc.html 인라인 값과 일치하는지",
    ],
  },
  {
    id: "M2",
    phase: "M2 Node Editor",
    design: [
      "design/README.md (§B + 포트 지오메트리 규칙)",
      "design/Node Editor.dc.html",
      "src/theme.ts (하단 포트 지오메트리 주석)",
    ],
    screens: ["design/screens/02-node-editor.png"],
    hints: [
      "src/ui/NodeEditor/index.tsx",
      "src/ui/NodeEditor/nodes/ (13종 노드 뷰 + PortHandle.tsx)",
      "src/ui/NodeEditor/nodeUiRegistry.ts",
      "src/ui/NodeEditor/NodeThumbnail.tsx",
    ],
    goal: `Node Editor — React Flow 커스텀 nodeTypes/edgeTypes 리스킨. ★가장 큼, 시각 정체성의 절반.
- 캔버스: surface.app 배경 + 도트 그리드 (radial-gradient, 22px).
- 노드 카드: 헤더(카테고리 색 아이콘 박스 + 타이틀 + 메타칩, nodeCategory 그라디언트) + 본체(라이브 썸네일 96px 또는 값/메타). radius.nodeCard, shadow.nodeCard.
- Handle = 포트: 형태=방향(input hollow ring 2.5px border / output solid disc + portOutputGlow), 색=portFamily (portTypeToFamily 매핑). PORT_DIAMETER 준수.
- §포트 지오메트리 규칙 준수: input x=left, output x=left+width, center y=top+portTop+5.5. portTop은 노드 실제 높이 안에.
- 엣지: 베지어, stroke 2.5, 색=소스 포트 패밀리. 유효(실선)/무효(빨강 점선)/드래그(점선 애니메이션).
- 노드 상태: default / selected(selectRing) / multi-select / error(errorRing + 카운트 뱃지).
- 오버레이: 미니맵(카테고리 색 블록) + 줌 컨트롤. React Flow의 줌/팬/연결 히트영역은 존중.`,
    checks: [
      "포트 이중 인코딩: input=hollow ring, output=solid disc, 색=portFamily — PortHandle 구현 확인",
      "Handle 배치가 포트 지오메트리 규칙(theme.ts 하단 주석)과 일치하는지",
      "엣지 stroke 2.5 + 소스 포트 패밀리 색인지",
      "노드 상태 4종(default/selected/multi/error)이 tokens의 ring shadow를 쓰는지",
    ],
  },
  {
    id: "M3",
    phase: "M3 Viewport",
    design: ["design/README.md (§C)", "design/Viewport.dc.html"],
    screens: ["design/screens/03-viewport.png"],
    hints: ["src/ui/Viewport/index.tsx", "src/ui/Panels/ViewportControls.tsx"],
    goal: `Viewport — grid 분할 + 실제 WebGL2 캔버스. gradient 자리표시는 디자인 레퍼런스일 뿐, 구현에선 진짜 GL 캔버스가 grid cell에 들어간다.
- 분할: 1=단일 / 2=1fr 1fr / 3=상단2+하단full / 4=2×2. display:grid + gap 1px + 분할선 색은 border.headerDivider 토큰.
- pane 오버레이(DOM): 좌상단 라벨(A/B/C/D+이름), 우상단 GPU ms 뱃지(success), 좌하단 해상도.
- 하단 트랜스포트 바(중앙 플로팅, 블러 배경): 재생/정지 · u_time 스크럽 · 배속 · FOV · Reset.
- 빈 상태: Output 미연결 시 중앙 아이콘 + "No Output connected" + 온보딩 힌트.`,
    checks: [
      "gradient 자리표시자가 없고 실제 WebGL 캔버스가 렌더되는지",
      "분할 지오메트리(2+1, 2×2)와 분할선 토큰 사용",
      "오버레이가 GL 캔버스 위 DOM으로만 구현됐는지",
    ],
  },
  {
    id: "M4",
    phase: "M4 Code Editor",
    design: ["design/README.md (§D)", "design/Code Editor.dc.html"],
    screens: ["design/screens/04-code-editor.png"],
    hints: ["src/ui/CodeEditor/ (glslSetup.ts, index.tsx, StageTabs.tsx, lintAdapter.ts, hover.ts)"],
    goal: `Code Editor — CodeMirror 6 테마 리스킨. 에디터 자체 재발명 금지.
- tokens.syntax로 HighlightStyle.define 커스텀 (GLSL 시맨틱 하이라이팅 색).
- 거터(라인 번호 muted, 에러 라인 표시) / 인라인 에러 밑줄 + hover 메시지 / 자동완성 팝업 / 툴팁 크롬을 tokens로 테마.
- 탭: vertex/fragment 전환, 에러 시 탭 헤더 빨강 점.
- 다중 선택 배너: 노드 2+ 선택 시 상태 표시.`,
    checks: [
      "HighlightStyle 색이 전부 tokens.syntax 참조인지",
      "기존 CodeMirror 확장(자동완성/린트/rename 등) 기능이 깨지지 않았는지",
    ],
  },
  {
    id: "M5",
    phase: "M5 Side Panel",
    design: ["design/README.md (§E)", "design/Side Panel.dc.html"],
    screens: ["design/screens/05-side-panel.png"],
    hints: [
      "src/ui/Panels/ (SidePanel, Inspector, UniformControl, AssetBrowser, ProblemsPanel 등)",
      "신규: src/ui/controls/ (공통 폼 컨트롤 라이브러리)",
    ],
    goal: `Side Panel — Inspector / Assets / Problems 탭 리스킨 + 폼 컨트롤 라이브러리 추출.
- 폼 컨트롤(슬라이더·다축 슬라이더·컬러 피커·토글·셀렉트·숫자입력)을 공통 컴포넌트로 추출해 인스펙터 전반에서 재사용. 기존 UniformControl 등의 중복 구현을 이 라이브러리로 통합.
- Inspector: uniform 자동 컨트롤 (float→슬라이더, vec2/3/4→다축, 색→컬러, bool→토글). 8종 인스펙터 커버.
- Assets: 썸네일 그리드, 드래그&드롭, "노드로 추가".
- Problems: 에러 목록 → 클릭 시 노드 선택 + 코드 라인 점프, 탭 헤더 카운트 뱃지.`,
    checks: [
      "폼 컨트롤이 공통 컴포넌트로 추출되고 인스펙터들이 실제로 재사용하는지 (중복 스타일 구현 잔존 여부)",
      "Inspector/Assets/Problems 탭 크롬이 디자인과 일치하는지",
    ],
  },
  {
    id: "M6",
    phase: "M6 Palette·Welcome·Export",
    design: [
      "design/README.md (§F/G/H)",
      "design/Command Palette.dc.html",
      "design/Welcome.dc.html",
      "design/Export & Share.dc.html",
    ],
    screens: [
      "design/screens/06-command-palette.png",
      "design/screens/07-welcome.png",
      "design/screens/08-export-share.png",
    ],
    hints: ["src/ui/CommandPalette/", "src/ui/BootstrapGate.tsx", "src/export/htmlExport.ts (UI 진입점)"],
    goal: `Command Palette · Welcome · Export/Share 세 화면.
- Command Palette: ⌘K 퍼지 검색 오버레이(Linear/Raycast 스타일) — 결과 그룹핑, 키보드 네비, 우측 단축키 힌트.
- Welcome: 첫 진입 화면 — 데모 그래프/프리셋 진입점 + 온보딩 (기존 진입 흐름과 통합 방식은 플래너 결정).
- Export & Share: 단일 HTML export, URL 공유, 녹화(WebM/GIF) 흐름의 모달/패널 UI.`,
    checks: ["세 화면 각각이 대응 .dc.html의 레이아웃·색·타이포와 일치하는지"],
  },
  {
    id: "M7",
    phase: "M7 System States",
    design: ["design/README.md (§I)", "design/System States.dc.html"],
    screens: ["design/screens/09-system-states.png"],
    hints: [
      "src/ui/Viewport/index.tsx (빈 상태)",
      "src/ui/Toasts.tsx",
      "src/ui/ErrorBoundary.tsx",
      "src/ui/RecoveryDialog.tsx",
    ],
    goal: `System States — 각 영역의 empty / loading / error / permission 상태.
- Empty: 빈 그래프 / 빈 뷰포트 온보딩. Loading: 스피너·진행바·스켈레톤 시머.
- Permission: 카메라/마이크 권한 요청·거부 상태. Error: 컴파일 에러 오버레이, WebGL2 unavailable 블로킹 화면.
- 상태는 실제 앱 상태 로직(store)에 연결되어야 한다 — 데모용 정적 화면이 아님.`,
    checks: ["각 상태가 실제 상태 로직에 연결되는지 (webcam 거부, WebGL 부재 등 트리거 경로 확인)"],
  },
  {
    id: "M8",
    phase: "M8 Motion",
    design: [
      "design/README.md (§L + §Interactions)",
      "design/node-connect.jsx",
      "design/Motion - Connect.dc.html",
    ],
    screens: ["design/screens/13-motion-connect.png"],
    hints: ["src/theme.ts (motion 토큰)", "신규: 트랜지션 유틸 모듈", "src/ui/NodeEditor/"],
    goal: `Motion — node-connect.jsx의 타이밍(90–150ms, cubic-bezier(.2,.7,.3,1))을 트랜지션 유틸로.
- tokens.motion을 참조하는 공통 트랜지션/keyframe 유틸 모듈을 만들고, 각 화면의 개별 하드코딩 duration/easing을 이 유틸로 치환.
- 연결 인터랙션: 드래그 중 호환 입력 포트 하이라이트(펄스 링) + 비호환 dim(opacity ~0.4) → 스냅 펄스 → 엣지 확정. 타이밍은 node-connect.jsx 기준.
- 발광/펄스는 상태 표시(녹화·에러·선택·컴파일)에만. 상시 애니메이션 금지.`,
    checks: [
      "duration/easing이 tokens.motion 참조로만 쓰이는지 (하드코딩 잔존 grep)",
      "상시 루프 애니메이션이 추가되지 않았는지",
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 스키마
// ─────────────────────────────────────────────────────────────────────────────
const SETUP_SCHEMA = {
  type: "object",
  required: ["ok", "reason"],
  properties: {
    ok: { type: "boolean" },
    branch: { type: "string" },
    reason: { type: "string", description: "실패 사유 또는 베이스라인 상태 요약" },
  },
}

const PLAN_SCHEMA = {
  type: "object",
  required: ["units", "notes"],
  properties: {
    units: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "title", "instructions", "files", "tests", "acceptance"],
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          instructions: { type: "string", description: "구현 지시 — 파일별 변경 내용, 참조할 디자인 값 위치, 주의점" },
          files: { type: "array", items: { type: "string" } },
          tests: { type: "string", description: "추가/갱신할 단위 테스트" },
          acceptance: { type: "array", items: { type: "string" } },
        },
      },
    },
    notes: { type: "string", description: "아키텍처 결정 사항 기록" },
  },
}

const IMPL_SCHEMA = {
  type: "object",
  required: ["status", "summary"],
  properties: {
    status: { type: "string", enum: ["done", "blocked"] },
    summary: { type: "string", description: "변경 요약 + 주요 결정. blocked면 지금까지의 부분 진행 상태" },
    filesTouched: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      items: {
        type: "object",
        required: ["question", "context"],
        properties: {
          question: { type: "string" },
          context: { type: "string", description: "시도한 조사 + 검토한 선택지" },
        },
      },
    },
  },
}

const ANSWER_SCHEMA = {
  type: "object",
  required: ["answers"],
  properties: {
    answers: {
      type: "array",
      items: {
        type: "object",
        required: ["question", "answer"],
        properties: { question: { type: "string" }, answer: { type: "string" } },
      },
    },
    guidance: { type: "string", description: "추가 지침" },
  },
}

const VERDICT_SCHEMA = {
  type: "object",
  required: ["pass", "issues"],
  properties: {
    pass: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "description", "files"],
        properties: {
          severity: { type: "string", enum: ["blocker", "major", "minor"] },
          description: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          fixHint: { type: "string" },
        },
      },
    },
    visualNotes: { type: "string", description: "스크린샷 대조 결과 (수행했다면)" },
  },
}

const GATE_SCHEMA = {
  type: "object",
  required: ["checkPass", "e2ePass", "failures"],
  properties: {
    checkPass: { type: "boolean" },
    e2ePass: { type: "boolean", description: "check 실패로 e2e를 못 돌렸으면 false" },
    failures: {
      type: "array",
      items: {
        type: "object",
        required: ["gate", "summary"],
        properties: {
          gate: { type: "string", enum: ["typecheck", "lint", "deadcode", "circular", "unit", "e2e"] },
          summary: { type: "string" },
          detail: { type: "string", description: "핵심 에러 메시지 / 실패 스펙명" },
        },
      },
    },
  },
}

const TRIAGE_SCHEMA = {
  type: "object",
  required: ["fixes", "specChanges"],
  properties: {
    fixes: {
      type: "array",
      items: {
        type: "object",
        required: ["instruction", "files"],
        properties: {
          instruction: { type: "string", description: "근본 원인 + 구체적 수정 지시" },
          files: { type: "array", items: { type: "string" } },
        },
      },
    },
    specChanges: {
      type: "array",
      description: "의도된 디자인 변경이라 E2E 스펙 갱신이 필요한 항목 (약화 아님 — 새 디자인 값을 단언)",
      items: {
        type: "object",
        required: ["spec", "reason", "proposedChange"],
        properties: {
          spec: { type: "string", description: "스펙 파일 + 테스트명" },
          reason: { type: "string", description: "왜 회귀가 아니라 의도된 변경인지" },
          proposedChange: { type: "string" },
        },
      },
    },
  },
}

const COMMIT_SCHEMA = {
  type: "object",
  required: ["committed"],
  properties: {
    committed: { type: "boolean" },
    sha: { type: "string" },
    message: { type: "string" },
  },
}

const HEX_SCAN_SCHEMA = {
  type: "object",
  required: ["count", "summary"],
  properties: {
    count: { type: "number" },
    summary: { type: "string", description: "파일별 잔여 raw hex 사용 요약" },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 프롬프트 빌더
// ─────────────────────────────────────────────────────────────────────────────
function refBlock(m) {
  return `[디자인 레퍼런스 — 반드시 직접 읽을 것]
- ${m.design.join("\n- ")}
- src/theme.ts — 토큰 단일 출처 (색/radius/shadow/모션/포트 규칙)
- 스크린샷: ${m.screens.join(", ")}
.dc.html은 사내 디자인 툴 포맷이다. 프레임워크는 무시하고 인라인 스타일의 정확한 hex·px·폰트·radius 값만 읽어라 (그 hex를 코드에 직접 쓰지 말고 대응하는 tokens.* 를 찾아 참조).`
}

function plannerPrompt(m) {
  return `당신은 ShaderPlayground 디자인 리팩터링의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}, 이전 마일스톤 변경이 이미 반영돼 있을 수 있음).

[마일스톤 ${m.id}] ${m.goal}

${refBlock(m)}

[현재 코드 진입점 힌트]
- ${m.hints.join("\n- ")}
- Architecture.md — 모듈 경계 / SPEC.md — 기능 명세

[할 일]
디자인 레퍼런스와 현재 코드를 직접 읽고, 이 마일스톤을 2~6개의 순차 작업 유닛으로 분해하라. 각 유닛은:
- 하위 모델(sonnet)이 이 지시만 보고 구현할 수 있을 만큼 구체적으로: 어떤 파일을 어떻게 바꾸는지, 어떤 디자인 값(.dc.html 어느 부분)을 참조하는지, 기존 코드의 어떤 패턴을 따르는지.
- 유닛 간 의존 순서대로 정렬 (앞 유닛의 결과 위에 뒤 유닛이 얹힘).
- knip 제약: 새 export는 같은 유닛에서 호출자 연결. 새 공통 컴포넌트는 첫 사용처와 같은 유닛에.
- tests: 커버리지 임계 유지를 위해 추가할 단위 테스트를 명시.
- acceptance: 검증자가 확인할 구체 기준.
기존 기능(상태 로직, 상호작용)은 보존하고 스킨/구조만 디자인에 맞춘다는 원칙. 파괴적 재작성이 필요하면 notes에 사유를 기록하라.
${CONSTRAINTS}`
}

function implPrompt(m, unit, answersBlock, priorSummary) {
  const prior = priorSummary
    ? `\n[이전 시도의 부분 진행 상태 — 작업 트리에 이미 반영됨]\n${priorSummary}\n이어서 진행하라 (처음부터 다시 하지 말 것).`
    : ""
  const ans = answersBlock
    ? `\n[아키텍트(상위 모델)의 답변 — 이 결정을 따르라]\n${answersBlock}`
    : ""
  return `당신은 ShaderPlayground 디자인 리팩터링의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[마일스톤 ${m.id} — 작업 유닛 ${unit.id}: ${unit.title}]
${unit.instructions}

[대상 파일] ${unit.files.join(", ")}
[테스트] ${unit.tests}
[수용 기준]
- ${unit.acceptance.join("\n- ")}

${refBlock(m)}
${prior}${ans}

[진행 규칙]
- 확신 없는 설계 결정(토큰 의미 해석, 포트 지오메트리, 스토어/모듈 경계, 기존 동작 변경 여부, 스펙 충돌)은 추측하지 말고 status:'blocked' + questions로 반환하라. 각 질문에는 조사한 내용과 검토한 선택지를 context로 첨부.
- 사소한 구현 디테일은 스스로 결정하라. blocked는 정말 갈림길일 때만.
- 완료 시 status:'done', summary에 변경 요약과 주요 결정을 기록하라.
${CONSTRAINTS}`
}

function oraclePrompt(m, unit, questions, priorSummary) {
  const qs = questions
    .map((q, i) => `${i + 1}. ${q.question}\n   (context: ${q.context})`)
    .join("\n")
  return `당신은 ShaderPlayground 디자인 리팩터링의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
하위 구현 에이전트가 [마일스톤 ${m.id} / 유닛 ${unit.id}: ${unit.title}] 작업 중 다음 질문에 막혔다.

[유닛 지시]
${unit.instructions}

[구현 에이전트의 진행 상태]
${priorSummary || "(없음)"}

[질문]
${qs}

${refBlock(m)}

저장소 코드와 디자인 문서(design/README.md, design/DESIGN_BRIEF.md, 해당 .dc.html, Architecture.md)를 직접 확인하고, 각 질문에 단정적으로 답하라 — 구체적 파일/값/패턴을 지정하고 선택지 중 하나를 결정해줄 것. 애매한 답변 금지. 하위 모델이 그대로 실행할 수 있는 수준으로.`
}

function verifierPrompt(m, plan, round) {
  const acceptance = plan.units
    .map((u) => `- [${u.id}] ${u.acceptance.join(" / ")}`)
    .join("\n")
  return `당신은 ShaderPlayground 디자인 리팩터링의 검증자다. 저장소: ${ROOT} (브랜치 ${BRANCH}). 검증 라운드 ${round}.

[마일스톤 ${m.id}] ${m.goal}

[검증 대상] 아직 커밋되지 않은 작업 트리 변경. git status 와 git diff 로 이번 마일스톤의 변경을 파악하라.

${refBlock(m)}

[수용 기준 (플래너가 정의)]
${acceptance}

[마일스톤 특화 체크]
- ${m.checks.join("\n- ")}

[공통 체크]
- 새/수정 파일에 raw hex 직접 사용이 없는지 (tokens.* / var(--*) 참조만). grep -rn 으로 확인, src/theme.ts 는 예외.
- 기존 기능(상태 로직·상호작용·단축키)이 스킨 변경으로 깨지지 않았는지.
- 게이트 설정 파일이나 Playwright 스펙이 무단으로 약화되지 않았는지 (git diff로 확인).

[시각 대조 — 가능하면 수행]
- npm run dev 를 백그라운드로 띄우고(이미 떠 있으면 재사용), 스크래치 디렉터리에 일회용 Playwright 스크립트를 작성해 해당 화면의 스크린샷을 찍어라. WebGL 렌더는 playwright.config.ts의 SwiftShader 플래그를 참고.
- 찍은 스크린샷과 ${m.screens.join(", ")} 를 Read로 열어 비교하라. 픽셀 diff가 아니라 구조·색·타이포·간격·상태 표현의 일치를 본다.
- 브라우저 실행이 불가하면 visualNotes에 그 사실을 남기고 코드 대조만으로 판단하라.

[판정]
- .dc.html 인라인 값과의 불일치, 수용 기준 미충족, 규칙 위반을 issues로 반환. severity: blocker(기능 파손/규칙 위반) / major(디자인 불일치) / minor(사소한 다듬기).
- blocker/major가 없으면 pass:true. minor만 있으면 pass 가능 (issues에는 남겨라).`
}

function designFixPrompt(m, issues) {
  const list = issues
    .map((i, n) => `${n + 1}. [${i.severity}] ${i.description}\n   파일: ${i.files.join(", ")}${i.fixHint ? `\n   힌트: ${i.fixHint}` : ""}`)
    .join("\n")
  return `당신은 ShaderPlayground 디자인 리팩터링의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
검증자가 [마일스톤 ${m.id}]에서 다음 문제를 발견했다. 전부 수정하라.

${list}

${refBlock(m)}

수정이 불가능하거나 설계 판단이 필요한 항목은 status:'blocked' + questions로 반환하라.
${CONSTRAINTS}`
}

function gatePrompt(m) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 품질 게이트를 실행하고 결과만 보고하라. 아무것도 수정하지 마라.

1) npm run check — Bash timeout 600000ms로 실행. (내부: typecheck → lint → deadcode → circular → unit test, 실패 시 즉시 중단됨)
2) 1)이 성공했을 때만: npm run test:e2e — timeout 600000ms. 10분 초과가 우려되면 npx playwright test tests/e2e/<파일> 로 나눠 전체 스펙을 커버하라 (임의 생략 금지). dev 서버는 자동으로 뜬다.

각 실패를 gate(typecheck|lint|deadcode|circular|unit|e2e) 별로 분류하고, detail에 핵심 에러 메시지/실패 스펙명·라인을 담아라. 통과했으면 failures는 빈 배열.`
}

function triagePrompt(m, failures) {
  return `당신은 ShaderPlayground 디자인 리팩터링의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
[마일스톤 ${m.id}] 작업 후 품질 게이트가 실패했다. 실패 목록:

${JSON.stringify(failures, null, 2)}

저장소를 직접 조사해 각 실패의 근본 원인을 파악하고 분류하라:
- fixes: 코드 결함/회귀 — 하위 모델이 그대로 실행할 수 있는 구체적 수정 지시 (근본 원인 포함, 증상 덮기 금지).
- specChanges: 이번 디자인 변경이 의도한 UI 변화 때문에 기존 E2E expectation이 더 이상 유효하지 않은 경우만. proposedChange는 새 디자인 값을 단언하는 방향이어야 하며, expect 삭제·test.skip 같은 약화는 절대 제안하지 마라. 판단 근거(디자인 문서상 의도)를 reason에 명시.
확신이 없으면 회귀(fixes) 쪽으로 분류하라.`
}

function gateFixPrompt(m, triage, allowSpec) {
  const fixes = triage.fixes
    .map((f, n) => `${n + 1}. ${f.instruction}\n   파일: ${f.files.join(", ")}`)
    .join("\n")
  const specs =
    allowSpec && triage.specChanges.length
      ? `\n[승인된 E2E 스펙 갱신 — 새 디자인 값을 단언하는 방향으로만]\n${triage.specChanges.map((s, n) => `${n + 1}. ${s.spec}: ${s.proposedChange}\n   근거: ${s.reason}`).join("\n")}`
      : ""
  return `당신은 ShaderPlayground 디자인 리팩터링의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
품질 게이트 실패에 대한 아키텍트의 수정 지시다. 전부 적용하라.

[수정 지시]
${fixes}${specs}

적용 후 관련 게이트만 표적 재실행해 확인하라 (예: npx tsc --noEmit, npx vitest run <파일>, npx playwright test <스펙>). 전체 게이트는 별도 단계에서 재실행된다.
지시가 잘못됐다고 판단되면 임의 변경하지 말고 status:'blocked' + questions로 반환하라.
${CONSTRAINTS}`
}

function commitPrompt(m, unitSummaries) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 마일스톤 변경을 커밋하라.
1) git add -A
2) git commit — 제목: "design(${m.id}): ${m.phase.replace(/^M\d+ /, "")} 리스킨". 본문: 아래 변경 요약을 bullet 몇 개로 정리하고, 마지막 줄에 정확히 다음을 넣어라:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

[변경 요약]
${unitSummaries}

--no-verify 등 hook 우회 플래그 금지. 커밋 후 sha를 반환하라.`
}

// ─────────────────────────────────────────────────────────────────────────────
// 실행 루틴
// ─────────────────────────────────────────────────────────────────────────────

// 구현 유닛 1개: 하위 모델 시도 → blocked면 fable 오라클 Q&A → 재시도 → 최종 fable 직접 구현
async function runUnit(m, unit) {
  let answersBlock = ""
  let priorSummary = ""
  for (let round = 0; round <= MAX_QA_ROUNDS; round++) {
    const escalated = round === MAX_QA_ROUNDS
    const res = await agent(implPrompt(m, unit, answersBlock, priorSummary), {
      label: `impl:${m.id}/${unit.id}${round > 0 ? `:r${round}` : ""}${escalated ? ":fable" : ""}`,
      phase: m.phase,
      model: escalated ? ORACLE_MODEL : IMPL_MODEL,
      schema: IMPL_SCHEMA,
    })
    if (!res) return { unit: unit.id, status: "agent-lost" }
    if (res.status === "done")
      return { unit: unit.id, status: "done", summary: res.summary, escalated }
    priorSummary = res.summary || priorSummary
    const qs = res.questions || []
    if (escalated || qs.length === 0)
      return { unit: unit.id, status: "blocked", summary: priorSummary }
    log(`  ${m.id}/${unit.id}: 구현이 질문 ${qs.length}건으로 막힘 → fable 오라클에 질의`)
    const ans = await agent(oraclePrompt(m, unit, qs, priorSummary), {
      label: `oracle:${m.id}/${unit.id}`,
      phase: m.phase,
      model: ORACLE_MODEL,
      effort: "high",
      schema: ANSWER_SCHEMA,
    })
    if (!ans) return { unit: unit.id, status: "oracle-lost", summary: priorSummary }
    answersBlock =
      ans.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n") +
      (ans.guidance ? `\n\n추가 지침: ${ans.guidance}` : "")
  }
  return { unit: unit.id, status: "blocked", summary: priorSummary }
}

// 디자인 검증 루프: fable 검증 → blocker/major를 하위 모델이 수정 → 재검증
async function verifyLoop(m, plan) {
  for (let round = 1; round <= MAX_VERIFY_ROUNDS; round++) {
    const v = await agent(verifierPrompt(m, plan, round), {
      label: `verify:${m.id}:r${round}`,
      phase: m.phase,
      model: ORACLE_MODEL,
      effort: "high",
      schema: VERDICT_SCHEMA,
    })
    if (!v) return { pass: false, note: "verifier lost" }
    const blocking = (v.issues || []).filter((i) => i.severity !== "minor")
    if (v.pass || blocking.length === 0)
      return { pass: true, round, minors: (v.issues || []).filter((i) => i.severity === "minor").length }
    if (round === MAX_VERIFY_ROUNDS)
      return { pass: false, remaining: blocking.map((i) => i.description) }
    log(`  ${m.id} 검증 r${round}: blocker/major ${blocking.length}건 → 수정 투입`)
    const fixRes = await agent(designFixPrompt(m, blocking), {
      label: `design-fix:${m.id}:r${round}`,
      phase: m.phase,
      model: round >= MAX_VERIFY_ROUNDS - 1 ? ORACLE_MODEL : IMPL_MODEL,
      schema: IMPL_SCHEMA,
    })
    if (fixRes && fixRes.status === "blocked" && (fixRes.questions || []).length) {
      const ans = await agent(
        oraclePrompt(m, { id: "design-fix", title: "검증 이슈 수정", instructions: designFixPrompt(m, blocking) }, fixRes.questions, fixRes.summary),
        { label: `oracle:${m.id}/design-fix`, phase: m.phase, model: ORACLE_MODEL, effort: "high", schema: ANSWER_SCHEMA },
      )
      if (ans) {
        const answersBlock = ans.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
        await agent(designFixPrompt(m, blocking) + `\n\n[아키텍트 답변 — 이 결정을 따르라]\n${answersBlock}`, {
          label: `design-fix:${m.id}:r${round}b`,
          phase: m.phase,
          model: IMPL_MODEL,
          schema: IMPL_SCHEMA,
        })
      }
    }
  }
  return { pass: false, note: "max verify rounds" }
}

// 게이트 루프: 실행 → fable 트리아지 → 수정 (스펙 갱신은 승인 필요) → 재실행
async function gateLoop(m) {
  const pending = []
  for (let attempt = 1; attempt <= MAX_GATE_ROUNDS; attempt++) {
    const g = await agent(gatePrompt(m), {
      label: `gate:${m.id}:r${attempt}`,
      phase: m.phase,
      model: IMPL_MODEL,
      effort: "low",
      schema: GATE_SCHEMA,
    })
    if (!g) return { green: false, pending, note: "gate agent lost" }
    if (g.checkPass && g.e2ePass) return { green: true, pending, attempts: attempt }
    if (attempt === MAX_GATE_ROUNDS)
      return { green: false, pending, failures: g.failures.map((f) => `${f.gate}: ${f.summary}`) }
    const triage = await agent(triagePrompt(m, g.failures), {
      label: `triage:${m.id}:r${attempt}`,
      phase: m.phase,
      model: ORACLE_MODEL,
      effort: "high",
      schema: TRIAGE_SCHEMA,
    })
    if (!triage) return { green: false, pending, note: "triage lost" }
    if (triage.specChanges.length > 0 && !ALLOW_SPEC_UPDATES) {
      pending.push(...triage.specChanges)
      return {
        green: false,
        stop: true,
        pending,
        note: "E2E 스펙 갱신에 사용자 승인 필요 — allowSpecUpdates:true로 재개하거나 스펙을 직접 검토할 것",
      }
    }
    if (triage.fixes.length === 0 && triage.specChanges.length === 0)
      return { green: false, pending, note: "트리아지가 수정 항목을 내지 못함", failures: g.failures.map((f) => `${f.gate}: ${f.summary}`) }
    log(`  ${m.id} 게이트 r${attempt}: 수정 ${triage.fixes.length}건, 스펙 갱신 ${triage.specChanges.length}건 적용`)
    await agent(gateFixPrompt(m, triage, ALLOW_SPEC_UPDATES), {
      label: `gate-fix:${m.id}:r${attempt}`,
      phase: m.phase,
      model: attempt >= MAX_GATE_ROUNDS - 1 ? ORACLE_MODEL : IMPL_MODEL,
      schema: IMPL_SCHEMA,
    })
  }
  return { green: false, pending, note: "max gate rounds" }
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────
phase("Setup")
log(`브랜치 ${BRANCH} 준비 + 베이스라인 게이트 확인`)
const setup = await agent(
  `저장소 ${ROOT} 준비 단계. 순서대로:
1) git status --porcelain 확인 — 작업 트리가 더러우면(추적 파일 변경 존재) ok:false, reason에 상태 요약을 담아 반환하고 종료. 아무것도 수정/스태시하지 마라.
2) 깨끗하면 브랜치 ${BRANCH}로 전환 (없으면 현재 HEAD에서 생성: git switch -c ${BRANCH} 또는 git switch ${BRANCH}).
3) node_modules가 없으면 npm ci.
4) 베이스라인 확인: npm run check 를 timeout 600000ms로 실행. 실패하면 ok:false + reason에 실패 게이트 요약 (수정하지 마라 — 베이스라인이 빨간 상태에선 리팩터링을 시작하지 않는다).
   단 하나의 예외: deadcode(knip) 실패가 src/theme.ts 관련(미배선 핸드오프 파일의 unused file/exports)뿐이고 다른 게이트는 모두 통과라면, 이는 M0이 해소할 기지(旣知) 부채이므로 ok:true로 진행하고 reason에 그 사실을 기록하라. knip이 다른 파일도 잡으면 예외 없이 ok:false.
모두 통과하면 ok:true, branch, reason에 베이스라인 상태 한 줄.`,
  { label: "setup", model: IMPL_MODEL, effort: "low", schema: SETUP_SCHEMA },
)
if (!setup || !setup.ok)
  return { status: "aborted", reason: setup ? setup.reason : "setup agent lost" }

const report = []
let stopped = null

for (const m of MILESTONES) {
  if (ONLY && !ONLY.includes(m.id)) continue
  phase(m.phase)
  log(`── ${m.id} 시작: fable 플래너로 유닛 분해`)

  const plan = await agent(plannerPrompt(m), {
    label: `plan:${m.id}`,
    phase: m.phase,
    model: ORACLE_MODEL,
    effort: "high",
    schema: PLAN_SCHEMA,
  })
  if (!plan || !plan.units || plan.units.length === 0) {
    report.push({ milestone: m.id, status: "planner-failed" })
    stopped = `${m.id}: 플래너 실패`
    break
  }
  log(`  ${m.id} 계획: ${plan.units.length}개 유닛 — ${plan.units.map((u) => u.title).join(" / ")}`)

  const unitResults = []
  for (const unit of plan.units) {
    const r = await runUnit(m, unit)
    unitResults.push(r)
    log(`  ${m.id}/${unit.id}: ${r.status}${r.escalated ? " (fable 인계)" : ""}`)
  }

  const verify = await verifyLoop(m, plan)
  const gate = await gateLoop(m)

  let commit = null
  if (gate.green && DO_COMMIT) {
    const summaries = unitResults
      .map((r) => `- [${r.unit}] ${(r.summary || r.status).slice(0, 300)}`)
      .join("\n")
    commit = await agent(commitPrompt(m, summaries), {
      label: `commit:${m.id}`,
      phase: m.phase,
      model: SCAN_MODEL,
      effort: "low",
      schema: COMMIT_SCHEMA,
    })
  }

  report.push({
    milestone: m.id,
    plan: { units: plan.units.map((u) => u.title), notes: plan.notes },
    units: unitResults.map((r) => ({ unit: r.unit, status: r.status })),
    designVerify: verify,
    gates: gate,
    commit: commit ? { sha: commit.sha, committed: commit.committed } : null,
  })

  if (gate.stop) {
    stopped = `${m.id}: ${gate.note}`
    break
  }
  if (!gate.green) {
    stopped = `${m.id}: 게이트를 초록으로 만들지 못함 — 사람 개입 필요`
    break
  }
}

phase("Report")
const hexScan = await agent(
  `저장소 ${ROOT}에서 raw hex 색상 사용 잔여를 스캔하라 (읽기 전용 — 수정 금지).
grep -rnE '#[0-9a-fA-F]{3,8}\\b' src --include='*.ts' --include='*.tsx' --include='*.css' 실행 후,
src/theme.ts 와 *.test.* 파일은 제외하고 파일별 건수를 집계해 count(총건수)와 summary(파일별 요약)로 반환하라.`,
  { label: "hex-scan", model: SCAN_MODEL, effort: "low", schema: HEX_SCAN_SCHEMA },
)

return {
  branch: BRANCH,
  allowSpecUpdates: ALLOW_SPEC_UPDATES,
  stopped,
  milestones: report,
  residualHex: hexScan || { count: -1, summary: "scan failed" },
}
