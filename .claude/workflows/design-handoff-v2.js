export const meta = {
  name: "design-handoff-v2",
  description:
    "디자인 핸드오프 v2.0(breaking 레이아웃 재설계 + S26 토큰 + 노드메뉴/자동접기 + S5/S7) 코드 반영. 마일스톤 직렬 체인, 각 마일스톤 게이트 green 후 커밋. 자율 완주.",
  whenToUse:
    "design/ 번들 v2.0(4b430a7 + fix d11c83a)의 디자이너 정본을 코드에 반영할 때. 사용자에게 묻지 않고 끝까지 진행하며, 판단 필요 항목은 temp/design-followup-v2.0.md에 모은다. 계획 근거는 temp/impl-plan-v2.0.md. args: { only?: ['M1'...], branch?, allowSpecUpdates?: bool, commit?: bool }",
  phases: [
    { title: "Setup", detail: "브랜치 · v2.0 번들 확인 · 베이스라인 게이트" },
    { title: "M0 Tokens", detail: "S26 신규 토큰 7키 src/theme.ts 병합 (additive)" },
    {
      title: "M1 Layout+E2E",
      detail:
        "기본 트리 v2.0 · 마이그레이션 version 1→2 · leafPanelKind→active(S5) · position chevron(req1) · E2E m4/m5 재작성+m1 리타깃",
    },
    { title: "M2 Node Menu", detail: "노드추가 → NodeEditor 플로팅 pill(W4) · 파일/익스포트 항목 재배치" },
    { title: "M3 Auto-collapse", detail: "Code 자동접기 + autoCode 토글(W5, 기본 ON + 테스트 훅)" },
    { title: "M4 Diag Strip", detail: "진단 오버레이 단일행 메트릭 스트립(S7)" },
    { title: "Report", detail: "v2.0 항목 커버리지 · 잔여 hex · 번들(참고, 한도 393)" },
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
const HANDOFF = "v2.0"
const BUNDLE_LIMIT = 393 // KiB — v1.4에서 385→393 상향(사용자 sign-off). 게이트 아님(CI 잡).

const FOLLOWUP_DOC = "temp/design-followup-v2.0.md"

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
const BRANCH = A.branch || "design/handoff-v2.0"
const ONLY = Array.isArray(A.only) ? A.only : null
const ALLOW_SPEC_UPDATES = A.allowSpecUpdates !== false // 기본 true — 사용자가 강화 재작성 사전 승인
const DO_COMMIT = A.commit !== false

// ─────────────────────────────────────────────────────────────────────────────
// 공통 제약
// ─────────────────────────────────────────────────────────────────────────────
const AUTONOMY = `
[자율 완주 원칙 — 중요]
- 이 워크플로우는 **사용자에게 묻지 않고 끝까지 진행**한다. 사람의 답을 기다리며 멈추는 선택지는 없다.
- status:'blocked'는 **상위 모델(fable 아키텍트)에게 에스컬레이션하는 내부 신호**다 — 사용자에게 묻는 게 아니다. 갈림길에서 판단이 서지 않으면 blocked + questions로 반환하면 fable이 결정해준다.
- 사용자/디자이너 결정이 "진짜로" 필요해 보여도 **멈추지 마라**. 대신:
  1) 되돌리기 쉬운 **잠정 결정**으로 진행한다 (우선순위: 정본/기존 패턴 근사 → 현행 유지 + 사유 주석 → 최소 변경).
  2) followups에 기록한다 (audience: 'user' | 'designer', 무엇을 왜 잠정 결정했는지 + 정식 결정 시 바꿀 위치).
- followups는 ${FOLLOWUP_DOC} 로 취합된다. 기록하면 그 항목은 "처리된 것"이다 — 다시 막히지 마라.`

const CONSTRAINTS = `
[품질 제약 — CLAUDE.md, 위반 금지]
- TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes. any / as-unknown-as 캐스팅 우회 금지.
- Biome warn 0건 유지. **새 biome-ignore 추가 금지** — 리팩터로 해소하라. 불가하면 followups(audience:'user')에 기록 후 현행 유지.
- Knip 0건: 새 export는 같은 변경 안에서 실제 호출자/임포터를 함께 연결. 고아 export 금지.
- 순환 의존성 0건: store끼리 직접 상호 import 금지 (단방향 selector/subscribe만).
- 커버리지 임계(lines 50 / functions 47 / branches 42 / statements 50) 하락 금지 — 신규 로직에 *.test.ts(x) 동반.
- 게이트 설정 파일(tsconfig/biome.json/knip.json/vitest.config.ts/scripts/check-bundle-size.mjs) **완화 금지**. vitest coverage.exclude에 신규 파일 추가 금지.

[토큰 규칙 — v2.0은 v1.2 이후 "처음으로 신규 토큰이 있는" 번들이다]
- **S26에서 다음 7개 키만 추가한다 — 이 목록이 전부다**: accent.bright / semantic.successBright / nodeCategory.processBright / nodeCategory.valueBright / nodeCategory.outputBright / gradient.viewportActive / gradient.shaderSphere (design/theme.ts의 값 그대로). ⚠ 디자이너 문서(W2/README)는 이를 "6종"으로 표기한다(gradient 2키를 1종으로 셈) — **키 수는 7이 정답이다. "6"에 맞추려 키를 빼지도, 7키를 보고 초과라고 판정하지도 마라. 판정은 개수가 아니라 목록 대조로.**
- **값 정본 = design/theme.ts** (accent.bright #7dbcff:64 · semantic.successBright #6fe3b8:84 · nodeCategory.processBright #7dbcff/valueBright #e2ba57/outputBright #ee7fac:100-102 · gradient.viewportActive:46 · gradient.shaderSphere:48). 그대로 복사.
- **그 외 새 토큰 추가 금지. 기존 토큰의 값은 절대 변경 금지**(additive-only). 값을 지어내지 마라.
- **src/theme.ts를 덮어쓰지 마라.** design/theme.ts(디자이너 정본)와 src/theme.ts(런타임 정본, **상위집합**)는 둘 다 유지된다. src에는 구현 파생 항목이 더 있다 — tokens 객체 내부 키(nodeCardSolid·emptyStateIcon·cardLg·modal·thumbnailInset·onCanvasText·overlayBar·shadow.modal — 개별 export가 아니라 tokens의 키다)와 named export(withAlpha·cssVars — named export는 tokens·PORT_DIAMETER·cssVars·withAlpha 4개가 전부). v1.1에 덮어쓰기로 이 구현 파생 항목이 소실된 실사고가 있었다 — 7키를 **해당 그룹에 병합**만 하라.
- 색·radius·shadow·모션은 src/theme.ts의 tokens.* 또는 var(--*)만 사용. 컴포넌트에 raw hex 직접 금지. canvas 2D API는 CSS 변수를 못 읽으므로 그 경우만 tokens.* 직접 import.
- 예외: ErrorBoundary 크래시 폴백 + src/export/standalonePlayer.js 폴백은 **의도적으로 토큰 비의존**(README §도메인 [D6]). 토큰화 강행 금지.
${
  ALLOW_SPEC_UPDATES
    ? `
[E2E 스펙 정책 — v2.0은 breaking 레이아웃이라 스펙 재작성이 예정돼 있다]
tests/e2e/** 스펙 수정은 사용자가 사전 승인함 — 단 **강화 방향만**: 새 v2.0 레이아웃 값/경로를 단언하도록 갱신하는 것만 허용. **expect 삭제·완화·test.skip·test.fixme는 절대 금지.** 예정된 재작성 대상: m5-dock-chrome(접기 축·splitter 수/라벨·클램프) · m4-dock-dragdrop(기본 위치 드롭 타깃) · m1-dock-header-collapse(레일 전제 .shell-left→.shell-code). code-editor(phase-24~28)에 autoCode-off 테스트 훅 호출을 추가하는 것은 **단언 약화가 아니라 테스트 환경 제어**라 허용(단언은 손대지 마라). 수정했다면 파일·테스트명·사유를 summary와 followups(audience:'user')에 남겨라.`
    : `
[E2E 스펙 정책]
tests/e2e/** 수정 금지 — 코드 쪽에서 해결하고, 불가하면 followups(audience:'user')에 기록 후 진행하라. (allowSpecUpdates:false 모드)`
}

[번들]
- 번들 사이즈 가드(${BUNDLE_LIMIT} KiB)는 CI 잡이며 이 워크플로우의 게이트가 아니다. v2.0은 **순수 구조 변경**이라 순증이 작을 것으로 예상되나, 초과하더라도 **scripts/check-bundle-size.mjs를 절대 수정하지 마라** — 한도 상향은 사용자 승인 사항이다. 초과가 보이면 followups(audience:'user')에 기록.

[진행]
- 커밋하지 마라 — 커밋은 워크플로우가 별도 단계에서 수행한다.
- 마무리 전 자가 검증: npx tsc --noEmit, 그리고 수정 파일에 npx biome check --write.
${AUTONOMY}`

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ 전 마일스톤 공통 — v2.0 정본 사실 (에이전트가 재조사로 헤매거나 틀리지 않게 미리 박아둠)
//    (이미 이 세션의 4개 Explore 조사로 확정된 사실이다 — 다시 조사하느라 낭비하지 마라)
// ─────────────────────────────────────────────────────────────────────────────
const KNOWN_FACTS = `
[⛔ v2.0 반영 — 이미 확인된 정본 사실 (재조사 불필요, 그대로 신뢰하라)]
- **\`src/state/layoutStore.ts\`는 없다.** 옛 고정 4패널 스토어는 트리 기반 \`src/state/dockStore.ts\`로 대체됐다(주석 \`dockTree.ts:14\`). 기본 트리는 \`src/state/dockTree.ts:89-120 createDefaultDockTree\`.
- **v2.0 기본 트리** = \`row 0.25 [ code | row 0.60 [ nodeEditor | col 0.52 [viewport / (inspector,assets)] ] ]\` — 좌 Code(25%, 접기 가능) · 중앙 Node Editor(대형) · 우 col[Viewport(상)/Inspector·Assets(하)]. 정본은 design/CHANGELOG §v2.0 + README §M. leaf id는 load-bearing(nextLeafId=5): id는 재사용하되 트리 형태만 교체.
- **좌측 34px 세로 레일 접기는 이미 공짜다 — 새 분기를 만들지 마라.** 접힘 strip 크기는 부모 split \`dir\`에서 파생되고(\`dockTree.ts:341\` row-branch, \`dockLayoutModel.ts:77-99 splitChildFlex\`, \`collapsesToRail:113-120\`은 부모 dir==='row'이면 true), 레일 CSS(\`index.css:422-428 .dock-header--rail\`)는 원래 좌측 케이스용으로 작성됐다. Code를 root row의 \`a\`(좌측)에 두면 신규 로직 0으로 동작한다 — **시각 검증만** 하라.
- **마이그레이션 seam은 이미 있다.** 스냅샷 \`version\` 리터럴을 \`1→2\`로 올리면 옛 저장 레이아웃이 조용히 폐기→새 기본 트리 폴백(무배너, V4 요구와 일치). 4곳: \`dockTree.ts:735\`(타입) · \`dockTree.ts:855\`(게이트 raw.version!==1) · \`dockTree.ts:885\`(반환 version:1) · \`autoSave.ts:262\`(writer version:1).
- **E2E 셀렉터는 화면 위치가 아니라 패널 kind에 매인다**(\`dockLayoutModel.ts:49-56\`): nodeEditor→.shell-left · viewport→.shell-right-top · inspector/assets→.shell-right-bottom · code→.shell-code. 그래서 대부분 스펙은 **살아남는다.** 하드 브레이크는 **m4-dock-dragdrop**(기본 위치 드롭 타깃)·**m5-dock-chrome**(접기 축 height→width·수직 splitter 1→2·root splitter label·code 높이 클램프)에 집중. **m1-dock-header-collapse**는 레일 전제만 \`.shell-left\`→\`.shell-code\`로 리타깃(soft).
- **토큰 교체 작업은 사실상 없다.** S26 대상 hex(#7dbcff 등)는 src/에서 전부 주석 또는 토큰 정의일 뿐 **라이브 리터럴 0**. S26 = src/theme.ts에 7키 additive 병합뿐. \`cssVars()\`가 새 var(--accent-bright 등)를 자동 emit한다.
- **노드 추가 메뉴**: \`AppToolbar.tsx:419-586\`의 \`tb-group\`. 단 \`＋ More\`(446-585)는 **섞여 있다** — Load…/Import JSON/Export JSON/Snap PNG(531-582) + 숨은 file input(587-601)은 **노드추가가 아니므로 재배치**(삭제 금지). add* 헬퍼(277-360)는 \`useGraphStore.getState().addNode(node,pos)\`를 부른다. 노드추가 버튼엔 **testid가 없고** E2E는 노드를 \`window.__sp.addNode\`로 만든다 → **노드메뉴 이전은 E2E 영향 0**.
- **노드 선택 상태**: \`src/state/selectionStore.ts\` \`useSelectionStore.selectedNodeId\`. kind 판정 = \`useGraphStore.getState().nodes.find(n=>n.id===selectedNodeId)?.kind\`. NodeEditor(\`index.tsx\`)가 선택의 출처.
- **Code 접기 액션 갭**: dock 스토어엔 \`toggleCollapsed(path)\`만 있고(\`dockStore.ts:62/150\`) \`setCollapsed(id,bool)\`가 없다 → 멱등 자동접기용으로 신설하라(대상 경로 = \`findTabLeafPath(tree,"code")\`, \`dockTree.ts:189\`; 패널이 닫히거나 이동했으면 null이니 가드).
- **접기 chevron**: 현재 \`DockPanelHeader.tsx:184\`가 \`⌃/⌄\` 리터럴. req1 = 위치 기반(부모 dir + a/b 자식) → \`collapseChevron(tree,path,collapsed)\` 순수 헬퍼를 \`dockLayoutModel.ts\`(collapsesToRail 옆)에 신설해 소비.
- **leafPanelKind**(\`dockLayoutModel.ts:35-44\`)는 \`tabs[0]\` 기준 → \`leaf.active\` 기준으로(S5). viewport/code 이종 병합 제외(T1)는 leafPanelKind가 아니라 **insertDetachedLeaf 중앙 병합 존**(\`dockTree.ts:688-694\`)에서 강제.
- **S7 스트립**: \`StatusOverlays.tsx\` 헤더(40-42)와 콘텐츠(55-63) 사이에 \`open\`(diagnostics)일 때만 ~26px. 값 소스 = rendererStore.glInfo/stats.{fps,drawCalls} + graphStore.nodes + diagnosticsStore.byNode (\`frameMetricValue\`/\`linkedProgramsValue\`, \`DiagnosticsPanel.tsx:159-185\`). 계산을 공유 헬퍼로 승격해 카드/스트립 단일 출처.
- **Docking Prototype.dc.html은 v2.0에서 삭제됐다.** 도킹 정본은 이제 \`design/App Shell.dc.html\`(SSoT). 삭제된 파일을 찾지 마라.`

// ─────────────────────────────────────────────────────────────────────────────
// 마일스톤 정의
//   items        = 이 마일스톤이 반영하는 요청/결정 ID
//   dependsOn    = 선행 마일스톤 (격리되면 의존 유닛 제외)
//   parallelUnits= true면 유닛 동시 실행 (파일 disjoint 전제)
//   specPolicy   = 'forbid'면 이 마일스톤에선 E2E 스펙 수정 금지 (E2E 영향 없어야 정상)
// ─────────────────────────────────────────────────────────────────────────────
const MILESTONES = [
  {
    id: "M0",
    phase: "M0 Tokens",
    items: ["S26"],
    dependsOn: [],
    parallelUnits: false,
    goal: `S26 정합성 정리 — 신규 토큰 7키(디자이너 표기 "6종")를 src/theme.ts에 **additive 병합**한다. 값은 design/theme.ts 정본 그대로.
- accent.bright(#7dbcff) → accent 그룹 · semantic.successBright(#6fe3b8) → semantic 그룹 · nodeCategory.processBright(#7dbcff)/valueBright(#e2ba57)/outputBright(#ee7fac) → nodeCategory 그룹 · gradient.viewportActive/shaderSphere → gradient 그룹(문자열 정본은 design/theme.ts:46,48, 5종점 그라디언트는 복붙 금지 = 그 문자열이 정본).
- **기존 토큰 값은 절대 변경 금지. 그 외 새 토큰 금지. src/theme.ts 덮어쓰기 금지(구현 파생 export 보존).**
- cssVars()가 새 토큰의 CSS 변수를 자동 emit하는지 확인(accent/semantic/nodeCategory/gradient 이터레이션). 라이브 hex 리터럴 교체는 사실상 없음(드리프트는 주석/dc에만) — 무리해서 교체하지 마라.`,
    design: [
      "design/CHANGELOG.md (§v2.0 정합성 정리 S26 — A~F)",
      "design/theme.ts (accent.bright:64 · semantic.successBright:84 · nodeCategory.processBright/valueBright/outputBright:100-102 · gradient.viewportActive:46 · gradient.shaderSphere:48)",
    ],
    screens: [],
    hints: [
      "src/theme.ts — tokens.accent / .semantic / .nodeCategory / .gradient 그룹 + cssVars() (신규 var 자동 emit)",
      "라이브 리터럴 0: 대상 hex는 주석(index.css:361/1330 · DiagnosticsPanel.tsx:167 등)에만 — 교체 강행 금지",
      "src/theme.test.ts(있으면) — 토큰 존재/스냅샷",
    ],
    checks: [
      "src/theme.ts에 정확히 다음 7키(accent.bright/semantic.successBright/nodeCategory.processBright·valueBright·outputBright/gradient.viewportActive·shaderSphere)가 추가됐는지 — 디자이너 표기 '6종'과 키 수(7)가 다른 건 정상이다. 목록 대조로 판정하고 개수 불일치를 이슈로 잡지 마라",
      "값이 design/theme.ts 정본과 일치하는지 (특히 shaderSphere 5종점 문자열)",
      "기존 토큰 값이 하나도 안 바뀌었는지 · 구현 파생 항목(tokens 내부 키 nodeCardSolid·shadow.modal 등 + named export withAlpha·cssVars)이 소실 안 됐는지",
      "cssVars()가 --accent-bright/--success-bright/--node-cat-*-bright/--gradient-viewport-active/--gradient-shader-sphere를 emit하는지",
      "그 외 새 토큰이 추가되지 않았는지",
    ],
    specPolicy: "forbid",
  },
  {
    id: "M1",
    phase: "M1 Layout+E2E",
    items: ["v2.0-layout", "S5", "req1", "V2", "V3", "V4"],
    dependsOn: [],
    parallelUnits: false,
    goal: `**breaking 레이아웃 코어 + 그 E2E 재작성을 한 마일스톤에** 처리한다(마일스톤 종료 시 게이트 green이 되게).
(a) [기본 트리] \`dockTree.ts:89-120 createDefaultDockTree\`를 v2.0 트리 \`row 0.25 [ code | row 0.60 [ nodeEditor | col 0.52 [viewport / (inspector,assets)] ] ]\`로 재작성. code leaf \`collapsed:false\`(첫 화면 펼침 — code-editor E2E 보호). leaf id 재사용, nextLeafId 규약 유지.
(b) [마이그레이션/V4] 스냅샷 version \`1→2\` 4곳(\`dockTree.ts:735/855/885\`, \`autoSave.ts:262\`) → 옛 저장 레이아웃 조용한 폴백(무배너).
(c) [S5] \`leafPanelKind\`(\`dockLayoutModel.ts:35-44\`)를 tabs[0]→\`leaf.active\` 기준으로. sidePanel도 active 키로. **viewport/code 이종 병합 제외(T1)**는 \`insertDetachedLeaf\` 중앙 병합 존(\`dockTree.ts:688-694\`)에서 강제(viewport/code 대상이면 같은 kind만 탭 병합).
(d) [req1] 위치 기반 chevron: \`collapseChevron(tree,path,collapsed)\` 순수 헬퍼 신설(부모 dir + a/b: row-a=‹/›, row-b=›/‹, col-a=⌃/⌄, col-b=⌄/⌃) → \`DockPanelHeader.tsx:184\`에서 리터럴 대체.
(e) [V2] Code가 root row의 좌측(\`["a"]\`)이라 접힘=34px 세로 레일이 기존 로직으로 동작함을 **시각 검증**(새 분기 만들지 말 것).
(f) [단위 테스트] \`dockTree.test.ts:78-120\`(기본 트리 객체 단언) 재작성 · \`dockLayoutModel.test.ts\`·\`DockLayout.test.tsx\`(leafPanelKind tabs[0]→active) 갱신.
(g) [E2E 재작성 — 강화 방향] \`m5-dock-chrome\`(접기 축 height→width 레일·수직 splitter toHaveCount 1→2·root splitter label·code 높이 클램프/shell-left 비율) · \`m4-dock-dragdrop\`(top-left 드롭 타깃 nodeEditor→code, split 기하) 를 v2.0 기하로 재작성. \`m1-dock-header-collapse\`는 레일 전제 \`.shell-left\`→\`.shell-code\` 리타깃. **skip/fixme/expect 삭제 금지.**`,
    design: [
      "design/CHANGELOG.md (§v2.0 결정 요약 v2.0 트리 · Changed App Shell BODY · W2/W3 · req1 chevron)",
      "design/README.md (§A App Shell 레이아웃 · §M 기본 트리/영속화 R9/컴팩트 R11)",
      "design/App Shell.dc.html (좌 Code 25% + 접힘 34px 레일 · 중앙 Node Editor order:1 flex:1.5 · 우 col[Viewport/Side Panel] · position chevron)",
    ],
    screens: ["design/screens/01-app-shell.png"],
    hints: [
      "src/state/dockTree.ts:89-120 createDefaultDockTree / :735·855·885 version / :688-694 insertDetachedLeaf 중앙병합 / :189 findTabLeafPath / :309-428 layoutNode·clampDividerRatio",
      "src/state/autoSave.ts:231 LAYOUT_KEY / :258-273 saveDockLayout(version:262) / :242-252 loadDockLayout / :290-324 startDockLayoutPersistence",
      "src/ui/dockLayoutModel.ts:35-44 leafPanelKind / :49-56 legacyLeafClass / :77-99 splitChildFlex / :113-120 collapsesToRail",
      "src/ui/DockPanelHeader.tsx:184 chevron 리터럴 · :117 active 탭 / src/ui/DockLayout.tsx:636-667 DockLeafView",
      "src/index.css:422-428 .dock-header--rail / :209-211 .shell-slot--collapsed",
      "tests/e2e/m5-dock-chrome.spec.ts / m4-dock-dragdrop.spec.ts / m1-dock-header-collapse.spec.ts",
      "단위: src/state/dockTree.test.ts:78-120 / src/ui/dockLayoutModel.test.ts / src/ui/DockLayout.test.tsx",
    ],
    checks: [
      "기본 트리가 v2.0 형태와 정확히 일치하는지(좌 code 0.25 · 중 nodeEditor · 우 col[viewport/inspector·assets]), code collapsed:false",
      "스냅샷 version이 4곳 모두 2로 올랐고, version:1 blob이 조용히 폴백(무배너)되는지",
      "leafPanelKind가 leaf.active 기준인지 · viewport/code가 이종 탭 병합되지 않는지(insertDetachedLeaf)",
      "collapseChevron가 부모 dir+a/b로 방향을 정하는지 · DockPanelHeader가 이를 소비하는지",
      "Code가 34px 좌측 세로 레일로 접히는지(시각/상호작용 확인) — 새 분기 없이",
      "m4/m5가 v2.0 기하로 재작성됐고 m1이 .shell-code로 리타깃됐는지 · **약화·skip·fixme 0건**(git diff로 확인)",
      "다른 E2E(m2/m3/m6·phase-16/12·viewport/inspector 계열)가 무수정으로 통과하는지",
    ],
    specPolicy: "allow",
  },
  {
    id: "M2",
    phase: "M2 Node Menu",
    items: ["W4"],
    dependsOn: [],
    parallelUnits: false,
    goal: `노드 추가 메뉴를 툴바에서 제거하고 Node Editor 캔버스 상단 중앙 플로팅 pill로 옮긴다(W4). ⌘K 팔레트는 유지(역할 분리).
- \`AppToolbar.tsx:419-586\`의 노드추가 tb-group 제거. **단 \`＋ More\`에 섞인 파일/익스포트(Load…/Import JSON/Export JSON/Snap PNG, 531-582) + 숨은 file input(587-601)은 삭제가 아니라 재배치**(적절한 파일 메뉴/기존 근처). 브랜드·Presets·＋Panel·Reset·transport·Search·Help·Clear는 유지.
- \`NodeEditor/index.tsx:444 panel-body\`에 플로팅 pill 오버레이 신설(선례 selection-count-badge absolute:491-511). 카테고리 버튼 = \`useGraphStore.getState().addNode(node,pos)\` + \`useSelectionStore.getState().select(id)\`(팔레트와 동일 패턴, add* 헬퍼 재사용 또는 공통화). \`＋ More\` = \`useCommandPaletteStore.getState().setOpen(true)\`.
- 가림 처리(W4): pill이 상단 중앙을 상시 점유하므로 캔버스 상단 여백 확보 / pill 뒤 노드는 패닝 오프셋으로 회피.
- \`AppToolbar.test.tsx\`(텍스트로 버튼 구동, 29-137) 이전·재작성.`,
    design: [
      "design/CHANGELOG.md (§v2.0 W4 · Changed 노드 추가 메뉴)",
      "design/README.md (§A 노드 추가 팔레트 위치(W4 확정) · 툴바 구성)",
      "design/App Shell.dc.html (floating add-node pill: left:50% top:12 z-index:6 · ＋ More)",
    ],
    screens: ["design/screens/01-app-shell.png"],
    hints: [
      "src/ui/AppToolbar.tsx:419-586 tb-group / :277-360 add* 헬퍼(addNode) / :531-582 파일·익스포트 항목 / :587-601 file input / 그 외(브랜드·Presets·＋Panel·transport·Search) 보존",
      "src/ui/CommandPalette/index.tsx buildCommands — addNode+select 정본 패턴 / useCommandPaletteStore.setOpen(true) (⌘K)",
      "src/state/graphStore.ts:60/228 addNode(node,position) / src/state/selectionStore.ts select",
      "src/ui/NodeEditor/index.tsx:444 panel-body(오버레이 앵커) · :491-511 selection-count-badge(absolute 선례)",
      "src/ui/AppToolbar.test.tsx:29-137",
    ],
    checks: [
      "툴바에 노드추가 버튼이 더는 없는지 · 파일/익스포트(Load/Import/Export/Snap)가 삭제가 아니라 재배치돼 여전히 도달 가능한지",
      "플로팅 pill이 노드를 생성하고 선택까지 하는지(addNode+select) · ＋More가 팔레트를 여는지",
      "⌘K 팔레트가 여전히 전체 노드 추가를 제공하는지(무영향)",
      "E2E가 무영향인지(노드 생성은 window.__sp.addNode 경유) · pill이 기존 오버레이(미니맵/줌/선택배지)와 겹치지 않는지",
      "AppToolbar.test.tsx가 새 구조로 갱신됐는지",
    ],
    specPolicy: "forbid",
  },
  {
    id: "M3",
    phase: "M3 Auto-collapse",
    items: ["W5", "req3"],
    dependsOn: ["M1"],
    parallelUnits: false,
    goal: `Code 자동 접기/펼침을 노드 선택으로 구동하되, **옵션 토글로 감싼다**(W5, 기본 ON).
- dock 스토어에 \`setCollapsed(id, collapsed)\` 액션 신설(멱등). 대상 = \`findTabLeafPath(tree,"code")\`(닫힘/이동 시 null 가드).
- \`autoCode\` 선호 상태(기본 ON) + Code 패널 헤더 우측 인라인 \`Auto-open: ON/OFF\` 토글 신설(스테이지 탭 스트립 안, dc 정본 참조).
- \`useSelectionStore.selectedNodeId\` 구독 → 선택 노드 kind가 \`shader\`면 code 펼침, 그 외면 접힘. **빈 선택=현상 유지 · 다중 선택=Shader 포함 시 펼침(Auto 한정) · autoCode OFF=자동 구동 정지(수동 chevron만)**.
- **[테스트 훅 — 사용자 결정]** autoCode를 E2E에서 끌 수 있는 훅을 노출하라(예: 기존 \`window.__sp\` 브리지에 setter 추가, 또는 스토어 setter를 E2E helper가 호출 — 새 전역을 만들지 말고 __sp를 확장하라). code-editor 스펙(phase-24~28)이 비-shader 선택 중 code를 편집할 때 자동접힘으로 깨지지 않게, 해당 스펙 setup에서 autoCode를 off로 두거나 shader를 선택하게 하라. **단언은 손대지 말 것**(테스트 환경 제어만).
- 상태머신 단위 테스트 추가(shader→open, non-shader→collapse, deselect→keep, autoCode off→no-op).`,
    design: [
      "design/CHANGELOG.md (§v2.0 W5 · Changed Code 자동 접기(W5-U2 확정))",
      "design/README.md (§A Code 자동 접기/펼침(W5 확정 — 옵션 토글))",
      "design/App Shell.dc.html (state.autoCode · selectNode 가드 · Code 헤더 Auto-open 토글 · autoCodeHdrStyle)",
    ],
    screens: ["design/screens/01-app-shell.png"],
    hints: [
      "src/state/dockStore.ts:62/150 toggleCollapsed(신규 setCollapsed 근처) / src/state/dockTree.ts:189 findTabLeafPath",
      "src/state/selectionStore.ts:10 selectedNodeId / src/state/graphStore.ts nodes(kind 판정)",
      "src/ui/CodeEditor/ 헤더(Auto-open 토글 배치) · code leaf collapsed 플래그",
      "tests/e2e/phase-24·25·26·27·28(stage-tab-* / .cm-content) — autoCode-off 훅 setup 필요할 수 있음",
      "tests/e2e/helpers/sp.ts — window.__sp 브리지 계약(declare global :298-300, addNode 시그니처 :41). 실제 노출은 src/main.tsx dev 모드(window.__sp = {...}) — 테스트 훅은 여기를 확장",
    ],
    checks: [
      "setCollapsed(id,collapsed)가 멱등이고 code leaf가 닫힘/이동 시 null 가드하는지",
      "autoCode 기본 ON · Auto-open 토글이 Code 헤더에 있고 동작하는지",
      "shader→펼침 / non-shader→접힘 / 빈 선택→현상유지 / 다중선택 shader 포함→펼침 / autoCode OFF→자동구동 정지",
      "E2E autoCode 테스트 훅이 노출됐고 code-editor 스펙이 green인지 · **단언 약화 0건**",
      "상태머신 단위 테스트가 추가됐는지",
    ],
    specPolicy: "allow",
  },
  {
    id: "M4",
    phase: "M4 Diag Strip",
    items: ["S7"],
    dependsOn: [],
    parallelUnits: false,
    goal: `진단 오버레이에 단일행 메트릭 스트립을 넣는다(S7). 전체 2×2 카드는 Side Panel Diagnostics 탭 전용, 오버레이는 스트립만.
- \`StatusOverlays.tsx\` 헤더(40-42)와 콘텐츠(55-63) 사이에 \`open\`(diagnostics)일 때만 ~26px 스트립(GPU/Frame/Draws/Shaders). **problems 오버레이엔 스트립 없음(T4).**
- 값 소스는 카드와 동일: rendererStore.glInfo/stats.{fps,drawCalls} + graphStore.nodes + diagnosticsStore.byNode (\`frameMetricValue\`/\`linkedProgramsValue\`). metrics 계산을 **공유 헬퍼로 승격**해 카드/스트립 단일 출처.
- 단위 테스트 추가.`,
    design: [
      "design/CHANGELOG.md (§v1.6 T3/T4 · §v2.0 참조)",
      "design/README.md (§M problems/diagnostics — 메트릭 스트립 diagnostics 전용)",
      "design/App Shell.dc.html (진단 오버레이 ~26px 메트릭 스트립)",
    ],
    screens: [],
    hints: [
      "src/ui/Panels/StatusOverlays.tsx:40-42 헤더 / :55-63 콘텐츠 래퍼(그 사이 삽입) / open vs problemsOpen",
      "src/ui/Panels/DiagnosticsPanel.tsx:159-185 metrics 배열(GPU/Frame/Draws/Shaders 소스) / diagnosticsTab.ts frameMetricValue·linkedProgramsValue",
      "src/state/rendererStore(glInfo·stats) · graphStore(nodes) · diagnosticsStore(byNode)",
    ],
    checks: [
      "스트립이 diagnostics 오버레이에만, problems엔 없는지",
      "스트립이 카드와 같은 소스를 쓰는지(공유 헬퍼) · 전체 카드는 Side Panel 탭에 남아있는지",
      "172px에서 스트립 아래로 로그가 초기 뷰에 보이는지",
      "단위 테스트 추가",
    ],
    specPolicy: "allow",
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
          instruction: { type: "string", description: "근본 원인 + 구체적 수정 지시" },
          files: { type: "array", items: { type: "string" } },
        },
      },
    },
    specChanges: {
      type: "array",
      description: "의도된 v2.0 디자인 변경이라 E2E 스펙 갱신이 필요한 항목 (약화 아님)",
      items: {
        type: "object",
        required: ["spec", "reason", "proposedChange"],
        properties: {
          spec: { type: "string", description: "스펙 파일 + 테스트명" },
          reason: { type: "string", description: "왜 회귀가 아니라 의도된 v2.0 변경인지" },
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
      description: "v2.0 전 항목의 처리 상태",
      items: {
        type: "object",
        required: ["id", "status", "note"],
        properties: {
          id: { type: "string", description: "예: v2.0-layout, S26, W4, W5, S5, S7, req1, V2, V3, V4" },
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
    bundleOverLimit: { type: "boolean", description: `${BUNDLE_LIMIT} KiB 한도 초과 여부` },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 프롬프트 빌더
// ─────────────────────────────────────────────────────────────────────────────
function refBlock(m) {
  return `[디자인 레퍼런스 — 반드시 직접 읽을 것]
- ${m.design.join("\n- ")}
- src/theme.ts — 런타임 토큰 단일 출처 (**상위집합** — 덮어쓰지 마라. v2.0은 S26 7키만 additive 병합)
- temp/design-request-v2.0-fix.md — v2.0 수정 요청서 원문 (W1~W6의 배경/선택지)
- temp/impl-plan-v2.0.md — 이 반영 작업의 계획서 (페이즈·변경 지점 file:line·E2E 개편 범위)
${m.screens.length ? `- 스크린샷: ${m.screens.join(", ")}` : ""}
.dc.html은 사내 디자인 툴 포맷이다. 프레임워크는 무시하고 인라인 스타일의 정확한 hex·px·폰트·radius 값과 \`<script type="text/x-dc">\`의 로직만 읽어라 (그 hex를 코드에 직접 쓰지 말고 대응하는 tokens.* 를 참조).

[이 마일스톤이 반영하는 항목] ${m.items.join(" · ")}
design/CHANGELOG.md의 §v2.0(+ 참조된 §v1.6 등)이 각 결정의 "왜"를 담고 있다 — **결정의 정본은 CHANGELOG다.** dc와 코드가 어긋나 보이면 CHANGELOG를 먼저 읽어라.
${KNOWN_FACTS}`
}

function depsBlock(m, quarantined) {
  const broken = (m.dependsOn || []).filter((d) => quarantined.includes(d))
  if (broken.length === 0) return ""
  return `

[⚠ 선행 마일스톤 실패] ${broken.join(", ")} 가 게이트를 통과하지 못해 **격리(stash)되어 브랜치에서 빠졌다**. 그 결과물은 현재 코드에 **없다**.
- 그 선행 결과에 의존하는 유닛은 **계획에서 제외**하고, 의존하지 않는 나머지만 진행하라 (워크플로우를 멈추지 말 것).
- 이 마일스톤이 사실상 진행 불가라면 유닛을 "확인만" 수준으로 축소하고 followups(audience:'user')에 "${broken.join(",")} 복구 후 재실행 필요"를 기록하라.`
}

function parallelBlock(m) {
  return m.parallelUnits
    ? `

[⚠ 이 마일스톤의 유닛은 **병렬 실행**된다]
- **유닛 간 파일이 절대 겹치면 안 된다** — 겹치면 서로의 편집을 덮어쓴다.
- **유닛 간 결과 의존이 없어야 한다.** 겹치거나 의존하면 하나의 유닛으로 합쳐라.`
    : ""
}

function specPolicyBlock(m) {
  return m.specPolicy === "forbid"
    ? `

[🔒 이 마일스톤은 E2E 스펙 수정 금지]
이 변경은 E2E에 영향이 없어야 정상이다(예: M0 토큰 additive / M2 노드메뉴 이전은 E2E가 window.__sp.addNode로 노드를 만들므로 무영향). E2E가 깨지면 그건 **회귀**다 — tests/e2e/**를 고치지 말고 **코드를 고쳐서** 통과시켜라. 불가하면 followups(audience:'user')에 기록.`
    : ""
}

function plannerPrompt(m, quarantined) {
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[배경] design/ 핸드오프는 v1(PR #68) → v1.1(#69) → v1.2(#70) → v1.3/v1.4(#71)까지 반영·머지됐다. 이후 v1.5·v1.6·v1.7·v1.8을 거쳐 **v2.0 번들(\`4b430a7\` + fix \`d11c83a\`)이 최종 확정 정본(W1)**이다. v2.0의 핵심은 **breaking 기본 레이아웃 재설계**(좌 Code / 중앙 Node Editor 대형 / 우 Viewport+Inspector) + **S26 신규 토큰 7키(표기 '6종')** + **노드추가 플로팅 pill** + **Code 자동접기 토글** + v1.6 잔여(S5 이종탭 active 렌더 · S7 진단 스트립)다.
사용자 결정: E2E 강화 재작성 승인 · autoCode 기본 ON + 테스트 훅 · S5/S7 포함.

[마일스톤 ${m.id}] ${m.goal}

${refBlock(m)}${depsBlock(m, quarantined)}${parallelBlock(m)}${specPolicyBlock(m)}

[현재 코드 진입점 힌트]
- ${m.hints.join("\n- ")}
- Architecture.md — 모듈 경계 / SPEC.md — 기능 명세 / CLAUDE.md — 품질 게이트 규약

[할 일]
디자인 레퍼런스와 현재 코드를 직접 읽고, 이 마일스톤을 2~6개의 작업 유닛으로 분해하라. 각 유닛은:
- 하위 모델(sonnet)이 이 지시만 보고 구현할 수 있을 만큼 구체적으로: 어떤 파일을 어떻게(file:line), 어떤 디자인 값(.dc.html/CHANGELOG 어느 부분)을 참조하는지, 기존 코드의 어떤 패턴을 따르는지.
- ${m.parallelUnits ? "**서로 파일이 겹치지 않게** 분해 (병렬 실행됨)" : "유닛 간 의존 순서대로 정렬 (앞 유닛의 결과 위에 뒤 유닛이 얹힘)"}.
- knip 제약: 새 export는 같은 유닛에서 호출자 연결.
- tests: 커버리지 임계 유지를 위해 추가할 단위 테스트를 명시. ${m.specPolicy === "allow" ? "이 마일스톤은 E2E 스펙 재작성/훅 추가가 예정돼 있으니 어느 스펙을 어떻게 강화할지도 유닛에 담아라." : ""}
- acceptance: 검증자가 확인할 구체 기준.
기존 기능(상태 로직, 상호작용, 단축키)은 보존이 원칙이다. 파괴적 재작성이 필요하면 notes에 사유를 기록하라.
디자인이 확정하지 않은 지점이 보이면 **계획 단계에서 잠정 결정을 내려 유닛에 박아 넣고** followups에 기록하라. 계획을 미루지 마라.
${CONSTRAINTS}`
}

function implPrompt(m, unit, answersBlock, priorSummary) {
  const prior = priorSummary
    ? `\n[이전 시도의 부분 진행 상태 — 작업 트리에 이미 반영됨]\n${priorSummary}\n이어서 진행하라 (처음부터 다시 하지 말 것).`
    : ""
  const ans = answersBlock ? `\n[아키텍트(상위 모델)의 답변 — 이 결정을 따르라]\n${answersBlock}` : ""
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

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
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
하위 구현 에이전트가 [마일스톤 ${m.id} / 유닛 ${unit.id}: ${unit.title}] 작업 중 다음 질문에 막혔다. **당신이 최종 결정권자다** — 사용자에게 넘길 수 없다.

[유닛 지시]
${unit.instructions}

[구현 에이전트의 진행 상태]
${priorSummary || "(없음)"}

[질문]
${qs}

${refBlock(m)}

저장소 코드와 디자인 문서(design/CHANGELOG.md §v2.0, design/README.md, design/App Shell.dc.html, temp/design-request-v2.0-fix.md, temp/impl-plan-v2.0.md, Architecture.md)를 직접 확인하고, 각 질문에 **단정적으로** 답하라 — 구체적 파일/값/패턴을 지정하고 선택지 중 하나를 결정해줄 것.

[결정 원칙]
- "사용자에게 물어보라" / "디자이너 확인 필요" 같은 답은 **금지**다. 반드시 지금 실행 가능한 결정을 내려라.
- v2.0은 확정 정본이다(W1). 답이 없어 보이면 CHANGELOG §v2.0 + impl-plan을 다시 읽어라. 정본에 없는 값이면 (1) 의미가 가장 가까운 기존 토큰/패턴 근사 → (2) 현행 유지 + 사유 주석 → (3) 최소 변경. **theme.ts에 (S26 7키 외) 값을 지어내 넣지 마라.**
- 잠정 결정한 항목은 followups에 기록(audience: designer=시안/토큰, user=스코프/정책).
${AUTONOMY}`
}

function verifierPrompt(m, plan, round) {
  const acceptance = plan.units.map((u) => `- [${u.id}] ${u.acceptance.join(" / ")}`).join("\n")
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 검증자다. 저장소: ${ROOT} (브랜치 ${BRANCH}). 검증 라운드 ${round}.

[마일스톤 ${m.id}] ${m.goal}

[검증 대상] 아직 커밋되지 않은 작업 트리 변경. git status / git diff 로 이번 마일스톤의 변경을 파악하라.

${refBlock(m)}

[수용 기준 (플래너가 정의)]
${acceptance}

[마일스톤 특화 체크]
- ${m.checks.join("\n- ")}

[공통 체크]
- 새/수정 파일에 raw hex 직접 사용이 없는지 (tokens.* / var(--*) 참조만). grep -rn 으로 확인. 예외: src/theme.ts, ErrorBoundary 크래시 폴백, src/export/standalonePlayer.js.
- **src/theme.ts 토큰 규칙**: ${m.id === "M0" ? "S26 7키(디자이너 표기 '6종' — 키 수 7이 정상, 목록 대조로 판정)가 정확히 additive로 추가됐고, **기존 토큰 값은 하나도 안 바뀌었는지**." : "이 마일스톤이 theme.ts를 건드렸다면 M0 범위(S26 7키) 외 새 토큰을 추가하지 않았는지."} 구현 파생 항목 — tokens 내부 키(nodeCardSolid·emptyStateIcon·cardLg·modal·thumbnailInset·onCanvasText·overlayBar·shadow.modal)와 named export(withAlpha·cssVars) — 가 소실되지 않았는지 — v1.1에 덮어쓰기 사고가 실제로 있었다.
- 기존 기능(상태 로직·상호작용·단축키)이 깨지지 않았는지.
- 게이트 설정 파일이 무단으로 약화되지 않았는지. scripts/check-bundle-size.mjs가 수정되지 않았는지.
- tests/e2e/** 변경이 있다면 ${m.specPolicy === "forbid" ? "**이 마일스톤은 스펙 수정 금지다 — 변경이 있으면 blocker**" : "**강화 방향인지**(expect 삭제·skip·fixme가 아닌지) git diff로 확인 — 약화면 blocker. m1/m4/m5 재작성과 code-editor autoCode-off 훅 setup은 허용."}.

[시각 대조 — 가능하면 수행]
- npm run dev 를 백그라운드로 띄우고(이미 떠 있으면 재사용), 스크래치 디렉터리에 일회용 Playwright 스크립트로 해당 화면 스크린샷을 찍어 ${m.screens.length ? m.screens.join(", ") : "(해당 없음)"} 와 비교하라. WebGL은 playwright.config.ts의 SwiftShader 플래그 참고.
- **레이아웃/도킹 마일스톤(M1)은 실제 상호작용을 구동하라** — 드래그/드롭/좌측 레일 접기/자동접기는 정적 스크린샷으로 검증 불가. pointer 이벤트를 디스패치해 결과 레이아웃을 확인하라.
- 브라우저 실행 불가면 visualNotes에 남기고 코드 대조만으로 판단.

[판정]
- .dc.html/CHANGELOG 값·로직과의 불일치, 수용 기준 미충족, 규칙 위반을 issues로 반환. severity: blocker(기능 파손/규칙 위반) / major(디자인 불일치) / minor(다듬기).
- blocker/major 없으면 pass:true. minor만 있으면 pass 가능(issues엔 남겨라).
- 구현이 내린 **잠정 결정**은 근거 주석 + followups 기록이 있으면 통과시키고, 기록이 빠졌으면 당신이 followups에 채워 넣어라.
${AUTONOMY}`
}

function designFixPrompt(m, issues) {
  const list = issues
    .map(
      (i, n) =>
        `${n + 1}. [${i.severity}] ${i.description}\n   파일: ${i.files.join(", ")}${i.fixHint ? `\n   힌트: ${i.fixHint}` : ""}`,
    )
    .join("\n")
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
검증자가 [마일스톤 ${m.id}]에서 다음 문제를 발견했다. 전부 수정하라.

${list}

${refBlock(m)}${specPolicyBlock(m)}

수정 방법에 판단이 필요하면 status:'blocked' + questions로 반환하라 (fable 아키텍트가 답한다). 사용자를 기다리지 마라.
${CONSTRAINTS}`
}

function gatePrompt(_m) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 품질 게이트를 실행하고 결과만 보고하라. 아무것도 수정하지 마라.

1) npm run check — Bash timeout 600000ms로 실행. (내부: typecheck → lint → deadcode → circular → unit test, 실패 시 즉시 중단)
2) 1)이 성공했을 때만: npm run test:e2e — timeout 600000ms. 전체 스펙(약 126건, 6~10분). 시간 초과가 우려되면 npx playwright test tests/e2e/<파일> 로 나눠 돌리되 **임의 생략 금지**. dev 서버는 자동으로 뜬다.
   ⚠ 유닛 테스트는 jsdom stderr 노이즈(HTMLMediaElement not implemented 등)를 대량 출력한다 — 그건 실패가 아니다. **종료 코드와 요약 라인**으로 판정하라.
3) 번들 사이즈 가드(npm run size:check)는 이 워크플로우의 게이트가 아니다 — 실행하지 마라.

각 실패를 gate(typecheck|lint|deadcode|circular|unit|e2e) 별로 분류하고, detail에 핵심 에러 메시지/실패 스펙명·라인을 담아라. 통과했으면 failures는 빈 배열.`
}

function triagePrompt(m, failures) {
  const specNote =
    m.specPolicy === "forbid"
      ? `\n🔒 **이 마일스톤은 specPolicy:forbid다** — E2E 영향이 없어야 정상이다. E2E 실패는 전부 **회귀(fixes)**로 분류하라. specChanges는 **빈 배열**이어야 한다.`
      : `\n※ 이 마일스톤은 **UI 구조를 의도적으로 바꾼다**(M1=기본 레이아웃/접기 축/splitter 재배치, M3=Code 자동접기, M4=진단 스트립). 기존 스펙이 옛 UI/기하를 단언하고 있다면 정당한 specChange다. **proposedChange는 새 v2.0 값을 단언하는 강화 방향만** — expect 삭제·skip·fixme 금지. code-editor 스펙엔 autoCode-off 테스트 훅 setup 추가가 정당하다(단언 불변). 확신이 없으면 회귀(fixes) 쪽으로.`

  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
[마일스톤 ${m.id}] 작업 후 품질 게이트가 실패했다. 실패 목록:

${JSON.stringify(failures, null, 2)}

저장소를 직접 조사해 각 실패의 근본 원인을 파악하고 분류하라. **당신이 결정권자다 — 사용자를 기다리지 말고 반드시 실행 가능한 지시를 내려라.**
- fixes: 코드 결함/회귀 — 하위 모델이 그대로 실행할 수 있는 구체적 수정 지시 (근본 원인 포함, 증상 덮기 금지).
- specChanges: 이번 v2.0 변경이 의도한 UI 변화 때문에 기존 E2E expectation이 더 이상 유효하지 않은 경우만. proposedChange는 **새 v2.0 값을 단언하는 강화 방향**이어야 하며, expect 삭제·test.skip·fixme 같은 약화는 절대 제안하지 마라. reason에 design/CHANGELOG.md §v2.0의 어느 결정 때문인지 명시하라.${specNote}
  ※ 적용된 스펙 변경은 전부 사용자에게 사후 보고되므로, 각 건을 followups(audience:'user')에도 남겨라.
${AUTONOMY}`
}

function gateFixPrompt(m, triage, allowSpec) {
  const fixes = triage.fixes
    .map((f, n) => `${n + 1}. ${f.instruction}\n   파일: ${f.files.join(", ")}`)
    .join("\n")
  const specs =
    allowSpec && triage.specChanges.length
      ? `\n[승인된 E2E 스펙 갱신 — 새 v2.0 값을 단언하는 강화 방향으로만]\n${triage.specChanges.map((s, n) => `${n + 1}. ${s.spec}: ${s.proposedChange}\n   근거: ${s.reason}`).join("\n")}`
      : ""
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
품질 게이트 실패에 대한 아키텍트의 수정 지시다. 전부 적용하라.

[수정 지시]
${fixes}${specs}

적용 후 관련 게이트만 표적 재실행해 확인하라 (예: npx tsc --noEmit, npx vitest run <파일>, npx playwright test <스펙>). 전체 게이트는 별도 단계에서 재실행된다.
지시가 잘못됐다고 판단되면 임의 변경하지 말고 status:'blocked' + questions로 반환하라.
${CONSTRAINTS}`
}

function commitPrompt(m, unitSummaries) {
  const title = m.phase.replace(/^M\d+ /, "")
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 마일스톤 변경을 커밋하라.
1) git add -A
2) git commit — 제목: "design(${m.id}): ${title} — 핸드오프 ${HANDOFF}". 본문: 아래 변경 요약을 bullet 몇 개로 정리하고, 반영한 항목(${m.items.join(", ")})을 명시한 뒤, 마지막 줄에 정확히 다음을 넣어라:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

[변경 요약]
${unitSummaries}

--no-verify 등 hook 우회 플래그 금지. 커밋 후 sha를 반환하라.
※ ${FOLLOWUP_DOC} 는 워크플로우가 별도로 관리하니 이 커밋에 함께 들어가도 무방하다.`
}

function quarantinePrompt(m, reason) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH}). [마일스톤 ${m.id}]이 품질 게이트를 초록으로 만들지 못했다: ${reason}

워크플로우는 멈추지 않고 다음 마일스톤으로 진행한다. 이 마일스톤의 작업을 **버리지 말고 격리**해서 브랜치를 마지막 초록 커밋 상태로 되돌려라.

1) git stash push -u -m "wf-quarantine-${m.id}" — 추적/미추적 파일 모두 보존한다.
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
- 제목: "# 디자인 핸드오프 v2.0 — 보류 항목 (자율 실행 산출물)". 첫 줄에 "이 문서는 워크플로우가 작업을 멈추지 않기 위해 **잠정 결정**으로 진행한 항목들의 목록이다. 각 항목은 이미 코드에 반영돼 있으며, 정식 결정이 나오면 표시된 위치를 고치면 된다."는 취지를 적어라.
- 섹션 구성:
  1. **사용자 판단 필요** (audience: user) — 스코프·정책·게이트. 각 항목: 무엇이 / 왜 / **잠정 처리** / 정식 결정 시 바꿀 위치(파일).
  2. **디자인 문서 갱신 필요** (audience: designer) — 다음 핸드오프 요청 후보. temp/design-request-v2.0-fix.md와 같은 형식(🎨 시안 / 🎯 토큰 / ✅ 확답)으로 분류해 그대로 디자이너에게 보낼 수 있게 하라.
  3. **적용된 E2E 스펙 변경** — 사후 검토용. 파일·테스트명·근거(v2.0의 어느 결정)·변경 방향(강화인지 · code-editor autoCode-off 훅 setup인지) 명시. 없으면 "없음".
  4. **격리된 마일스톤** — stash로 빠진 마일스톤 + stash 이름 + 복구 방법(git stash apply) + 실패 요약. 없으면 "없음".
  5. **번들 사이즈** — ${BUNDLE_LIMIT} KiB 한도 대비 현황. 초과했다면 "한도 상향은 사용자 승인 사항"임을 명시. 미측정이면 "미측정".
- 중복 항목은 병합하고, 같은 주제는 묶어라. 항목이 없는 섹션은 "없음"으로 남겨라(섹션 자체는 유지).
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
              ? `${m.id}은 specPolicy:forbid(E2E 영향 없어야 정상)라 적용하지 않았다. 코드 쪽 해결을 시도했다. **스펙 갱신이 정말 필요하다면 그건 이 변경이 E2E-invisible이 아니라는 신호다.**`
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
log(`브랜치 ${BRANCH} 준비 + v2.0 번들 확인 + 베이스라인 게이트`)
const setup = await agent(
  `저장소 ${ROOT} 준비 단계. 순서대로:
1) git status --porcelain 확인 — 작업 트리가 더러우면 ok:false, reason에 상태 요약을 담아 반환하고 종료. 아무것도 수정/스태시하지 마라.
2) **핸드오프 v2.0이 실제로 들어와 있는지** 확인 — 아래가 모두 참이어야 한다. 하나라도 아니면 ok:false + reason:
   - design/CHANGELOG.md 에 "## v2.0" 섹션이 있다.
   - design/README.md 첫 줄 버전이 "v2.0" 이다.
   - design/Docking Prototype.dc.html 이 **존재하지 않는다**(v2.0에서 삭제, App Shell이 SSoT). 있으면 v2.0 번들이 아니다.
   - design/theme.ts 가 accent.bright / semantic.successBright / gradient.shaderSphere 를 정의한다 (S26 반영 확인).
   - src/theme.ts 가 withAlpha / cssVars / tokens 를 export 한다 (구현 파생 export 생존).
3) 깨끗하면 브랜치 ${BRANCH}로 전환 (없으면 현재 HEAD에서 생성: git switch -c ${BRANCH}, 있으면 git switch ${BRANCH}).
4) node_modules가 없으면 npm ci.
5) 베이스라인 확인: npm run check 를 timeout 600000ms로 실행. **완전히 초록이어야 한다**. 실패하면 ok:false + reason에 실패 게이트 요약 — 수정하지 마라. 빨간 베이스라인에선 시작하지 않는다.
   ※ 유닛 테스트의 jsdom stderr 노이즈는 실패가 아니다. 종료 코드로 판정하라.
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
  log(`── ${m.id} 시작 (항목: ${m.items.join(", ")}${m.parallelUnits ? " / 유닛 병렬" : ""}${m.specPolicy === "forbid" ? " / 스펙 수정 금지" : ""})`)

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
    report.push({ milestone: m.id, status: "planner-failed", items: m.items })
    quarantined.push(m.id)
    continue
  }
  collect(plan, `plan:${m.id}`)
  log(`  ${m.id} 계획: ${plan.units.length}개 유닛 — ${plan.units.map((u) => u.title).join(" / ")}`)

  // 유닛 실행 — parallelUnits면 동시 실행(파일 disjoint 전제), 아니면 순차
  let unitResults
  if (m.parallelUnits) {
    const settled = await parallel(plan.units.map((u) => () => runUnit(m, u)))
    unitResults = settled.map((r, i) => (r ? r : { unit: plan.units[i].id, status: "agent-lost" }))
  } else {
    unitResults = []
    for (const unit of plan.units) {
      unitResults.push(await runUnit(m, unit))
    }
  }
  for (const r of unitResults)
    log(`  ${m.id}/${r.unit}: ${r.status}${r.escalated ? " (fable 인계)" : ""}`)

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
      title: `${m.id} 게이트 실패 — 격리됨 (${m.items.join(", ")} 미해소)`,
      context: `실패: ${reason}`,
      interimDecision: DO_COMMIT
        ? `작업을 git stash("wf-quarantine-${m.id}")로 보존하고 브랜치를 마지막 초록 커밋으로 되돌린 뒤 계속 진행했다. 복구: git stash apply <ref>.`
        : "commit:false 모드라 격리하지 않았다 — 작업 트리에 빨간 변경이 남아 있을 수 있다.",
      source: `gate:${m.id}`,
    })
  }

  report.push({
    milestone: m.id,
    items: m.items,
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
  `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 v2.0 반영 작업의 마무리 점검을 하라. **읽기 전용 — 코드를 수정하지 마라.**

[실행된 마일스톤] ${ranIds || "(없음)"}
[격리된 마일스톤] ${quarantined.length ? quarantined.join(", ") : "(없음)"}

1) **항목 커버리지 대조**: v2.0의 다음 항목을 현재 코드/커밋 기준으로 판정하라 — **v2.0-layout**(기본 트리 재설계) · **S26**(신규 토큰 7키) · **S5**(leafPanelKind→active) · **req1**(위치 기반 chevron) · **V2**(Code 좌측 34px 레일 접기 — CHANGELOG의 "스테일 codeH 제거"는 dc 내부 로직 정리라 디자이너가 이미 완료, src엔 codeH 식별자가 없으니 찾지 마라) · **V3**(노드 그래프 중앙 대형화 — v2.0-layout과 동일 항목, 기본 트리로 함께 판정) · **V4**(마이그레이션 version 1→2 조용한 폴백) · **W4**(노드추가 플로팅 pill + ⌘K 유지) · **W5/req3**(Code 자동접기 + autoCode 토글 + 테스트 훅) · **S7**(진단 메트릭 스트립).
   - done: 실제로 코드가 바뀌어 해소됨 (근거 파일/커밋)
   - verified-no-change: 확인 결과 코드 변경 불필요
   - deferred: 격리된 마일스톤의 항목 / 범위 밖
   - not-covered: 다뤄졌어야 하는데 누락 ← 있으면 note에 분명히
   정본은 design/CHANGELOG.md §v2.0. git log --oneline 으로 브랜치 커밋 확인하고 필요하면 파일을 직접 읽어 판정하라. **추측 금지.**

2) **핵심 불변식 확인**:
   - src/state/dockTree.ts 의 기본 트리가 v2.0 형태(좌 code 0.25 · 중 nodeEditor · 우 col[viewport/inspector·assets])인지. 아니면 note에 blocker로.
   - 스냅샷 version이 2로 올랐고 옛 저장 레이아웃이 조용히 폴백되는지.
   - src/theme.ts 에 S26 7키가 있고 기존 토큰 값이 안 바뀌었는지 · 구현 파생 항목(tokens 내부 키 nodeCardSolid 등 + withAlpha·cssVars export)이 살아있는지.
   - tests/e2e 변경이 강화 방향(약화·skip·fixme 0)인지 git diff로.

3) **잔여 raw hex 스캔**:
   grep -rnE '#[0-9a-fA-F]{3,8}\\b' src --include='*.ts' --include='*.tsx' --include='*.css'
   실행 후 src/theme.ts 와 *.test.* 는 제외하고 집계. "정당한 잔여물"(주석 속 참조값, ErrorBoundary 폴백, standalonePlayer.js 폴백)과 "미처리 잔여물"을 구분해 요약하라.

4) **번들 사이즈 참고 측정** (게이트 아님):
   npm run build && npm run size:check 를 timeout 600000ms로 실행하고 js 번들 KiB를 bundleKiB에, ${BUNDLE_LIMIT} KiB 초과 여부를 bundleOverLimit에 담아라. 초과해도 scripts/check-bundle-size.mjs를 **수정하지 마라**.`,
  { label: "coverage-scan", model: IMPL_MODEL, effort: "low", schema: COVERAGE_SCHEMA },
)

return {
  branch: BRANCH,
  handoff: "v2.0 (4b430a7 + fix d11c83a) — breaking 레이아웃 + S26 토큰 + 노드메뉴/자동접기 + S5/S7",
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
    ? { kiB: coverage.bundleKiB, overLimit: coverage.bundleOverLimit, limit: BUNDLE_LIMIT }
    : { kiB: -1, overLimit: null, limit: BUNDLE_LIMIT },
  note: `자율 완주 모드 — 사용자 확인 없이 끝까지 진행했다. 판단이 필요한 항목은 ${FOLLOWUP_DOC} 에 정리돼 있다. E2E 강화 재작성(m4/m5/m1)과 autoCode-off 테스트 훅은 사용자 사전 승인 사항이다. 번들(CI 한도 ${BUNDLE_LIMIT} KiB)은 게이트가 아니며 순수 구조 변경이라 순증이 작을 것으로 예상된다 — 초과 시 한도 상향은 사용자 승인 사항.`,
}
