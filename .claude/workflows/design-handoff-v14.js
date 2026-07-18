export const meta = {
  name: "design-handoff-v14",
  description:
    "디자인 핸드오프 v1.3(Q1~Q11) + v1.4(R1~R15) 코드 반영 — Phase A 병렬 팬아웃, Phase B 도킹 모델 교체 직렬 체인. 자율 완주.",
  whenToUse:
    "design/ 번들 v1.3(b6ef934) + v1.4(3a1981d)의 디자이너 정본을 코드에 반영할 때. 사용자에게 묻지 않고 끝까지 진행하며, 판단 필요 항목은 temp/design-followup-v1.4.md에 모은다. args: { only?: ['A1'...], branch?, allowSpecUpdates?: bool, commit?: bool }",
  phases: [
    { title: "Setup", detail: "브랜치 · v1.3/v1.4 번들 확인 · 베이스라인 게이트" },
    { title: "A1 Palette·Starter", detail: "Q1 needs-Mesh 배지 · Q1-b 비네트 · R13 Info+ (병렬)" },
    { title: "A2 Port Stride", detail: "Q7 실측 → PORT_STRIDE 확정 (R15: 실측값이 정본)" },
    { title: "A3 Rationale Sync", detail: "Q2·Q3·Q5·Q6·Q8·Q11 주석 근거 갱신 + Q4·Q10 확인 (병렬)" },
    { title: "B1 Dock Model", detail: "트리 모델 + 순수함수 + 단위테스트 (dir:col 정정)" },
    { title: "B2 Tree Renderer", detail: "App.tsx 재귀 렌더러 — 불변식: 기존 E2E 무수정 통과" },
    { title: "B3 Header·Tabs", detail: "R4 접기/최대화 · R6 ✕ · R8 오버플로" },
    { title: "B4 Drag·Drop", detail: "R10 pointer · 고스트 · 드롭 존 · 프리뷰" },
    { title: "B5 Diagnostics Move", detail: "R5 problems→상태바 · diagnostics→하단 오버레이" },
    { title: "B6 Persist·Compact", detail: "R9 localStorage · ＋Panel/Reset · R11 <990 폴백" },
    { title: "B7 E2E Specs", detail: "도킹 신규 스펙" },
    { title: "Report", detail: "Q/R 커버리지 · 잔여 hex · 번들 사이즈(참고)" },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────────────────────
const ROOT = "/Users/channa/Repository/github/chan-na/ShaderPlayground"
const IMPL_MODEL = "sonnet" // 일반 구현 담당 (토큰 절약)
const ORACLE_MODEL = "fable" // 설계 결정 · 검증 · 트리아지 담당 (정확도)
const SCAN_MODEL = "haiku" // 기계적 스캔 · 커밋 · 격리
const MAX_QA_ROUNDS = 2 // 하위 모델 시도 횟수 (초과 시 fable이 직접 구현)
const MAX_VERIFY_ROUNDS = 3
const MAX_GATE_ROUNDS = 4

const FOLLOWUP_DOC = "temp/design-followup-v1.4.md"

// args가 JSON 문자열로 전달되는 경우 방어
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
const BRANCH = A.branch || "design/handoff-v1.4"
const ONLY = Array.isArray(A.only) ? A.only : null
const ALLOW_SPEC_UPDATES = A.allowSpecUpdates !== false
const DO_COMMIT = A.commit !== false

// ─────────────────────────────────────────────────────────────────────────────
// 공통 제약
// ─────────────────────────────────────────────────────────────────────────────
const AUTONOMY = `
[자율 완주 원칙 — 중요]
- 이 워크플로우는 **사용자에게 묻지 않고 끝까지 진행**한다. 사람의 답을 기다리며 멈추는 선택지는 없다.
- status:'blocked'는 **상위 모델(fable 아키텍트)에게 에스컬레이션하는 내부 신호**다 — 사용자에게 묻는 게 아니다. 갈림길에서 판단이 서지 않으면 blocked + questions로 반환하면 fable이 결정해준다.
- 사용자/디자이너 결정이 "진짜로" 필요해 보여도 **멈추지 마라**. 대신:
  1) 되돌리기 쉬운 **잠정 결정**으로 진행한다 (우선순위: 기존 토큰/패턴 근사 → 현행 유지 + 사유 주석 → 최소 변경).
  2) followups에 기록한다 (audience: 'user' | 'designer', 무엇을 왜 잠정 결정했는지 + 정식 결정 시 바꿀 위치).
- followups는 ${FOLLOWUP_DOC} 로 취합된다. 기록하면 그 항목은 "처리된 것"이다 — 다시 막히지 마라.`

const CONSTRAINTS = `
[품질 제약 — CLAUDE.md, 위반 금지]
- TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes. any / as-unknown-as 캐스팅 우회 금지.
- Biome warn 0건 유지. **새 biome-ignore 추가 금지** — 리팩터로 해소하라. 불가하면 followups(audience:'user')에 기록 후 현행 유지.
- Knip 0건: 새 export는 같은 변경 안에서 실제 호출자/임포터를 함께 연결. 고아 export 금지.
- 순환 의존성 0건: store끼리 직접 상호 import 금지.
- 커버리지 임계(lines 50 / functions 47 / branches 42 / statements 50) 하락 금지 — 신규 로직에 *.test.ts(x) 동반.
- 게이트 설정 파일(tsconfig/biome.json/knip.json/vitest.config.ts/scripts/check-bundle-size.mjs) **완화 금지**. vitest coverage.exclude에 신규 파일 추가 금지.

[토큰 규칙 — v1.3/v1.4 공통]
- **v1.3·v1.4 모두 "신규 토큰 0"이 명시된 번들이다.** src/theme.ts에 **새 토큰을 추가하지 마라.**
  토큰이 부족하면: (1) 의미가 가장 가까운 기존 토큰으로 근사 + 근거 주석 → (2) 현행 유지 + 사유 주석. 어느 쪽이든 followups(audience:'designer')에 기록. 값을 지어내지 마라.
- 색·radius·shadow·모션은 src/theme.ts의 tokens.* 또는 var(--*)만 사용. 컴포넌트에 raw hex 직접 금지.
- **src/theme.ts를 덮어쓰지 마라.** design/theme.ts(디자이너 정본)와 src/theme.ts(런타임 정본, **상위집합**)는 둘 다 유지되며, src에는 구현 파생 export(nodeCardSolid·emptyStateIcon·cardLg·modal·thumbnailInset·onCanvasText·overlayBar·shadow.modal)와 헬퍼(withAlpha·cssVars)가 더 있다. v1.1에 덮어쓰기로 구현 export가 소실된 실사고가 있었다. v1.3/v1.4는 신규 토큰 0이라 **병합할 것이 없다** — theme.ts는 원칙적으로 손대지 않는다.
- canvas 2D API는 CSS 변수를 못 읽는다 → 그 경우만 tokens.* 직접 import.
- 예외: ErrorBoundary 크래시 폴백 + src/export/standalonePlayer.js 폴백은 **의도적으로 토큰 비의존**(README §도메인 [D6], v1.3 Q11에서 재확정). 토큰화를 강행하지 마라.
${
  ALLOW_SPEC_UPDATES
    ? `
[E2E 스펙 정책]
tests/e2e/** 스펙 수정은 사용자가 사전 승인함 — 단 **강화 방향만**: 새 디자인 값/경로를 단언하도록 갱신하는 것만 허용. expect 삭제·완화·test.skip·test.fixme는 절대 금지. 수정했다면 파일·테스트명·사유를 summary와 followups(audience:'user')에 반드시 남겨라.`
    : `
[E2E 스펙 정책]
tests/e2e/** 수정 금지 — 코드 쪽에서 해결하고, 불가하면 followups(audience:'user')에 기록 후 진행하라.`
}

[번들]
- 번들 사이즈 가드(385 KiB)는 CI 잡이며 이 워크플로우의 게이트가 아니다. **현재 382.92 KiB — 여유 2.1 KiB뿐**이고 Phase B(도킹)는 순수 증분 코드라 **한도 초과가 거의 확실**하다.
- 초과하더라도 **scripts/check-bundle-size.mjs를 절대 수정하지 마라** — 한도 상향은 사용자 승인 사항이다. 대신 불필요한 신규 의존성을 넣지 말고, 초과가 보이면 followups(audience:'user')에 기록하라.

[진행]
- 커밋하지 마라 — 커밋은 워크플로우가 별도 단계에서 수행한다.
- 마무리 전 자가 검증: npx tsc --noEmit, 그리고 수정 파일에 npx biome check --write.
${AUTONOMY}`

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ 전 마일스톤 공통 — 정본이 틀린 지점 (에이전트가 dc를 충실히 따르면 버그가 재생산된다)
// ─────────────────────────────────────────────────────────────────────────────
const CANON_DEFECT = `
[⛔ v1.4 정본의 알려진 결함 — dc를 그대로 따르지 마라]
**\`design/Docking Prototype.dc.html\`의 \`_defaultTree()\`(L283 부근)가 \`dir: "row", ratio: 0.556\`인데, 올바른 값은 \`dir: "col"\`이다.**
- v1.4는 **R2 = "App Shell = 기본 레이아웃 정본, 두 화면 구조 일치"** + **R3 = "현행 기본값 유지, 앱 첫 화면 불변"**으로 결정했다. 그런데 dc의 기본 트리가 그 결정을 스스로 위반한다.
- 증거(전부 직접 확인 가능):
  · \`src/state/layoutStore.ts\` — viewportFrac 주석: "shell-right 내부 Viewport : Side Panel **높이** 비율. 디자인 flex:1.25/2.25"
  · \`src/index.css\` \`.shell-right { flex-direction: **column**; }\`
  · \`src/App.tsx\` — \`setViewportFrac(viewportFrac + deltaPx / rect.**height**)\` (높이 기반)
  · \`design/App Shell.dc.html\` L208 \`flex-direction:**column**\` → 안에 L211 \`flex:1.25\`(viewport, \`border-**bottom**\`) + L250 \`flex:1\`(side panel)
  · **결정적**: \`0.556 = 1.25/2.25\` = 구현의 viewportFrac 값 그대로인데 이건 **높이 비율**이다. 즉 **숫자는 맞고 방향만 틀렸다.**
- **같은 오류가 3곳에 전파돼 있다**: \`Docking Prototype.dc.html\` · \`CHANGELOG.md\` §v1.4 R3 · \`README.md\` §M. 오타가 아니라 일관된 착오이므로 "다른 문서를 보면 맞겠지"라고 기대하지 마라.
- **처리: \`dir: "col"\`로 구현하라.** 임의 판단이 아니라 **R2가 준 타이브레이크 규칙의 적용**이다 — R2가 "App Shell = 기본 레이아웃 정본"이라 했고 App Shell은 column이므로 App Shell이 이긴다.
- 다른 두 비율은 검산 통과했으니 그대로 쓰라: \`0.587 = 1.42/2.42\`(leftFrac) ✓ · \`0.717\` → \`round((826-6)×0.717)=588\`, \`826-588-6=232\`(codeHeight) ✓.
- 이 건은 이미 followups(designer)로 기록될 예정이니 **다시 보고할 필요 없다 — 그냥 col로 구현하면 된다.**

[⛔ dc의 또 다른 함정 — 이전 번들의 잔재를 참고하지 마라]
v1.3 번들의 \`Docking Prototype.dc.html\`에는 완결된 **플로팅 창** 구현(\`startResize\`/\`floatWindow\`/\`tabInFloat\`/\`setFloatActive\`/\`closeFloatTab\`/\`floatPanel\`)이 있었으나 **R1에서 "플로팅 없음"으로 확정되어 v1.4에서 전부 제거**됐다. git 이력이나 옛 번들에서 그 코드를 발견하더라도 **참고·구현하지 마라.** 드래그 중 고스트(\`ghost\`) 1개만 존재하고, release 시 반드시 도킹된다(\`_fallbackTarget\` = 첫 region).`

// ─────────────────────────────────────────────────────────────────────────────
// 마일스톤 정의
//   qr           = 이 마일스톤이 반영하는 요청 항목 ID (Q=v1.3, R=v1.4)
//   dependsOn    = 선행 마일스톤 (격리되면 의존 유닛 제외)
//   parallelUnits= true면 유닛을 동시 실행 (파일 disjoint 전제)
//   specPolicy   = 'forbid'면 이 마일스톤에선 E2E 스펙 수정 금지 (불변식 유지용)
// ─────────────────────────────────────────────────────────────────────────────
const MILESTONES = [
  // ── Phase A — v1.3 Q 항목 (파일 disjoint, 팬아웃) ────────────────────────
  {
    id: "A1",
    phase: "A1 Palette·Starter",
    qr: ["Q1", "Q1-b", "R13", "R14"],
    dependsOn: [],
    parallelUnits: true,
    design: [
      "design/CHANGELOG.md (§v1.3 — Q1 · Q1-b / §v1.4 — R13 · R14)",
      "design/README.md (§F Command Palette Shader 템플릿 항목 · §B New Shader starter · §E Diagnostics)",
      "design/Command Palette.dc.html (Shader / Shader: Unlit 항목 + ⚠ needs Mesh 배지)",
      "design/Node Editor.dc.html (우측 'New Shader' 데모 카드 — left:1162px, top:474px)",
      "design/Side Panel.dc.html (Diagnostics 레벨 필터 라벨)",
    ],
    screens: [
      "design/screens/06-command-palette.png",
      "design/screens/02-node-editor.png",
      "design/screens/05-side-panel.png",
    ],
    hints: [
      "src/ui/CommandPalette/index.tsx — shaderTemplates 배열(L208 부근, 현재 Unlit/Noise/Blur/Tonemap/UV Debug/Blend/Composite 3/Mask 8종, 라벨 `Add Shader: {name}`) · CTA 경로(L597~613, starterFrag 사용)",
      "src/ui/AppToolbar.tsx L301~308 — Add Shader가 starterFrag 사용",
      "src/shaders/templates/starter.frag + starter.test.ts",
      "src/ui/Panels/DiagnosticsPanel.tsx L267~271 — <select> 옵션 라벨",
      "src/theme.ts — warning 패밀리 + withAlpha (신규 토큰 금지)",
    ],
    goal: `v1.3 Q1/Q1-b와 v1.4 R13/R14를 반영한다. 유닛끼리 파일이 겹치지 않으므로 **병렬 실행**된다.

- [Q1] **팔레트 Shader 항목 분화.** 현재 팔레트에는 starter 항목이 아예 없다 — starter는 CTA와 AppToolbar만 쓴다. 정본은 두 항목:
  · \`Shader\` = starter. 보조텍스트 "starter · links with or without a mesh". dc 글리프 ◆(U+25C6).
  · \`Shader: Unlit\` = 보조텍스트 "reads surface normals" + **\`⚠ needs Mesh\` 앰버 배지**. dc 글리프 ◇(U+25C7).
  배지 = warning 패밀리 알파(bg 0.12 / border 0.35), 글자 9.5px/600, radius 5, padding 2px 7px. 위치 = 라벨과 NODE 태그 **사이**, flex-shrink:0.
  ⚠ 먼저 확인할 것: 현재 팔레트 커맨드 항목에 **보조텍스트(sub)·경고 배지(warn) 렌더 슬롯이 있는가?** 없으면 신설해야 하고, 그러면 기존 항목들의 레이아웃 회귀를 봐야 한다.
  ⚠ 신규 토큰 금지 — warning 패밀리 + withAlpha로 표현하라.
- [Q1-b] **starter.frag 비주얼 정본 승격.** 정본 레시피 = \`u_baseColor\` 중앙 소프트 글로우 + **다크 비네트** + \`u_time\` 미세 변조. **현재 코드에는 비네트가 없다.** dc의 CSS 그라디언트(circle at 50% 44%, rgba(61,155,255,0.6) 0% → 0.16 34% → transparent 62% / 하단 radial 50% 118% / 배경 #0e1116 / inset radial transparent 52% → rgba(0,0,0,0.45) 100%)가 레시피의 정본 표현이다.
  ⚠ [R14 — 육안 근사 승인됨] dc는 CSS 그라디언트, 구현은 GLSL이다. **stop/지수의 정확한 일치는 불요** — 레시피(중앙 글로우 + 비네트 + 시간 변조)만 지키면 된다. ±4px 규칙은 픽셀 기하용이라 여기 적용되지 않는다. 기계적 이식이 아니라 **레시피 이식**이다.
  주석의 [C-7] 근거에 [Q1-b] 정본 승격을 병기하라.
- [R13] **Diagnostics select 라벨.** dc는 \`Info+/Warn+/Error+/Debug+\`(누적 의미)로 정정됐는데 구현 \`<select>\`는 여전히 \`Info\`다. **라벨만** \`Info+\` 형태로 바꾼다 — **필터 로직은 절대 건드리지 마라**(누적 의미 유지, Q9 결정 = 코드 로직 0).`,
    checks: [
      "팔레트에 `Shader`(starter) + `Shader: Unlit`(⚠ needs Mesh 배지) 두 항목이 있는지, Unlit이 여전히 unlitFrag를 쓰는지(기본 데모 첫 화면 불변)",
      "배지가 raw hex가 아니라 warning 패밀리 토큰 + withAlpha로 표현됐는지",
      "starter.frag에 비네트가 실제로 추가됐는지 (u_baseColor 글로우 + 비네트 + u_time 3요소 모두)",
      "starter.frag가 여전히 v_uv만 소비하는지 — v_normal/v_world를 읽으면 mesh 없이 링크 실패한다 (C-7의 근본)",
      "DiagnosticsPanel의 필터 **로직**이 바뀌지 않았는지 (라벨만 변경, 누적 의미 유지)",
      "src/theme.ts에 새 토큰이 추가되지 않았는지",
    ],
  },
  {
    id: "A2",
    phase: "A2 Port Stride",
    qr: ["Q7", "R15"],
    dependsOn: [],
    parallelUnits: false,
    design: [
      "design/CHANGELOG.md (§v1.3 — Q7 / §v1.4 — R15)",
      "design/README.md (§도메인 — 포트 stride Q7 / §B 포트 지오메트리)",
      "design/Node Editor.dc.html (Combine 카드 — 핸들 44/70/96, 출력 70)",
    ],
    screens: ["design/screens/02-node-editor.png"],
    hints: [
      "src/ui/NodeEditor/nodes/PortHandle.tsx — PORT_STRIDE(L160, 현재 18) · PORT_STRIDE_MULTI(L172, 30) · PORT_TOP_PAD(L174, 38) · portSpanBodyH 주석(L189~207)",
      "src/ui/NodeEditor/nodes/UtilityNodeViews.tsx — Math/Combine 카드",
      "src/index.css — .node-card__field / .node-card__input 행 높이 (실측 대상)",
      "src/ui/NodeEditor/nodes/PortHandle.test.tsx · nodeViews.test.tsx",
    ],
    goal: `[Q7] Math/Combine 카드의 PORT_STRIDE를 **18 → 26**으로 정정한다. 단 **정확값은 실측으로 확정**한다.

- 배경: C-3의 stride 30은 uniform 구동 카드(Shader/Compute)에만 적용됐다. Math/Combine은 **고정 arity이고 포트마다 \`.node-card__field\` 입력 행과 짝**이라, stride가 필드 행 리듬의 **종속변수**다. 현재 18은 자기 필드 행과도 어긋나 있다.
- **[R15 — 실측값이 정본]** 26은 요청서에서 CSS로 계산한 **추정치**(\`.node-card__input\` ≈ 21 + body gap 5)이지 브라우저 실측이 아니다. 디자이너가 "구현이 실측해 정확값 확정"으로 **권한을 위임**했고, R15에서 "실측값이 26이 아니면(25/27 등) 실측값이 정본이고 dc를 사후 정정한다"로 확정했다.
  → **실제로 브라우저에서 측정하라.** npm run dev를 띄우고 스크래치 디렉터리에 일회용 Playwright 스크립트를 써서 Math/Combine 카드의 \`.node-card__field\` / \`.node-card__input\` 행 간격을 getBoundingClientRect로 재라. 그 값이 정본이다.
  → 실측값이 26과 다르면 **실측값을 쓰고 근거를 주석에 남기고** followups(audience:'designer')에 "dc 핸들 44/70/96을 실측값 기준으로 재정정 요청"을 기록하라. **CSS를 26에 맞추려고 건드리지 마라** (R15 선택지 2는 반려됐다).
- **⚠ Q6 좌표계 규칙 준수**: dc의 픽셀(44/70/96)을 **그대로 이식하지 마라.** dc는 카드별 첫 포트 y가 40/44/50/64로 제각각이고 구현은 \`PORT_TOP_PAD=38\` 하나로 통일돼 있다. **stride만** 가져와 구현 좌표계에서 유도하라.
- PortHandle.tsx의 PORT_STRIDE 주석은 현재 *"v1.2가 respec하지 않아 손대지 않고 **v1.3 질문으로 남긴다**"* 라고 적혀 있다 → **정본 반영으로 갱신**하라.
- portSpanBodyH 주석(L189~207)이 *"README 공식이 자기 dc와 안 맞아 구현이 dc를 정본으로 삼았다"* 고 길게 변론 중인데, **v1.3 Q5에서 그 공식이 공식 폐기**되고 규칙 서술로 정정됐다 → "이견"이 아니라 "정본을 따른다"로 톤을 갱신하라 (A3와 겹치지 않게 여기서 처리).`,
    checks: [
      "PORT_STRIDE가 실측 근거와 함께 갱신됐는지 — 주석에 '어떻게 쟀는지'가 남아 있어야 한다",
      "실측값이 26이 아니었다면 followups(designer)에 dc 재정정 요청이 기록됐는지",
      "PORT_STRIDE_MULTI(30)와 PORT_TOP_PAD(38)는 건드리지 않았는지 (Q7 스코프는 Math/Combine 고정 arity 카드만)",
      "src/index.css의 필드 행 높이를 stride에 맞추려고 수정하지 않았는지 (R15가 반려한 방향)",
      "PORT_STRIDE 주석에서 'v1.3 질문으로 남긴다' 류의 미확정 서술이 사라졌는지",
    ],
  },
  {
    id: "A3",
    phase: "A3 Rationale Sync",
    qr: ["Q2", "Q3", "Q4", "Q5", "Q6", "Q8", "Q10", "Q10-b", "Q11", "R12"],
    dependsOn: [],
    parallelUnits: true,
    design: [
      "design/CHANGELOG.md (§v1.3 — Q2·Q3·Q4·Q5·Q6·Q8·Q10·Q10-b·Q11 / §v1.4 — R12)",
      "design/README.md (§도메인 좌표계 Q6 · §B previewH 규칙 Q5 · Compute Q8 · §H standalone Q10/Q11 · §M 패널 dot R12)",
      "design/theme.ts (fontBundle 트리 제거됨 — Q10-b)",
    ],
    screens: [],
    hints: [
      "src/ui/NodeEditor/nodes/VideoNodeView.tsx — node.playing 기준 재생 글리프 (Q2)",
      "src/ui/NodeEditor/nodes/AudioNodeView.tsx — drawSpectrum FFT bin 연속 바 (Q3)",
      "src/ui/NodeEditor/nodes/ComputeNodeView.tsx — body minHeight 확장, 96 floor 미적용 (Q8)",
      "src/export/standalonePlayer.js — 폴백 color:white (Q11) · src/export/htmlExport.ts (Q10)",
      "src/ui/DockPanelHeader.tsx + src/index.css .dock-header-meta — metaAlign end 배지 박스 (Q4)",
      "src/theme.ts — fontBundle이 src에 없음을 확인 (Q10-b, grep 0건이 정상)",
    ],
    goal: `**코드 동작 변경 0건.** v1.2 시점에 "무응답 / 미확정 / v1.3 이월"이라고 적어둔 **주석의 근거를 v1.3/v1.4 정본으로 갱신**한다. 이걸 안 하면 다음 라운드가 같은 질문을 또 만든다. 유닛끼리 파일이 겹치지 않으므로 **병렬 실행**된다.

각 항목은 **현행 승인**이므로 **로직을 바꾸면 안 된다.** 하는 일은 (a) 주석 근거 갱신 (b) 정합 확인뿐이다. 억지로 코드를 바꾸지 마라 — "변경 없음이 정상"인 항목들이다.

- [Q2] VideoNodeView: 재생 글리프 = \`node.playing\`(사용자 의도) **확정**. "정본 미확정" 류 서술이 있으면 갱신.
- [Q3] AudioNodeView drawSpectrum: FFT bin **연속 바 확정**(정보량 최대). dc의 청키 6바는 정적 데모라는 사실을 주석에 남겨라.
- [Q4] DockPanelHeader: \`metaAlign="end"\`도 **배지 박스 유지** 확정 — dc(App Shell 'GLSL · ES 3.0')가 구현으로 수렴한 건이다. **확인만** 하고 코드는 0이어야 한다.
- [Q5] README v1.2 공식 \`max(96,(n−1)·30+56)\`이 **공식 폐기**되고 규칙 서술로 정정됐다(dc 실측 96@3 / 176@6 채택). ※ portSpanBodyH 주석은 A2가 처리하니 **여기서 손대지 마라.**
- [Q6] 포트 좌표계 = **규칙으로 전달** 확정. "dc 픽셀 상수 이식 금지"가 README에 명문화됐다. PortHandle의 v1 편차(PORT_TOP_PAD 38 vs dc 40/44/50/64) 서술을 "정본 규칙"으로 갱신. ※ 역시 A2와 겹치지 않게 조심.
- [Q8] ComputeNodeView: 썸네일이 없어 96 floor 없이 body minHeight만 포트 span 따라 확장 = **v1.3 승인**. 주석에 승인 근거 반영.
- [Q10 / Q10-b] standalone 웹폰트 번들 **취소** — system-ui 폴백 유지. \`fontBundle\` 토큰은 design/theme.ts에서 제거됐고 **src에는 원래 없다**(grep 0건이 정상). htmlExport.ts에 웹폰트 번들 흔적이 없는지 확인만. src/theme.ts 헤더 주석이 design/theme.ts와의 차이를 서술하므로 fontBundle 언급이 있으면 정리.
- [Q11] standalonePlayer.js 폴백 \`color:white\` **현행 유지 확정** — \`?raw\` 인라인이라 보간 지점이 없고 D6(폴백은 토큰 비의존)를 standalone 폴백에도 적용. **토큰화를 시도하지 마라.** 주석에 근거 반영.
- [R12] 패널 dot 5색(accent/source/value/resource/vector)은 **장식적 식별자**일 뿐 노드 카테고리/포트 타입 의미축과 무관함이 확정됐다. 코드 변경 0 — 다만 DockPanelHeader 쪽에 dot 관련 코드가 있다면 "의미 아님" 규칙을 주석으로 남겨라.

작업 전 \`grep -rn "v1.3\\|미확정\\|무응답\\|이월\\|v1.3 question" src/\` 로 대상 지점을 훑어라.`,
    checks: [
      "코드 **동작**이 바뀌지 않았는지 — 이 마일스톤은 주석/문서 갱신만이다. 로직 diff가 있으면 blocker",
      "'v1.3 질문', '무응답', '정본 미확정', '이월' 류 서술이 src에서 사라졌는지 (A2가 처리한 PortHandle 제외)",
      "standalonePlayer.js의 color:white가 토큰화되지 않고 그대로인지 (Q11 = 현행 유지)",
      "src/theme.ts에 fontBundle이 추가되지 않았는지",
      "DockPanelHeader의 metaAlign=end가 배지 박스 그대로인지 (코드 변경 0이 정상)",
    ],
  },

  // ── Phase B — v1.4 도킹 (밀결합, 직렬 체인) ──────────────────────────────
  {
    id: "B1",
    phase: "B1 Dock Model",
    qr: ["R1", "R2", "R3", "R7"],
    dependsOn: [],
    parallelUnits: false,
    specPolicy: "forbid",
    design: [
      "design/CHANGELOG.md (§v1.4 — R1 · R2 · R3 · R7)",
      "design/README.md (§M Docking Prototype — v1.4 정본)",
      "design/Docking Prototype.dc.html (_defaultTree · _layout · _getAt/_setAt · _removePanel · _collect · MIN_W/MIN_H)",
      "design/App Shell.dc.html (기본 레이아웃 정본 — R2)",
    ],
    screens: ["design/screens/14-docking-prototype.png", "design/screens/01-app-shell.png"],
    hints: [
      "src/state/layoutStore.ts — 현행 고정 4패널 모델(leftFrac/viewportFrac/codeHeight/collapsed/maximized). 거의 전부 교체 대상",
      "src/state/layoutStore.test.ts — 기존 테스트",
      "src/App.tsx — 아직 건드리지 마라 (B2에서 교체)",
      "src/index.css .shell-right (L70, flex-direction: column) — R3 방향 근거",
    ],
    goal: `도킹 트리 모델을 **순수 함수 + 스토어**로 구현한다. **렌더러는 아직 건드리지 않는다**(B2). 이 마일스톤의 산출물은 테스트로 검증 가능한 순수 로직이다.

- **모델**: \`split{dir:'row'|'col', ratio, a, b}\` / \`leaf{id, tabs[], active, collapsed?}\`. 도킹 단위 5종: \`nodeEditor\` \`viewport\` \`inspector\` \`code\` \`assets\` (R5에 따라 problems/diagnostics는 **제외** — B5에서 별도 처리).
- **[R3] 기본 트리 = 현행 앱 첫 화면과 동일해야 한다** (첫 화면 불변):
  \`col 0.717 [ row 0.587 [nodeEditor | **col** 0.556 [viewport | leaf(inspector,assets)]] | leaf(code, collapsed:false) ]\`
  ⚠ **가운데 split은 \`col\`이다 — dc의 \`row\`는 결함이다. 아래 [정본 결함] 절을 반드시 읽어라.**
- **순수 함수 이식**(dc \`_layout\`/\`_getAt\`/\`_setAt\`/\`_removePanel\`/\`_collect\`): divider 두께 D=6. \`_removePanel\`은 탭이 0이 되면 leaf 소멸 → 부모 split이 형제로 대체(트리 축약), active 폴백 = \`tabs[max(0, 지워진 인덱스 - 1)]\`.
- **[R7] leaf 최소 크기 \`240 × 160\`** — divider 드래그가 어느 쪽도 이 픽셀값 아래로 못 가게 클램프한다. dc: 비율 0.15~0.85 클램프 **위에 픽셀 하한을 겹친다**(\`minFrac = MIN_W|MIN_H / span\`).
- **[R4 준비]** leaf에 \`collapsed\` 속성, 스토어 루트에 \`maximized\` — 접기/최대화는 **병존**이 정본이다. \`_layout\`은 접힌 leaf를 split 방향으로 고정 **34px strip**으로 배치하고 그 split의 **divider를 비활성**한다(dc \`aCol/bCol\` 분기 참조).
- **[R9 준비]** 영속화는 B6에서 한다 — 여기선 스토어 형태만 직렬화 가능하게(순수 JSON 트리) 유지하라.
- **단위 테스트 필수**: 이 마일스톤이 커버리지를 버는 지점이다. \`_layout\` 재귀 배치 / 트리 축약 / active 폴백 / divider 픽셀 클램프 / 기본 트리가 현행 레이아웃과 동치인지 — 전부 테스트하라.
${CANON_DEFECT}`,
    checks: [
      "⛔ 기본 트리의 가운데 split이 `dir: 'col'`인지 — `'row'`면 **blocker**다 (앱 첫 화면이 바뀐다 = R3 위반)",
      "기본 트리가 현행 layoutStore 기본값과 수치적으로 동치인지 테스트로 확인되는지 (0.587=1.42/2.42, 0.556=1.25/2.25 높이, 0.717→code 232px)",
      "MIN_W/MIN_H = 240/160 픽셀 클램프가 비율 클램프 위에 겹쳐 적용되는지",
      "접힌 leaf가 34px strip + divider 비활성으로 처리되는지",
      "플로팅(floating/float window) 관련 코드가 **하나도** 들어오지 않았는지 — R1은 '플로팅 없음' 확정이다",
      "트리가 순수 JSON 직렬화 가능한지 (함수/클래스 인스턴스 없음 — R9 대비)",
      "App.tsx가 아직 수정되지 않았는지 (B2 스코프)",
    ],
  },
  {
    id: "B2",
    phase: "B2 Tree Renderer",
    qr: ["R2", "R3"],
    dependsOn: ["B1"],
    parallelUnits: false,
    specPolicy: "forbid",
    design: [
      "design/CHANGELOG.md (§v1.4 — R2 · R3)",
      "design/README.md (§M — 기본 트리)",
      "design/App Shell.dc.html (룩앤필 정본)",
      "design/Docking Prototype.dc.html (renderVals — regions/dividers 배치)",
    ],
    screens: ["design/screens/01-app-shell.png"],
    hints: [
      "src/App.tsx — 현행 하드코딩 레이아웃(shell-left / shell-right / shell-right-top / shell-right-bottom / 하단 code dock). 재귀 트리 렌더러로 교체",
      "src/index.css — .shell-left/.shell-right/.shell-main/.shell-right-top/.shell-right-bottom 클래스",
      "src/state/layoutStore.ts — B1의 트리 모델",
      "tests/e2e/ — 112건 전부가 이 렌더러 위에서 돈다",
    ],
    goal: `\`App.tsx\`의 하드코딩 레이아웃을 **B1 트리 모델 기반 재귀 렌더러**로 교체한다.

**🔒 이 마일스톤의 불변식: 기존 E2E 112건이 스펙 무수정으로 그대로 통과해야 한다.**
기본 트리가 현행 레이아웃을 픽셀 동치로 재현하므로, **E2E가 깨지면 그건 회귀이지 의도된 변경이 아니다.** 이 마일스톤에서는 **E2E 스펙 수정이 금지**된다 — 코드를 고쳐서 통과시켜라.

- 트리를 재귀 배치해 regions/dividers를 계산하고, 각 region에 해당 패널 컴포넌트를 렌더한다.
- **아직 하지 않는 것**: 드래그/드롭(B4) · 탭 1급화와 헤더 개편(B3) · problems/diagnostics 이동(B5) · 영속화/컴팩트(B6).
  → 이 단계에서는 **각 leaf가 탭 1개**인 상태로 현행 UI를 그대로 재현하면 된다. 단 \`inspector\`/\`assets\`가 한 leaf에 탭 2개로 들어가는 것은 기본 트리상 불가피하니, 현행 SidePanel의 탭 UI를 그대로 쓰되 leaf의 active와 동기화되게 하라 (problems/diagnostics 탭은 B5까지 현행 유지).
- divider(6px)는 기존 스플리터와 동일하게 드래그로 비율 조절 — 기존 스플리터 동작/테스트를 보존하라.
- 접기/최대화는 기존 동작을 **그대로 유지**한다 (R4 = 병존). \`m1-dock-header-collapse.spec.ts\`가 반드시 통과해야 한다.
- CSS 클래스 구조가 바뀌면 E2E가 참조하는 셀렉터(\`.shell-left\` 등)가 깨진다 — **셀렉터 계약을 유지**하거나, 유지 불가하면 그 사실을 followups(user)에 기록하고 최소 변경으로 가라.
${CANON_DEFECT}`,
    checks: [
      "🔒 tests/e2e/** 가 **한 줄도 수정되지 않았는지** — 이 마일스톤은 specPolicy:forbid다. 수정됐으면 blocker",
      "m1-dock-header-collapse.spec.ts가 통과하는지 (접기 = 34px strip, 복원 버튼이 strip 안에서 실제 포인터로 클릭 가능)",
      "기본 렌더 결과가 현행 레이아웃과 시각적으로 동일한지 — 스크린샷으로 App Shell과 대조",
      "Inspector/Assets가 Viewport **아래**에 있는지 (오른쪽이면 dir:'row' 버그가 들어온 것 = blocker)",
      "드래그/드롭·탭 개편·영속화가 이 마일스톤에 섞여 들어오지 않았는지 (스코프 유지)",
    ],
  },
  {
    id: "B3",
    phase: "B3 Header·Tabs",
    qr: ["R4", "R6", "R8", "R12"],
    dependsOn: ["B1", "B2"],
    parallelUnits: false,
    design: [
      "design/CHANGELOG.md (§v1.4 — R4 · R6 · R8 · R12)",
      "design/README.md (§M — 접기/최대화 · 탭별 닫기 · 탭 오버플로 · 패널 dot)",
      "design/Docking Prototype.dc.html (헤더 L84~99 · tabStyle · toggleCollapse/toggleMaximize/closeTab/closePanel)",
      "design/Side Panel.dc.html (밑줄형 탭 idiom)",
    ],
    screens: ["design/screens/14-docking-prototype.png", "design/screens/05-side-panel.png"],
    hints: [
      "src/ui/DockPanelHeader.tsx — 현행 헤더(collapsedRail·metaAlign·접기 버튼 ⌄/⌃, aria-label='Collapse panel')",
      "src/ui/Panels/SidePanel.tsx — 현행 내부 탭 UI (밑줄형 패턴 참조)",
      "src/index.css — .dock-header-meta / .panel-tab / .panel-tab--active",
      "tests/e2e/m1-dock-header-collapse.spec.ts — 접기 회귀 가드 (반드시 보존)",
    ],
    goal: `도킹 헤더를 v1.4 정본으로 개편한다. 탭이 **1급 도킹 단위**가 된다.

- **[R4] 접기/최대화 = 병존.** 기존 기능을 leaf 단위 속성으로 유지한다. 접힌 leaf = split 방향 고정 **34px strip**(divider 비활성). 최대화 = 해당 leaf를 도크 body 전체로 **오버레이**(⤢↔⤡ 토글).
  ⚠ \`m1-dock-header-collapse.spec.ts\`는 *"복원 버튼이 34px strip 밖으로 밀려 overflow:hidden에 잘려 실제 포인터로 영원히 클릭 불가 → 패널이 접힌 채 영구히 갇히던"* **실제 회귀의 재발 가드**다. 반드시 통과시켜라 — 접힌 strip 안에 복원 컨트롤이 실제 화면 좌표로 도달 가능해야 한다.
- **[R6] 헤더 \`✕\` = 패널 전체 닫기 · 탭마다 작은 \`✕\` = 그 탭만 닫기**(hover 시 강조, 비활성 탭도 활성화 없이 닫힘). 기존 dc의 "헤더 ✕가 active 탭만 닫음"(3번 클릭 문제)은 **정정됐다** — VSCode idiom.
  탭 ✕는 \`onPointerDown\`에서 \`stopPropagation\`해야 드래그와 충돌하지 않는다(dc의 \`t.xDown\` 참조).
- **[R8] 탭 오버플로 = 가로 스크롤.** 스크롤바 숨김(\`::-webkit-scrollbar{height:0}\` + \`scrollbar-width:none\`) + **우측 페이드 마스크**(\`mask-image\`). 탭 4개↑에서 마스크 노출. **34px 헤더 높이 불변**. 임계 폭/생략 로직 없이 최소 코드(번들 예산).
- **[R12] 패널 dot** 5색은 **장식적 식별자** — 노드 카테고리/포트 타입 의미축과 무관. 신규 토큰 없이 기존 값 재사용하고 "의미 아님"을 주석으로 남겨라.
- 크롬 정본: 헤더 높이 34 · ⣿ = \`text.disabled\`(#454c55)·13px · 메타 배지 박스형(surface.card + border.default) · 탭은 Side Panel **밑줄형**(active \`border-bottom 2px accent\`). 메타 배지는 **active 탭 것**을 표시.
- 접근성: 기존 \`aria-label\`/\`aria-expanded\` 수준을 유지하거나 개선하라. 접기/최대화/닫기 버튼은 **키보드 도달 가능해야 한다**(R10에서 드래그만 포인터 전용으로 확정됨).`,
    checks: [
      "m1-dock-header-collapse.spec.ts가 통과하는지 — 접힌 34px strip 안에서 복원 버튼이 elementFromPoint로 실제 도달 가능한지",
      "헤더 ✕가 패널 전체를 닫고, 탭별 ✕가 그 탭만 닫는지 (R6 — active 탭만 닫히면 오답)",
      "탭 ✕의 pointerdown이 stopPropagation하는지 (드래그와 충돌 방지)",
      "탭바가 34px 헤더 높이를 유지한 채 가로 스크롤 + 페이드 마스크로 처리되는지 (헤더가 높아지면 오답)",
      "접기/최대화가 제거되지 않고 leaf 속성으로 병존하는지 (R4)",
      "raw hex 없이 tokens.* / var(--*)만 쓰는지, theme.ts에 신규 토큰이 없는지",
    ],
  },
  {
    id: "B4",
    phase: "B4 Drag·Drop",
    qr: ["R1", "R10", "R11"],
    dependsOn: ["B1", "B2", "B3"],
    parallelUnits: false,
    design: [
      "design/CHANGELOG.md (§v1.4 — R1 · R10 · R11)",
      "design/README.md (§M — 드래그 · 드롭 규칙 · 플로팅 없음)",
      "design/Docking Prototype.dc.html (startTabDrag/onMove/onUp/computeDrop/dockLeaf/_fallbackTarget · DROP PREVIEW)",
    ],
    screens: ["design/screens/14-docking-prototype.png"],
    hints: [
      "src/App.tsx — B2의 재귀 렌더러 (드롭 존 판정이 여기 붙는다)",
      "src/ui/DockPanelHeader.tsx — B3의 헤더 (⣿ grab + 탭 drag 시작점)",
      "src/state/layoutStore.ts — B1의 dockLeaf/computeDrop 순수 함수",
    ],
    goal: `드래그/드롭을 구현한다. **플로팅 창은 없다**(R1).

- **[R10] \`pointer*\` 이벤트**(pointerdown/move/up) — 마우스 + **터치/펜 무상 지원**. \`mouse*\`를 쓰지 마라.
  **키보드 DnD는 도입하지 않는다** — R10에서 "도킹 재배치는 포인터 전용"으로 확정됐다(번들 예산). 대신 ＋Panel/접기/닫기 버튼은 키보드 도달 가능해야 한다(B3/B6).
- **드래그 시작**: ⣿(헤더) → 패널 전체(모든 탭) · 개별 탭 → 그 탭만 분리. 임계 **4px**(\`Math.hypot < 4\`) 넘어야 드래그 시작.
- **[R1] 고스트**: 드래그 중에만 커서를 따라다니는 **트랜지언트 프리뷰 1개**. \`onUp\`은 **드롭 타깃이 없어도 \`_fallbackTarget()\`(첫 region의 center)으로 강제 도킹**한다. **떠 있는 채로 남는 상태는 존재하지 않는다.** 리사이즈 핸들·다중 플로팅·탭 in 플로팅 같은 걸 만들지 마라.
- **드롭 판정 순서 (이 순서가 중요하다)**:
  1. **탭바 존 최우선** — 커서가 region 상단 **34px** 안 → center(탭 병합), 라벨 "Add to tab bar". *바깥 밴드보다 먼저 본다* — 그래야 가장자리 패널의 헤더에도 탭을 붙일 수 있다.
  2. **셸 바깥 가장자리 밴드 42px** → 전체 레이아웃 가장자리 도킹. 프리뷰 32%, 라벨 "Dock left|right|top|bottom". 새 split ratio = 좌/상 **0.28**, 우/하 **0.72**.
  3. **region 안 가장자리 22%**(\`E=0.22\`, 4변 중 최소 거리) → 스플릿. 프리뷰 = region 절반, 라벨 "Split <zone>". 새 split ratio = 좌/상 **0.4**, 우/하 **0.6**.
  4. 그 외(중앙) → 탭 병합, 라벨 "Add as tab".
  5. region 밖 + 밴드 밖 → null (드롭 시 \`_fallbackTarget()\`).
- **드롭 프리뷰**: \`rgba(accent,0.14)\` 배경 + 2px accent 보더 + 라벨 배지. \`pointer-events:none\`. **raw hex 금지 — 토큰 + withAlpha로.**
- **[R11] 반응형**: 비율(0.22/0.28/0.72/0.4/0.6)은 그대로 이식하되 **픽셀(42/34/6)은 규칙으로 받는다**(Q6 정신). dc 캔버스는 1440×826 고정이고 앱은 반응형이다 — 42px 밴드는 1440에서 2.9%지만 990px에서 4.2%다. 컴팩트 폴백 자체는 B6에서 하지만, **여기서 픽셀 상수를 하드코딩하지 말고 상수로 뽑아 두라.**
- 드래그 중 \`user-select:none\`.
${CANON_DEFECT}`,
    checks: [
      "pointer* 이벤트만 쓰는지 (mousedown/mousemove/mouseup이 남아 있으면 R10 위반)",
      "플로팅 상주 상태가 없는지 — onUp이 타깃 없이도 _fallbackTarget으로 강제 도킹하는지. 리사이즈 핸들/다중 플로팅이 있으면 blocker(R1)",
      "드롭 판정에서 **탭바 34px 존이 바깥 밴드 42px보다 먼저** 평가되는지 (순서가 뒤집히면 가장자리 패널 헤더에 탭을 못 붙인다)",
      "split ratio가 outer 0.28/0.72, region 0.4/0.6으로 맞는지",
      "드롭 프리뷰가 raw hex가 아니라 토큰 + withAlpha인지",
      "드래그 임계 4px가 적용돼 클릭과 드래그가 구분되는지 (탭 클릭으로 active 전환이 계속 되는지)",
    ],
  },
  {
    id: "B5",
    phase: "B5 Diagnostics Move",
    qr: ["R5", "R13"],
    dependsOn: ["B1", "B2", "B3"],
    parallelUnits: false,
    design: [
      "design/CHANGELOG.md (§v1.4 — R5)",
      "design/README.md (§M — problems/diagnostics · §E Diagnostics)",
      "design/Docking Prototype.dc.html (하단 오버레이 L210 부근 height:172px · 상태바 L237~241 ◨ Diagnostics / ⚠ N problems)",
      "design/Side Panel.dc.html (Diagnostics 패널 내용 정본)",
    ],
    screens: ["design/screens/14-docking-prototype.png", "design/screens/05-side-panel.png"],
    hints: [
      "src/ui/Panels/SidePanel.tsx — 현행 탭 4종(inspector/assets/problems/diagnostics). L19~24 주석: 'Diagnostics 표시 여부의 단일 출처는 debugUiStore.open'",
      "src/state/debugUiStore.ts — open/levelFilter/categoryFilter",
      "src/ui/Panels/StatusBar.tsx — 상태바 (Diagnostics 토글 + problems 카운트가 갈 곳)",
      "src/ui/Panels/DiagnosticsPanel.tsx · ProblemsPanel.tsx",
      "⚠ tests/e2e 7개 스펙이 SidePanel 탭을 참조한다: phase-16-diagnostics · phase-12-resilience · phase-9-editor-ux · phase-3-4-editor-uniform · phase-7-8-assets-serialization · phase-21-hint-editor · phase-23-multi-select",
    ],
    goal: `**[R5] problems / diagnostics를 도킹 탭에서 빼낸다.** 도킹 5종은 \`nodeEditor\` \`viewport\` \`inspector\` \`code\` \`assets\`뿐이다.

- **\`diagnostics\`**: \`debugUiStore.open\`이 **단일 출처인 현행 배선을 그대로 유지**한다(R5가 명시적으로 이 배선을 보존하기로 결정했다 — 탭으로 승격하면 깨진다). 상태바 \`◨ Diagnostics\` 토글로 **하단 트랜지언트 오버레이(172px)**로 열린다. **탭이 아니다** — 도킹 트리에 넣지 마라.
- **\`problems\`**: 상태바 카운트(\`⚠ N problems\`)로 이동.
- **SidePanel**: 이제 \`inspector\` / \`assets\`만 남고, 이 둘은 B1~B3의 **도킹 leaf 탭**이 된다. SidePanel의 내부 탭 UI는 도킹 헤더 탭으로 흡수된다.
- **[R13]** Diagnostics 레벨 필터 라벨은 \`Info+/Warn+/Error+/Debug+\`(A1에서 처리했으면 확인만). **필터 로직(누적 의미)은 불변.**
- ⚠ **E2E 7건이 깨진다** — \`tab-problems\`/\`tab-diagnostics\` testid를 참조한다. 이건 **R5가 의도한 UI 구조 변경**이므로 정당한 specChange다. 단 **강화 방향으로만** 갱신하라: 새 경로(상태바 토글 → 오버레이 / 상태바 카운트)를 단언하도록 바꾸는 것만 허용되고, expect 삭제·skip은 금지. 적용한 건은 전부 followups(user)에 기록하라.
- 카테고리 필터(gl/shader/mem)는 **기존 기능이라 유지**한다(Q9에서 확정).`,
    checks: [
      "diagnostics가 도킹 트리의 탭으로 들어가지 않았는지 — debugUiStore.open 단일 출처가 유지되는지 (R5의 핵심)",
      "상태바에 Diagnostics 토글 + problems 카운트가 있는지",
      "하단 오버레이가 172px 트랜지언트인지 (도킹 leaf가 아닌지)",
      "도킹 가능한 탭이 정확히 5종(nodeEditor/viewport/inspector/code/assets)인지",
      "E2E 스펙 변경이 **강화 방향**인지 — expect 삭제·test.skip이 있으면 blocker. 변경 건이 followups(user)에 기록됐는지",
      "카테고리 필터(gl/shader/mem)가 제거되지 않았는지",
      "Diagnostics 필터 로직(누적 의미)이 그대로인지",
    ],
  },
  {
    id: "B6",
    phase: "B6 Persist·Compact",
    qr: ["R9", "R11", "R1"],
    dependsOn: ["B1", "B2", "B3", "B4"],
    parallelUnits: false,
    design: [
      "design/CHANGELOG.md (§v1.4 — R9 · R11)",
      "design/README.md (§M — 영속화 · 반응형 · ＋Panel/Reset · Empty state)",
      "design/Docking Prototype.dc.html (＋ Panel 메뉴 L44~60 · resetLayout · closedList · layoutEmpty · 상태바 dockedCount)",
    ],
    screens: ["design/screens/14-docking-prototype.png"],
    hints: [
      "src/state/autoSave.ts — localStorage 저장 패턴 (layout 키 신설 지점)",
      "src/state/serialization.ts — **건드리지 마라** (R9: 프로젝트 .json에 레이아웃 미포함)",
      "src/state/projectSanitize.ts — 마찬가지로 스코프 밖 (R9가 마이그레이션을 회피하기로 결정)",
      "src/ui/Viewport/paneLayout.ts + C-6 컴팩트 임계값 990px",
      "src/ui/AppToolbar.tsx — ＋Panel / Reset layout 버튼이 갈 곳",
    ],
    goal: `영속화 · 패널 재도킹 · 컴팩트 폴백을 구현해 도킹을 완성한다.

- **[R9] 레이아웃 영속화 = localStorage.** 레이아웃은 **사용자 작업 환경**이지 프로젝트 데이터가 아니다.
  ⛔ **\`serialization.ts\` / \`projectSanitize.ts\`를 건드리지 마라** — R9는 프로젝트 \`.json\`에 레이아웃을 **넣지 않기로** 결정했고, 그 이유가 마이그레이션 회피다. \`autoSave.ts\`에 layout 키를 신설하는 방향으로 가라.
  ⚠ localStorage에서 읽은 트리는 **신뢰할 수 없는 입력**이다(손상/구버전/수동 편집). 파싱 실패·구조 불일치·알 수 없는 탭 id·중복 탭이면 **조용히 기본 트리로 폴백**하라 — 앱이 죽으면 안 된다. 이 방어 로직에 단위 테스트를 붙여라.
- **\`＋ Panel\`**: 닫힌 패널을 재도킹. dc의 \`floatPanel(id)\`은 **이름과 달리 도킹한다** — 첫 region에 탭으로 붙인다(R1: no floating). 메뉴에 닫힌 패널 목록, 전부 열려 있으면 "All panels are open".
- **\`↺ Reset layout\`**: 기본 트리로 복귀.
- **Empty state**: 전부 닫으면 트리가 null이 된다. 카피 정본 = **"No panels docked — add one with ＋ Panel"** (v1.3의 "drop a floating panel here"는 R1에서 **폐기**됐다 — 그 문구를 쓰지 마라).
- 상태바 \`N panels docked\`.
- **[R11] 컴팩트(<990px) 도킹 비활성 → 고정 스택 폴백.** C-6에서 확정된 임계값 990px을 재사용한다(신규 상수 만들지 마라). 좁은 화면에서 실수 도킹을 막는 게 목적이다. 폴백 상태에서 드래그 핸들/드롭 존이 노출되면 안 된다.
  ⚠ 컴팩트 → 넓어짐으로 돌아올 때 **사용자 레이아웃이 보존**돼야 한다 (폴백이 트리를 파괴하면 안 된다).`,
    checks: [
      "serialization.ts / projectSanitize.ts가 수정되지 않았는지 — 수정됐으면 blocker (R9 위반)",
      "localStorage 트리가 손상/구버전/알 수 없는 탭 id일 때 기본 트리로 안전 폴백하는지 + 그 테스트가 있는지",
      "＋Panel이 플로팅이 아니라 **도킹**하는지 (R1)",
      "Empty state 카피가 'No panels docked — add one with ＋ Panel'인지 (플로팅 언급이 있으면 오답)",
      "컴팩트 임계값이 C-6의 990px을 재사용하는지 (새 상수를 만들었으면 오답)",
      "컴팩트 폴백에서 넓은 화면으로 복귀 시 레이아웃이 보존되는지",
      "＋Panel/Reset 버튼이 키보드 도달 가능한지 (R10: 드래그만 포인터 전용)",
    ],
  },
  {
    id: "B7",
    phase: "B7 E2E Specs",
    qr: ["R1", "R4", "R5", "R6", "R7", "R8", "R9", "R11"],
    dependsOn: ["B1", "B2", "B3", "B4", "B5", "B6"],
    parallelUnits: false,
    design: [
      "design/CHANGELOG.md (§v1.4 전체)",
      "design/README.md (§M — v1.4 정본 전체)",
      "SPEC.md — Phase별 기능 명세 (E2E 시나리오의 근거)",
    ],
    screens: ["design/screens/14-docking-prototype.png"],
    hints: [
      "tests/e2e/m1-dock-header-collapse.spec.ts — 기존 도킹 가드 (패턴 참조: elementFromPoint 실좌표 히트테스트)",
      "tests/e2e/helpers/fixtures.ts — bootApp 헬퍼",
      "playwright.config.ts — SwiftShader, fullyParallel:false, workers:1",
    ],
    goal: `도킹 동작의 **회귀 가드 E2E 스펙**을 신설한다. 기존 112건은 계속 통과해야 한다.

커버할 시나리오(각각 실제 포인터 좌표로 구동 — \`page.mouse\` / \`dispatchEvent('pointerdown')\`):
- **탭 드래그 → 다른 leaf 헤더에 병합** (탭바 34px 존이 바깥 밴드보다 우선한다는 규칙 검증 — **가장자리 패널의 헤더**에 붙여봐야 의미가 있다)
- **⣿ 드래그 → region 가장자리 22% → 스플릿** (프리뷰 라벨 "Split <zone>" 확인)
- **셸 바깥 42px 밴드 → 전체 가장자리 도킹**
- **드롭 타깃 없는 곳에서 release → 강제 도킹**(R1: 떠 있는 채로 남지 않는다) ← 플로팅 회귀를 잡는 핵심 가드
- **탭별 ✕ = 그 탭만 / 헤더 ✕ = 패널 전체**(R6)
- **접기 → 34px strip → 복원 버튼이 실제 포인터로 도달 가능**(R4 — m1 스펙과 같은 함정을 트리 모델에서 재검증)
- **divider 드래그가 240×160 아래로 안 내려감**(R7)
- **탭 4개↑ 오버플로 시 헤더가 34px를 유지**(R8)
- **＋Panel 재도킹 / Reset layout / Empty state 카피**(R9/R1)
- **localStorage 왕복**: 레이아웃 변경 → reload → 유지됨. 손상된 값 주입 → 기본 트리 폴백(R9)
- **컴팩트(<990px)에서 도킹 비활성**, 넓어지면 레이아웃 보존(R11)

⚠ 스펙을 **약화**시키지 마라. test.skip/fixme 금지. 새 스펙은 SPEC.md의 시나리오에 근거해야 한다.
⚠ playwright는 workers:1 직렬이다 — 스펙이 너무 무거우면 전체 러닝타임이 늘어난다. 시나리오당 최소 구동으로 작성하라.`,
    checks: [
      "기존 112건이 여전히 통과하는지",
      "신규 스펙이 실제 포인터 좌표(page.mouse / pointer 이벤트)로 구동되는지 — .click() 강제/force로 우회하면 실제 도달성을 검증하지 못한다",
      "'드롭 타깃 없이 release → 강제 도킹' 가드가 있는지 (R1 플로팅 회귀 방지의 핵심)",
      "test.skip / test.fixme / expect 삭제가 없는지",
      "접힌 strip의 복원 버튼 도달성을 elementFromPoint로 히트테스트하는지 (m1 스펙과 같은 함정)",
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 스키마
// ─────────────────────────────────────────────────────────────────────────────
const FOLLOWUP_ITEMS = {
  type: "array",
  description:
    "사용자 판단 또는 디자인 문서 갱신이 필요한 항목. 작업을 멈추지 말고 잠정 결정으로 진행한 뒤 여기에 기록하라. 없으면 빈 배열.",
  items: {
    type: "object",
    required: ["audience", "title", "context", "interimDecision"],
    properties: {
      audience: {
        type: "string",
        enum: ["user", "designer"],
        description: "user=스코프/정책/게이트 판단, designer=시안·토큰 등 디자인 결정",
      },
      title: { type: "string", description: "한 줄 요약" },
      context: { type: "string", description: "무엇이 왜 결정되지 않았는지 + 검토한 선택지" },
      interimDecision: {
        type: "string",
        description: "지금 코드에 적용한 잠정 처리 + 정식 결정이 나오면 어디를 바꾸면 되는지",
      },
      files: { type: "array", items: { type: "string" } },
    },
  },
}

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
          instructions: {
            type: "string",
            description: "구현 지시 — 파일별 변경 내용, 참조할 디자인 값 위치, 주의점",
          },
          files: { type: "array", items: { type: "string" } },
          tests: { type: "string", description: "추가/갱신할 단위 테스트" },
          acceptance: { type: "array", items: { type: "string" } },
        },
      },
    },
    notes: { type: "string", description: "아키텍처 결정 사항 기록" },
    followups: FOLLOWUP_ITEMS,
  },
}

const IMPL_SCHEMA = {
  type: "object",
  required: ["status", "summary"],
  properties: {
    status: {
      type: "string",
      enum: ["done", "blocked"],
      description: "blocked = 상위 모델(fable)에게 에스컬레이션. 사용자에게 묻는 게 아니다.",
    },
    summary: {
      type: "string",
      description: "변경 요약 + 주요 결정. blocked면 지금까지의 부분 진행 상태",
    },
    filesTouched: { type: "array", items: { type: "string" } },
    questions: {
      type: "array",
      description: "fable 아키텍트에게 물을 질문 (사용자용 아님)",
      items: {
        type: "object",
        required: ["question", "context"],
        properties: {
          question: { type: "string" },
          context: { type: "string", description: "시도한 조사 + 검토한 선택지" },
        },
      },
    },
    followups: FOLLOWUP_ITEMS,
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
        properties: {
          question: { type: "string" },
          answer: {
            type: "string",
            description:
              "실행 가능한 단정적 결정. '사용자에게 물어보라'는 답은 금지 — 잠정 결정이라도 반드시 내려라.",
          },
        },
      },
    },
    guidance: { type: "string", description: "추가 지침" },
    followups: FOLLOWUP_ITEMS,
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
    followups: FOLLOWUP_ITEMS,
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
          gate: {
            type: "string",
            enum: ["typecheck", "lint", "deadcode", "circular", "unit", "e2e"],
          },
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
          instruction: {
            type: "string",
            description: "근본 원인 + 구체적 수정 지시",
          },
          files: { type: "array", items: { type: "string" } },
        },
      },
    },
    specChanges: {
      type: "array",
      description: "의도된 디자인 변경이라 E2E 스펙 갱신이 필요한 항목 (약화 아님)",
      items: {
        type: "object",
        required: ["spec", "reason", "proposedChange"],
        properties: {
          spec: { type: "string", description: "스펙 파일 + 테스트명" },
          reason: { type: "string", description: "왜 회귀가 아니라 의도된 변경인지 (v1.3/v1.4의 어느 결정인지)" },
          proposedChange: { type: "string" },
        },
      },
    },
    followups: FOLLOWUP_ITEMS,
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

const QUARANTINE_SCHEMA = {
  type: "object",
  required: ["clean", "note"],
  properties: {
    clean: { type: "boolean", description: "격리 후 작업 트리가 마지막 커밋 상태로 깨끗해졌는지" },
    stashRef: { type: "string", description: "보존된 stash 이름" },
    note: { type: "string" },
  },
}

const DOC_SCHEMA = {
  type: "object",
  required: ["written", "itemCount"],
  properties: {
    written: { type: "boolean" },
    itemCount: { type: "number" },
    note: { type: "string" },
  },
}

const COVERAGE_SCHEMA = {
  type: "object",
  required: ["items", "residualHexCount", "residualHexSummary"],
  properties: {
    items: {
      type: "array",
      description: "v1.3 Q1~Q11 + v1.4 R1~R15 전 항목의 처리 상태",
      items: {
        type: "object",
        required: ["id", "status", "note"],
        properties: {
          id: { type: "string", description: "예: Q1, Q1-b, R5, R13" },
          status: {
            type: "string",
            enum: ["done", "verified-no-change", "deferred", "not-covered"],
          },
          note: { type: "string", description: "근거 (커밋/파일, 또는 왜 미처리인지)" },
        },
      },
    },
    residualHexCount: { type: "number" },
    residualHexSummary: { type: "string" },
    bundleKiB: { type: "number", description: "참고용 번들 사이즈 (게이트 아님). 실패 시 -1" },
    bundleOverLimit: { type: "boolean", description: "385 KiB 한도 초과 여부" },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 프롬프트 빌더
// ─────────────────────────────────────────────────────────────────────────────
function refBlock(m) {
  return `[디자인 레퍼런스 — 반드시 직접 읽을 것]
- ${m.design.join("\n- ")}
- src/theme.ts — 런타임 토큰 단일 출처 (**상위집합** — 덮어쓰지 마라)
- temp/design-request-v1.3.md — v1.3 요청서 원문 (Q1~Q11의 배경/선택지)
- temp/design-request-v1.4.md — v1.4 요청서 원문 (R1~R15의 배경/선택지)
- temp/design-v1.3-kickoff.md — 착수 문서 (갭 분석 · 정본 결함 · 단계 계획)
${m.screens.length ? `- 스크린샷: ${m.screens.join(", ")}` : ""}
.dc.html은 사내 디자인 툴 포맷이다. 프레임워크는 무시하고 인라인 스타일의 정확한 hex·px·폰트·radius 값과 \`<script type="text/x-dc">\`의 로직만 읽어라 (그 hex를 코드에 직접 쓰지 말고 대응하는 tokens.* 를 참조).

[이 마일스톤이 반영하는 요청 항목] ${m.qr.join(" · ")}
design/CHANGELOG.md의 §v1.3 / §v1.4가 각 결정의 "왜"를 담고 있다 — **결정의 정본은 CHANGELOG다.**
dc와 코드가 어긋나 보이면 CHANGELOG를 먼저 읽어라. 이미 결론이 난 항목일 수 있다.
⚠ **v1.3·v1.4 모두 "신규 토큰 0 · breaking 코드 0"이 명시돼 있다.** 토큰을 추가해야 할 것 같으면 십중팔구 당신이 정본을 잘못 읽은 것이다.`
}

function depsBlock(m, quarantined) {
  const broken = (m.dependsOn || []).filter((d) => quarantined.includes(d))
  if (broken.length === 0) return ""
  return `

[⚠ 선행 마일스톤 실패] ${broken.join(", ")} 가 게이트를 통과하지 못해 **격리(stash)되어 브랜치에서 빠졌다**. 그 결과물(예: B1의 트리 모델, B2의 재귀 렌더러)은 현재 코드에 **없다**.
- 그 선행 결과에 의존하는 유닛은 **계획에서 제외**하고, 의존하지 않는 나머지만 진행하라 (워크플로우를 멈추지 말 것).
- Phase B는 밀결합 체인이다 — B1/B2가 빠졌다면 이 마일스톤은 사실상 진행 불가일 수 있다. 그렇다면 유닛을 빈 배열 대신 "확인만" 수준으로 축소하고 followups(audience:'user')에 "${broken.join(",")} 복구 후 재실행 필요"를 기록하라.`
}

function parallelBlock(m) {
  return m.parallelUnits
    ? `

[⚠ 이 마일스톤의 유닛은 **병렬 실행**된다]
유닛들이 동시에 같은 작업 트리에서 돈다. 따라서:
- **유닛 간 파일이 절대 겹치면 안 된다** — 겹치면 서로의 편집을 덮어쓴다.
- **유닛 간 결과 의존이 없어야 한다** — 앞 유닛의 산출물을 뒤 유닛이 전제하면 안 된다.
- 겹치거나 의존하는 작업은 **하나의 유닛으로 합쳐라** (유닛 수를 줄이는 게 안전하다).`
    : ""
}

function specPolicyBlock(m) {
  return m.specPolicy === "forbid"
    ? `

[🔒 이 마일스톤은 E2E 스펙 수정 금지]
기본 트리가 현행 레이아웃을 동치로 재현하므로 **기존 E2E 112건은 무수정으로 통과해야 한다**. E2E가 깨지면 그건 **회귀**이지 의도된 변경이 아니다 — tests/e2e/**를 고치지 말고 **코드를 고쳐서** 통과시켜라. 도저히 불가하면 followups(audience:'user')에 기록하라.`
    : ""
}

function plannerPrompt(m, quarantined) {
  return `당신은 ShaderPlayground 디자인 핸드오프 v1.3+v1.4 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[배경] design/ 핸드오프는 v1(PR #68) → v1.1(PR #69) → v1.2(PR #70)까지 main에 머지됐다. 이후 **v1.3 번들(\`b6ef934\`)이 Q1~Q11에, v1.4 번들(\`3a1981d\`)이 R1~R15에 답했다**. 두 번들 모두 **모든 항목 ID를 인용해 답했고(무응답 0), 신규 토큰 0 · breaking 0**이다. 이제 그 정본을 코드에 반영한다.
v1.4의 핵심은 \`Docking Prototype\`을 \`[Unreleased]\`에서 **정본으로 승격**한 것 — 현행 고정 4패널 레이아웃을 **트리 기반 도크 모델로 교체**한다.

[마일스톤 ${m.id}] ${m.goal}

${refBlock(m)}${depsBlock(m, quarantined)}${parallelBlock(m)}${specPolicyBlock(m)}

[현재 코드 진입점 힌트]
- ${m.hints.join("\n- ")}
- Architecture.md — 모듈 경계 / SPEC.md — 기능 명세 / CLAUDE.md — 품질 게이트 규약

[할 일]
디자인 레퍼런스와 현재 코드를 직접 읽고, 이 마일스톤을 2~6개의 작업 유닛으로 분해하라. 각 유닛은:
- 하위 모델(sonnet)이 이 지시만 보고 구현할 수 있을 만큼 구체적으로: 어떤 파일을 어떻게 바꾸는지, 어떤 디자인 값(.dc.html 어느 부분)을 참조하는지, 기존 코드의 어떤 패턴을 따르는지.
- ${m.parallelUnits ? "**서로 파일이 겹치지 않게** 분해 (병렬 실행됨)" : "유닛 간 의존 순서대로 정렬 (앞 유닛의 결과 위에 뒤 유닛이 얹힘)"}.
- knip 제약: 새 export는 같은 유닛에서 호출자 연결. 새 공통 컴포넌트는 첫 사용처와 같은 유닛에.
- tests: 커버리지 임계 유지를 위해 추가할 단위 테스트를 명시.
- acceptance: 검증자가 확인할 구체 기준.
기존 기능(상태 로직, 상호작용, 단축키)은 보존이 원칙이다. 파괴적 재작성이 필요하면 notes에 사유를 기록하라.
"확인만" 성격의 항목(코드 변경이 불필요할 수 있는 것)도 유닛으로 넣되, 변경이 없으면 그 사실을 근거와 함께 보고하게 하라 — **억지로 코드를 바꾸지 마라.**
디자인이 확정하지 않은 지점이 보이면 **계획 단계에서 잠정 결정을 내려 유닛에 박아 넣고** followups에 기록하라. 계획을 미루지 마라.
${CONSTRAINTS}`
}

function implPrompt(m, unit, answersBlock, priorSummary) {
  const prior = priorSummary
    ? `\n[이전 시도의 부분 진행 상태 — 작업 트리에 이미 반영됨]\n${priorSummary}\n이어서 진행하라 (처음부터 다시 하지 말 것).`
    : ""
  const ans = answersBlock ? `\n[아키텍트(상위 모델)의 답변 — 이 결정을 따르라]\n${answersBlock}` : ""
  return `당신은 ShaderPlayground 디자인 핸드오프 v1.3+v1.4 반영 작업의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[마일스톤 ${m.id} — 작업 유닛 ${unit.id}: ${unit.title}]
${unit.instructions}

[대상 파일] ${unit.files.join(", ")}
[테스트] ${unit.tests}
[수용 기준]
- ${unit.acceptance.join("\n- ")}

${refBlock(m)}${parallelBlock(m)}${specPolicyBlock(m)}
${prior}${ans}

[진행 규칙]
- 확신 없는 설계 결정(토큰 의미 해석, 트리/스토어 경계, 드롭 판정 순서, 기존 동작 변경 여부)은 추측하지 말고 status:'blocked' + questions로 반환하라 → **fable 아키텍트가 답을 준다** (사용자를 기다리는 게 아니다).
- 사소한 구현 디테일은 스스로 결정하라. blocked는 정말 갈림길일 때만.
- 디자인/사용자 결정이 없어 확정할 수 없는 값은 **잠정 결정으로 진행하고 followups에 기록**하라 (멈추지 마라).
- 완료 시 status:'done', summary에 변경 요약과 주요 결정을 기록하라. 코드 변경이 불필요했다면 그 근거를 summary에 남겨라.
${CONSTRAINTS}`
}

function oraclePrompt(m, unit, questions, priorSummary) {
  const qs = questions.map((q, i) => `${i + 1}. ${q.question}\n   (context: ${q.context})`).join("\n")
  return `당신은 ShaderPlayground 디자인 핸드오프 v1.3+v1.4 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
하위 구현 에이전트가 [마일스톤 ${m.id} / 유닛 ${unit.id}: ${unit.title}] 작업 중 다음 질문에 막혔다. **당신이 최종 결정권자다** — 사용자에게 넘길 수 없다.

[유닛 지시]
${unit.instructions}

[구현 에이전트의 진행 상태]
${priorSummary || "(없음)"}

[질문]
${qs}

${refBlock(m)}

저장소 코드와 디자인 문서(design/CHANGELOG.md §v1.3·§v1.4, design/README.md, 해당 .dc.html, temp/design-request-v1.3.md, temp/design-request-v1.4.md, temp/design-v1.3-kickoff.md, Architecture.md)를 직접 확인하고, 각 질문에 **단정적으로** 답하라 — 구체적 파일/값/패턴을 지정하고 선택지 중 하나를 결정해줄 것.

[결정 원칙]
- "사용자에게 물어보라" / "디자이너 확인 필요" 같은 답은 **금지**다. 반드시 지금 실행 가능한 결정을 내려라.
- **v1.3/v1.4는 이례적으로 완결된 번들이다** — Q1~Q11, R1~R15가 전부 답변됐다. 답이 없어 보이면 CHANGELOG를 다시 읽어라. 십중팔구 이미 결론이 있다.
- 그래도 정본에 없는 값이면: (1) 의미가 가장 가까운 기존 토큰/패턴으로 근사 → (2) 현행 유지 + 사유 주석 → (3) 가장 되돌리기 쉬운 최소 변경. **theme.ts에 값을 지어내 넣지 마라.**
- 그렇게 잠정 결정한 항목은 followups에 기록하라 (audience: designer=시안/토큰, user=스코프/정책).
${AUTONOMY}`
}

function verifierPrompt(m, plan, round) {
  const acceptance = plan.units.map((u) => `- [${u.id}] ${u.acceptance.join(" / ")}`).join("\n")
  return `당신은 ShaderPlayground 디자인 핸드오프 v1.3+v1.4 반영 작업의 검증자다. 저장소: ${ROOT} (브랜치 ${BRANCH}). 검증 라운드 ${round}.

[마일스톤 ${m.id}] ${m.goal}

[검증 대상] 아직 커밋되지 않은 작업 트리 변경. git status 와 git diff 로 이번 마일스톤의 변경을 파악하라.

${refBlock(m)}

[수용 기준 (플래너가 정의)]
${acceptance}

[마일스톤 특화 체크]
- ${m.checks.join("\n- ")}

[공통 체크]
- 새/수정 파일에 raw hex 직접 사용이 없는지 (tokens.* / var(--*) 참조만). grep -rn 으로 확인. 예외: src/theme.ts, ErrorBoundary 크래시 폴백, src/export/standalonePlayer.js(Q11에서 현행 유지 확정).
- **src/theme.ts에 새 토큰이 추가되지 않았는지** — v1.3/v1.4 모두 "신규 토큰 0"이다. 추가됐으면 blocker.
- **src/theme.ts의 기존 구현 파생 export가 소실되지 않았는지** (nodeCardSolid·emptyStateIcon·cardLg·modal·thumbnailInset·onCanvasText·overlayBar·withAlpha·cssVars) — v1.1에 덮어쓰기 사고가 실제로 있었다.
- 기존 기능(상태 로직·상호작용·단축키)이 깨지지 않았는지.
- 게이트 설정 파일이 무단으로 약화되지 않았는지. scripts/check-bundle-size.mjs가 수정되지 않았는지 (한도 상향은 사용자 승인 사항).
- tests/e2e/** 변경이 있다면 ${m.specPolicy === "forbid" ? "**이 마일스톤은 스펙 수정 금지다 — 변경이 있으면 blocker**" : "**강화 방향인지**(expect 삭제·skip이 아닌지) git diff로 확인 — 약화면 blocker"}.

[시각 대조 — 가능하면 수행]
- npm run dev 를 백그라운드로 띄우고(이미 떠 있으면 재사용), 스크래치 디렉터리에 일회용 Playwright 스크립트를 작성해 해당 화면의 스크린샷을 찍어라. WebGL 렌더는 playwright.config.ts의 SwiftShader 플래그를 참고.
- 찍은 스크린샷과 ${m.screens.length ? m.screens.join(", ") : "(해당 없음)"} 를 Read로 열어 비교하라. 픽셀 diff가 아니라 구조·색·타이포·간격·상태 표현의 일치를 본다.
- **도킹 마일스톤(B*)은 실제 상호작용을 구동해 보라** — 정적 스크린샷만으로는 드래그/드롭/접기를 검증할 수 없다. pointer 이벤트를 디스패치해 결과 레이아웃을 확인하라.
- 브라우저 실행이 불가하면 visualNotes에 그 사실을 남기고 코드 대조만으로 판단하라.

[판정]
- .dc.html 인라인 값/로직과의 불일치, 수용 기준 미충족, 규칙 위반을 issues로 반환. severity: blocker(기능 파손/규칙 위반) / major(디자인 불일치) / minor(사소한 다듬기).
- blocker/major가 없으면 pass:true. minor만 있으면 pass 가능 (issues에는 남겨라).
- 구현이 내린 **잠정 결정**은 그 자체로 issue가 아니다 — 근거 주석이 있고 followups에 기록됐다면 통과시키고, 기록이 빠졌으면 당신이 followups에 채워 넣어라.
${AUTONOMY}`
}

function designFixPrompt(m, issues) {
  const list = issues
    .map(
      (i, n) =>
        `${n + 1}. [${i.severity}] ${i.description}\n   파일: ${i.files.join(", ")}${i.fixHint ? `\n   힌트: ${i.fixHint}` : ""}`,
    )
    .join("\n")
  return `당신은 ShaderPlayground 디자인 핸드오프 v1.3+v1.4 반영 작업의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
검증자가 [마일스톤 ${m.id}]에서 다음 문제를 발견했다. 전부 수정하라.

${list}

${refBlock(m)}${specPolicyBlock(m)}

수정 방법에 판단이 필요하면 status:'blocked' + questions로 반환하라 (fable 아키텍트가 답한다). 사용자를 기다리지 마라.
${CONSTRAINTS}`
}

function gatePrompt(_m) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 품질 게이트를 실행하고 결과만 보고하라. 아무것도 수정하지 마라.

1) npm run check — Bash timeout 600000ms로 실행. (내부: typecheck → lint → deadcode → circular → unit test, 실패 시 즉시 중단)
2) 1)이 성공했을 때만: npm run test:e2e — timeout 600000ms. 전체 스펙(약 112건 + 신규, 6~10분). 시간 초과가 우려되면 npx playwright test tests/e2e/<파일> 로 나눠 돌리되 **임의 생략 금지**. dev 서버는 자동으로 뜬다.
   ⚠ 유닛 테스트는 jsdom stderr 노이즈(HTMLMediaElement not implemented 등)를 대량 출력한다 — 그건 실패가 아니다. **종료 코드와 요약 라인**으로 판정하라.
3) 번들 사이즈 가드(npm run size:check)는 이 워크플로우의 게이트가 아니다 — 실행하지 마라.

각 실패를 gate(typecheck|lint|deadcode|circular|unit|e2e) 별로 분류하고, detail에 핵심 에러 메시지/실패 스펙명·라인을 담아라. 통과했으면 failures는 빈 배열.`
}

function triagePrompt(m, failures) {
  const specNote =
    m.specPolicy === "forbid"
      ? `\n🔒 **이 마일스톤은 specPolicy:forbid다** — 기본 트리가 현행 레이아웃을 동치 재현해야 하므로 **기존 E2E는 무수정 통과가 불변식**이다. E2E 실패는 전부 **회귀(fixes)**로 분류하라. specChanges는 **빈 배열**이어야 한다.`
      : `\n※ Phase B는 **UI 구조를 의도적으로 바꾼다** — R5(problems/diagnostics가 SidePanel 탭에서 빠짐, tab-problems/tab-diagnostics testid 참조 스펙 7건), R6(헤더 ✕ 의미 변경), R4(접기가 트리 leaf 속성으로) 등. 기존 스펙이 옛 UI를 단언하고 있다면 정당한 specChange다. 확신이 없으면 회귀(fixes) 쪽으로 분류하라.`

  return `당신은 ShaderPlayground 디자인 핸드오프 v1.3+v1.4 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
[마일스톤 ${m.id}] 작업 후 품질 게이트가 실패했다. 실패 목록:

${JSON.stringify(failures, null, 2)}

저장소를 직접 조사해 각 실패의 근본 원인을 파악하고 분류하라. **당신이 결정권자다 — 사용자를 기다리지 말고 반드시 실행 가능한 지시를 내려라.**
- fixes: 코드 결함/회귀 — 하위 모델이 그대로 실행할 수 있는 구체적 수정 지시 (근본 원인 포함, 증상 덮기 금지).
- specChanges: 이번 디자인 변경이 의도한 UI 변화 때문에 기존 E2E expectation이 더 이상 유효하지 않은 경우만. proposedChange는 **새 디자인 값을 단언하는 강화 방향**이어야 하며, expect 삭제·test.skip 같은 약화는 절대 제안하지 마라. reason에 design/CHANGELOG.md v1.3/v1.4의 어느 결정 때문인지 명시하라.${specNote}
  ※ 적용된 스펙 변경은 전부 사용자에게 사후 보고되므로, 각 건을 followups(audience:'user')에도 남겨라.
${AUTONOMY}`
}

function gateFixPrompt(m, triage, allowSpec) {
  const fixes = triage.fixes
    .map((f, n) => `${n + 1}. ${f.instruction}\n   파일: ${f.files.join(", ")}`)
    .join("\n")
  const specs =
    allowSpec && triage.specChanges.length
      ? `\n[승인된 E2E 스펙 갱신 — 새 디자인 값을 단언하는 강화 방향으로만]\n${triage.specChanges.map((s, n) => `${n + 1}. ${s.spec}: ${s.proposedChange}\n   근거: ${s.reason}`).join("\n")}`
      : ""
  return `당신은 ShaderPlayground 디자인 핸드오프 v1.3+v1.4 반영 작업의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
품질 게이트 실패에 대한 아키텍트의 수정 지시다. 전부 적용하라.

[수정 지시]
${fixes}${specs}

적용 후 관련 게이트만 표적 재실행해 확인하라 (예: npx tsc --noEmit, npx vitest run <파일>, npx playwright test <스펙>). 전체 게이트는 별도 단계에서 재실행된다.
지시가 잘못됐다고 판단되면 임의 변경하지 말고 status:'blocked' + questions로 반환하라.
${CONSTRAINTS}`
}

function commitPrompt(m, unitSummaries) {
  const title = m.phase.replace(/^[AB]\d+ /, "")
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 마일스톤 변경을 커밋하라.
1) git add -A
2) git commit — 제목: "design(${m.id}): ${title} — 핸드오프 v1.3/v1.4". 본문: 아래 변경 요약을 bullet 몇 개로 정리하고, 반영한 요청 항목(${m.qr.join(", ")})을 명시한 뒤, 마지막 줄에 정확히 다음을 넣어라:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

[변경 요약]
${unitSummaries}

--no-verify 등 hook 우회 플래그 금지. 커밋 후 sha를 반환하라.
※ ${FOLLOWUP_DOC} 는 워크플로우가 별도로 관리하니 이 커밋에 함께 들어가도 무방하다.`
}

function quarantinePrompt(m, reason) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH}). [마일스톤 ${m.id}]이 품질 게이트를 초록으로 만들지 못했다: ${reason}

워크플로우는 멈추지 않고 다음 마일스톤으로 진행한다. 이 마일스톤의 작업을 **버리지 말고 격리**해서 브랜치를 마지막 초록 커밋 상태로 되돌려라.

1) git stash push -u -m "wf-quarantine-${m.id}" — 추적/미추적 파일 모두 보존한다 (나중에 git stash apply 로 복구 가능).
2) git status --porcelain 으로 작업 트리가 깨끗해졌는지 확인.
3) npx tsc --noEmit 로 HEAD 상태가 초록인지 빠르게 확인 (실패하면 note에 기록).
4) git stash list 로 보존된 stash 이름을 확인해 stashRef에 담아라.

아무것도 커밋하지 마라. reset --hard 금지 (작업이 사라진다).`
}

function docPrompt(followupList, milestoneStates) {
  return `저장소 ${ROOT}. 이 워크플로우가 자율 진행하면서 **사용자 판단 또는 디자인 문서 갱신이 필요하다고 판단한 항목**들을 모았다.
이것을 ${FOLLOWUP_DOC} 파일로 정리해 써라 (있으면 통째로 덮어쓴다 — 매번 전체 재생성).

[수집된 보류 항목 (JSON)]
${JSON.stringify(followupList, null, 2)}

[마일스톤 실행 상태 (JSON)]
${JSON.stringify(milestoneStates, null, 2)}

[문서 요구사항]
- 제목: "# 디자인 핸드오프 v1.3/v1.4 — 보류 항목 (자율 실행 산출물)". 첫 줄에 "이 문서는 워크플로우가 작업을 멈추지 않기 위해 **잠정 결정**으로 진행한 항목들의 목록이다. 각 항목은 이미 코드에 반영돼 있으며, 정식 결정이 나오면 표시된 위치를 고치면 된다."는 취지를 적어라.
- 섹션 구성:
  1. **사용자 판단 필요** (audience: user) — 스코프·정책·게이트. 각 항목: 무엇이 / 왜 / **잠정 처리** / 정식 결정 시 바꿀 위치(파일).
  2. **디자인 문서 갱신 필요** (audience: designer) — 다음 핸드오프(v1.5) 요청 후보. temp/design-request-v1.4.md와 같은 형식(🎨 시안 / 🎯 토큰 / ✅ 확답)으로 분류해 그대로 디자이너에게 보낼 수 있게 하라.
     **반드시 포함할 항목** (워크플로우가 사전에 확인한 정본 결함이다):
     · \`design/Docking Prototype.dc.html\`의 \`_defaultTree()\` 가운데 split이 \`dir:"row"\`인데 **\`"col"\`이어야 한다**. 같은 오류가 \`CHANGELOG.md\` §v1.4 R3 · \`README.md\` §M에도 전파돼 있어 **3곳 정정 필요**. 근거: 0.556 = 1.25/2.25 = 구현 viewportFrac(높이 비율) · \`.shell-right{flex-direction:column}\` · App Shell dc L208 column. R2("App Shell = 기본 레이아웃 정본")가 타이브레이크이므로 구현은 \`col\`로 진행했다.
     · A2가 실측한 PORT_STRIDE 값이 26이 아니었다면, dc의 Combine 핸들(44/70/96)을 실측값 기준으로 재정정 요청 (R15에서 "실측값이 정본"으로 확정됨).
  3. **적용된 E2E 스펙 변경** — 사후 검토용. 파일·테스트명·근거(v1.3/v1.4의 어느 결정)·변경 방향(강화인지) 명시. 없으면 "없음".
  4. **격리된 마일스톤** — stash로 빠진 마일스톤 + stash 이름 + 복구 방법(git stash apply) + 실패 요약. 없으면 "없음".
  5. **번들 사이즈** — 385 KiB 한도 대비 현황. 초과했다면 그 사실과 함께 "한도 상향은 사용자 승인 사항"임을 명시. 미측정이면 "미측정".
- 중복 항목은 병합하고, 같은 주제는 묶어라. 항목이 없는 섹션은 "없음"으로 남겨라 (섹션 자체는 유지).
- 한국어로, 저장소의 다른 temp/*.md 문서와 같은 톤(간결한 체크리스트 + 근거)으로 작성하라.
- 파일을 실제로 쓰고, itemCount에 총 항목 수를 반환하라. **코드는 건드리지 마라.**`
}

// ─────────────────────────────────────────────────────────────────────────────
// 실행 루틴
// ─────────────────────────────────────────────────────────────────────────────
const followups = []
function collect(res, source) {
  if (!res || !Array.isArray(res.followups)) return
  for (const f of res.followups) followups.push({ ...f, source })
}

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
    collect(res, `impl:${m.id}/${unit.id}`)
    if (res.status === "done")
      return { unit: unit.id, status: "done", summary: res.summary, escalated }
    priorSummary = res.summary || priorSummary
    const qs = res.questions || []
    if (escalated || qs.length === 0) {
      followups.push({
        audience: "user",
        title: `${m.id}/${unit.id} 미완료 — 자동 진행으로 끝내지 못함`,
        context: priorSummary || "(진행 상태 없음)",
        interimDecision:
          "이 유닛은 부분 구현 상태로 남았다. 검증/게이트 단계에서 회수되지 않으면 사람이 마무리해야 한다.",
        source: `impl:${m.id}/${unit.id}`,
      })
      return { unit: unit.id, status: "blocked", summary: priorSummary }
    }
    log(`  ${m.id}/${unit.id}: 구현이 질문 ${qs.length}건 → fable 오라클에 질의 (사용자 대기 아님)`)
    const ans = await agent(oraclePrompt(m, unit, qs, priorSummary), {
      label: `oracle:${m.id}/${unit.id}`,
      phase: m.phase,
      model: ORACLE_MODEL,
      effort: "high",
      schema: ANSWER_SCHEMA,
    })
    if (!ans) return { unit: unit.id, status: "oracle-lost", summary: priorSummary }
    collect(ans, `oracle:${m.id}/${unit.id}`)
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
    collect(v, `verify:${m.id}`)
    const blocking = (v.issues || []).filter((i) => i.severity !== "minor")
    if (v.pass || blocking.length === 0)
      return {
        pass: true,
        round,
        minors: (v.issues || []).filter((i) => i.severity === "minor").map((i) => i.description),
      }
    if (round === MAX_VERIFY_ROUNDS) {
      for (const i of blocking) {
        followups.push({
          audience: "designer",
          title: `${m.id} 디자인 불일치 미해소: ${i.description.slice(0, 80)}`,
          context: `검증 ${MAX_VERIFY_ROUNDS}라운드 후에도 남음. 파일: ${(i.files || []).join(", ")}`,
          interimDecision: "현재 구현 상태로 진행했다 (게이트는 통과 기준으로 별도 판정).",
          source: `verify:${m.id}`,
        })
      }
      return { pass: false, remaining: blocking.map((i) => i.description) }
    }
    log(`  ${m.id} 검증 r${round}: blocker/major ${blocking.length}건 → 수정 투입`)
    const fixRes = await agent(designFixPrompt(m, blocking), {
      label: `design-fix:${m.id}:r${round}`,
      phase: m.phase,
      model: round >= MAX_VERIFY_ROUNDS - 1 ? ORACLE_MODEL : IMPL_MODEL,
      schema: IMPL_SCHEMA,
    })
    collect(fixRes, `design-fix:${m.id}`)
    if (fixRes && fixRes.status === "blocked" && (fixRes.questions || []).length) {
      const ans = await agent(
        oraclePrompt(
          m,
          { id: "design-fix", title: "검증 이슈 수정", instructions: designFixPrompt(m, blocking) },
          fixRes.questions,
          fixRes.summary,
        ),
        {
          label: `oracle:${m.id}/design-fix`,
          phase: m.phase,
          model: ORACLE_MODEL,
          effort: "high",
          schema: ANSWER_SCHEMA,
        },
      )
      if (ans) {
        collect(ans, `oracle:${m.id}/design-fix`)
        const ab = ans.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
        const second = await agent(
          designFixPrompt(m, blocking) + `\n\n[아키텍트 답변 — 이 결정을 따르라]\n${ab}`,
          {
            label: `design-fix:${m.id}:r${round}b`,
            phase: m.phase,
            model: IMPL_MODEL,
            schema: IMPL_SCHEMA,
          },
        )
        collect(second, `design-fix:${m.id}`)
      }
    }
  }
  return { pass: false, note: "max verify rounds" }
}

// 게이트 루프: 실행 → fable 트리아지 → 수정 → 재실행. 멈추지 않는다.
async function gateLoop(m) {
  const allowSpec = ALLOW_SPEC_UPDATES && m.specPolicy !== "forbid"
  const appliedSpecChanges = []
  for (let attempt = 1; attempt <= MAX_GATE_ROUNDS; attempt++) {
    const g = await agent(gatePrompt(m), {
      label: `gate:${m.id}:r${attempt}`,
      phase: m.phase,
      model: IMPL_MODEL,
      effort: "low",
      schema: GATE_SCHEMA,
    })
    if (!g) return { green: false, appliedSpecChanges, note: "gate agent lost" }
    if (g.checkPass && g.e2ePass) return { green: true, appliedSpecChanges, attempts: attempt }
    if (attempt === MAX_GATE_ROUNDS)
      return {
        green: false,
        appliedSpecChanges,
        failures: g.failures.map((f) => `${f.gate}: ${f.summary}`),
        note: "max gate rounds",
      }
    const triage = await agent(triagePrompt(m, g.failures), {
      label: `triage:${m.id}:r${attempt}`,
      phase: m.phase,
      model: ORACLE_MODEL,
      effort: "high",
      schema: TRIAGE_SCHEMA,
    })
    if (!triage) return { green: false, appliedSpecChanges, note: "triage lost" }
    collect(triage, `triage:${m.id}`)

    const specs = allowSpec ? triage.specChanges || [] : []
    if (specs.length > 0) {
      appliedSpecChanges.push(...specs)
      for (const s of specs) {
        followups.push({
          audience: "user",
          title: `E2E 스펙 갱신 적용: ${s.spec}`,
          context: `근거: ${s.reason}`,
          interimDecision: `강화 방향으로 갱신함 — ${s.proposedChange}. (사전 승인된 정책이나 사후 검토 필요)`,
          source: `triage:${m.id}`,
        })
      }
    }
    if (!allowSpec && (triage.specChanges || []).length > 0) {
      for (const s of triage.specChanges) {
        followups.push({
          audience: "user",
          title: `E2E 스펙 갱신 필요(미적용): ${s.spec}`,
          context: `근거: ${s.reason} / 제안: ${s.proposedChange}`,
          interimDecision:
            m.specPolicy === "forbid"
              ? `${m.id}은 specPolicy:forbid(기존 E2E 무수정 통과가 불변식)라 적용하지 않았다. 코드 쪽 해결을 시도했고, 실패하면 이 마일스톤은 격리된다. **스펙 갱신이 정말 필요하다면 그건 기본 트리가 현행 레이아웃과 동치가 아니라는 신호다.**`
              : "allowSpecUpdates:false라 적용하지 않았다.",
          source: `triage:${m.id}`,
        })
      }
    }
    if ((triage.fixes || []).length === 0 && specs.length === 0)
      return {
        green: false,
        appliedSpecChanges,
        note: "트리아지가 적용 가능한 수정 항목을 내지 못함",
        failures: g.failures.map((f) => `${f.gate}: ${f.summary}`),
      }
    log(
      `  ${m.id} 게이트 r${attempt}: 수정 ${(triage.fixes || []).length}건, 스펙 갱신 ${specs.length}건 적용`,
    )
    const fixRes = await agent(gateFixPrompt(m, { ...triage, specChanges: specs }, allowSpec), {
      label: `gate-fix:${m.id}:r${attempt}`,
      phase: m.phase,
      model: attempt >= MAX_GATE_ROUNDS - 1 ? ORACLE_MODEL : IMPL_MODEL,
      schema: IMPL_SCHEMA,
    })
    collect(fixRes, `gate-fix:${m.id}`)
  }
  return { green: false, appliedSpecChanges, note: "max gate rounds" }
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────
phase("Setup")
log(`브랜치 ${BRANCH} 준비 + v1.3/v1.4 번들 확인 + 베이스라인 게이트`)
const setup = await agent(
  `저장소 ${ROOT} 준비 단계. 순서대로:
1) git status --porcelain 확인 — 작업 트리가 더러우면(추적 파일 변경 존재) ok:false, reason에 상태 요약을 담아 반환하고 종료. 아무것도 수정/스태시하지 마라.
2) **핸드오프 v1.3 + v1.4가 실제로 들어와 있는지** 확인 — 아래가 모두 참이어야 한다. 하나라도 아니면 ok:false + reason:
   - design/CHANGELOG.md 에 "## v1.3" 과 "## v1.4" 섹션이 **둘 다** 있다.
   - design/README.md §M 의 Docking Prototype 제목에 "[Unreleased]" 가 **없다** (v1.4에서 정본 승격됨).
   - design/Docking Prototype.dc.html 에 "startResize" / "floatWindow" / "tabInFloat" 가 **하나도 없다** (R1에서 죽은 코드 제거됨). grep으로 확인 — 있으면 v1.4 번들이 아니다.
   - design/Docking Prototype.dc.html 에 "MIN_W" 와 "pointerdown"(또는 onPointerDown) 이 있다 (R7/R10 반영 확인).
   - src/theme.ts 가 withAlpha / cssVars / tokens 를 export 한다 (구현 파생 export가 살아 있는지).
   - src/theme.ts 에 "fontBundle" 이 **없다** (Q10-b — 원래 미포팅이 정상).
3) 깨끗하면 브랜치 ${BRANCH}로 전환 (없으면 현재 HEAD에서 생성: git switch -c ${BRANCH}, 있으면 git switch ${BRANCH}).
4) node_modules가 없으면 npm ci.
5) 베이스라인 확인: npm run check 를 timeout 600000ms로 실행. **완전히 초록이어야 한다**. 실패하면 ok:false + reason에 실패 게이트 요약 — 수정하지 마라. 빨간 베이스라인에선 시작하지 않는다.
   ※ 유닛 테스트의 jsdom stderr 노이즈(HTMLMediaElement not implemented 등)는 실패가 아니다. 종료 코드로 판정하라.
모두 통과하면 ok:true, branch, reason에 베이스라인 상태 한 줄.

이 단계는 워크플로우가 유일하게 중단될 수 있는 지점이다 (더러운 트리 / 빨간 베이스라인 / 번들 누락 — 어느 것도 자동으로 고칠 수 없다). 이후 단계는 무슨 일이 있어도 끝까지 진행된다.`,
  { label: "setup", model: IMPL_MODEL, effort: "low", schema: SETUP_SCHEMA },
)
if (!setup || !setup.ok)
  return { status: "aborted", reason: setup ? setup.reason : "setup agent lost" }

const report = []
const quarantined = []

for (const m of MILESTONES) {
  if (ONLY && !ONLY.includes(m.id)) continue
  phase(m.phase)
  log(`── ${m.id} 시작 (항목: ${m.qr.join(", ")}${m.parallelUnits ? " / 유닛 병렬" : ""}${m.specPolicy === "forbid" ? " / 스펙 수정 금지" : ""})`)

  const plan = await agent(plannerPrompt(m, quarantined), {
    label: `plan:${m.id}`,
    phase: m.phase,
    model: ORACLE_MODEL,
    effort: "high",
    schema: PLAN_SCHEMA,
  })
  if (!plan || !plan.units || plan.units.length === 0) {
    followups.push({
      audience: "user",
      title: `${m.id} 플래너 실패 — 마일스톤 건너뜀`,
      context: "fable 플래너가 유닛을 내지 못했다.",
      interimDecision: "이 마일스톤은 손대지 않고 다음으로 넘어갔다. 해당 항목은 미처리로 남는다.",
      source: `plan:${m.id}`,
    })
    report.push({ milestone: m.id, status: "planner-failed", qr: m.qr })
    quarantined.push(m.id)
    continue
  }
  collect(plan, `plan:${m.id}`)
  log(`  ${m.id} 계획: ${plan.units.length}개 유닛 — ${plan.units.map((u) => u.title).join(" / ")}`)

  // 유닛 실행 — parallelUnits면 동시 실행(파일 disjoint 전제), 아니면 순차
  let unitResults
  if (m.parallelUnits) {
    const settled = await parallel(plan.units.map((u) => () => runUnit(m, u)))
    unitResults = settled.map((r, i) =>
      r ? r : { unit: plan.units[i].id, status: "agent-lost" },
    )
  } else {
    unitResults = []
    for (const unit of plan.units) {
      unitResults.push(await runUnit(m, unit))
    }
  }
  for (const r of unitResults) log(`  ${m.id}/${r.unit}: ${r.status}${r.escalated ? " (fable 인계)" : ""}`)

  const verify = await verifyLoop(m, plan)
  const gate = await gateLoop(m)

  let commit = null
  let quarantine = null

  if (gate.green) {
    if (DO_COMMIT) {
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
  } else {
    const reason = gate.failures ? gate.failures.join(" | ") : gate.note || "unknown"
    log(`  ⚠ ${m.id} 게이트 실패 — stash로 격리하고 다음 마일스톤으로 계속한다`)
    if (DO_COMMIT) {
      quarantine = await agent(quarantinePrompt(m, reason), {
        label: `quarantine:${m.id}`,
        phase: m.phase,
        model: SCAN_MODEL,
        effort: "low",
        schema: QUARANTINE_SCHEMA,
      })
    }
    quarantined.push(m.id)
    followups.push({
      audience: "user",
      title: `${m.id} 게이트 실패 — 격리됨 (${m.qr.join(", ")} 미해소)`,
      context: `실패: ${reason}`,
      interimDecision: DO_COMMIT
        ? `작업을 git stash("wf-quarantine-${m.id}")로 보존하고 브랜치를 마지막 초록 커밋으로 되돌린 뒤 계속 진행했다. 복구: git stash apply <ref>.`
        : "commit:false 모드라 격리하지 않았다 — 작업 트리에 빨간 변경이 남아 있을 수 있다.",
      source: `gate:${m.id}`,
    })
  }

  report.push({
    milestone: m.id,
    qr: m.qr,
    plan: { units: plan.units.map((u) => u.title), notes: plan.notes },
    units: unitResults.map((r) => ({ unit: r.unit, status: r.status })),
    designVerify: verify,
    gates: { green: gate.green, attempts: gate.attempts, note: gate.note, failures: gate.failures },
    specChanges: gate.appliedSpecChanges,
    commit: commit ? { sha: commit.sha, committed: commit.committed } : null,
    quarantine: quarantine ? { clean: quarantine.clean, stashRef: quarantine.stashRef } : null,
  })

  // 마일스톤마다 보류 문서 갱신 (중간에 죽어도 기록이 남도록)
  await agent(docPrompt(followups, report), {
    label: `followup-doc:${m.id}`,
    phase: m.phase,
    model: IMPL_MODEL,
    effort: "low",
    schema: DOC_SCHEMA,
  })
}

phase("Report")
const doc = await agent(docPrompt(followups, report), {
  label: "followup-doc:final",
  model: IMPL_MODEL,
  effort: "medium",
  schema: DOC_SCHEMA,
})

const ranIds = report.map((r) => r.milestone).join(", ")
const coverage = await agent(
  `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 반영 작업의 마무리 점검을 하라. **읽기 전용 — 코드를 수정하지 마라.**

[실행된 마일스톤] ${ranIds || "(없음)"}
[격리된 마일스톤] ${quarantined.length ? quarantined.join(", ") : "(없음)"}

1) **요청 항목 커버리지 대조**: v1.3의 **Q1 · Q1-b · Q2 · Q3 · Q4 · Q5 · Q6 · Q7 · Q8 · Q9 · Q10 · Q10-b · Q11** 과 v1.4의 **R1~R15** 전 항목에 대해, 현재 코드/커밋 기준으로 처리 상태를 판정하라.
   - done: 실제로 코드가 바뀌어 해소됨 (근거 파일/커밋)
   - verified-no-change: 확인 결과 코드 변경이 불필요했음 (현행 승인 항목 — Q2/Q3/Q4/Q8/Q11/R12 등이 여기 해당할 것)
   - deferred: 이번 실행 범위 밖 / 격리된 마일스톤의 항목
   - not-covered: 다뤄졌어야 하는데 누락됨 ← 있으면 note에 분명히 남겨라
   각 항목의 정본은 design/CHANGELOG.md의 §v1.3 / §v1.4다. git log --oneline 으로 이번 브랜치 커밋을 확인하고 필요하면 파일을 직접 읽어 판정하라. **추측하지 말 것.**

2) **정본 결함 확인**: src/state/layoutStore.ts(또는 트리 모델이 있는 곳)의 기본 트리에서 viewport와 inspector/assets를 가르는 split이 **\`col\`** 인지 확인하라. \`row\`면 note에 **명확히 blocker로 표시**하라 (앱 첫 화면이 바뀐 것 = R3 위반).

3) **잔여 raw hex 스캔**:
   grep -rnE '#[0-9a-fA-F]{3,8}\\b' src --include='*.ts' --include='*.tsx' --include='*.css'
   실행 후 src/theme.ts 와 *.test.* 는 제외하고 집계하라. "정당한 잔여물"(주석 속 디자인 참조값, ErrorBoundary 크래시 폴백, standalonePlayer.js 폴백 — 둘 다 README §도메인 [D6]/Q11이 인정한 예외)과 "미처리 잔여물"을 구분해 요약하라.

4) **번들 사이즈 참고 측정** (게이트 아님 — 실패해도 무방):
   npm run build && npm run size:check 를 timeout 600000ms로 실행하고 js 번들 KiB를 bundleKiB에, 385 KiB 초과 여부를 bundleOverLimit에 담아라.
   ⚠ 직전 측정이 **382.92 KiB**로 한도(385) 여유가 **2.1 KiB**뿐이었고 이번에 도킹 코드가 대량 추가됐다 — **초과가 예상된다.**
   초과하더라도 **scripts/check-bundle-size.mjs를 절대 수정하지 마라** — 한도 상향은 사용자 승인 사항이다. 넘었으면 그 사실만 보고하라.
   (로컬 Node가 CI(.nvmrc=22)와 달라도 이전 실측에서 gzip 크기는 일치했다.)`,
  { label: "coverage-scan", model: IMPL_MODEL, effort: "low", schema: COVERAGE_SCHEMA },
)

return {
  branch: BRANCH,
  handoff: "v1.3 (Q1~Q11, b6ef934) + v1.4 (R1~R15, 3a1981d)",
  allowSpecUpdates: ALLOW_SPEC_UPDATES,
  milestones: report,
  quarantined,
  followupDoc: {
    path: FOLLOWUP_DOC,
    written: doc ? doc.written : false,
    itemCount: doc ? doc.itemCount : followups.length,
  },
  coverage: coverage ? coverage.items : "coverage scan failed",
  residualHex: coverage
    ? { count: coverage.residualHexCount, summary: coverage.residualHexSummary }
    : { count: -1, summary: "scan failed" },
  bundle: coverage
    ? { kiB: coverage.bundleKiB, overLimit: coverage.bundleOverLimit, limit: 385 }
    : { kiB: -1, overLimit: null, limit: 385 },
  note: `자율 완주 모드 — 사용자 확인 없이 끝까지 진행했다. 판단이 필요한 항목은 ${FOLLOWUP_DOC} 에 정리돼 있다. 번들 사이즈(CI 한도 385 KiB, 시작 시점 382.92)는 게이트가 아니며 도킹 코드 추가로 초과가 예상된다 — 한도 상향은 사용자 승인 사항이다. dc의 기본 트리 dir:"row" 결함은 col로 구현했고 followup(designer)에 dc 3곳 정정 요청이 기록된다.`,
}
