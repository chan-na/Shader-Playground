export const meta = {
  name: "design-refactor",
  description:
    "design/ 핸드오프 v1.1 기반 후속 디자인 리팩터링 (temp/todo.md 잔여 작업) — fable 설계·검증, sonnet 구현, 자율 완주 + 보류 항목 문서화",
  whenToUse:
    "design 핸드오프 v1.1(32d24ae)의 디자이너 결정(D1~D21)을 temp/todo.md의 잔여 작업에 반영할 때. 사용자에게 묻지 않고 끝까지 진행하며, 판단이 필요한 항목은 temp/design-followup-v1.1.md에 모은다. args: { only?: ['V0'...], branch?, allowSpecUpdates?: bool, commit?: bool }",
  phases: [
    { title: "Setup", detail: "작업 트리 · 브랜치 · v1.1 핸드오프 확인 · 베이스라인 게이트" },
    { title: "V0 Foundations", detail: "overlay/gradient 토큰 소비 · radius 리터럴 · stale 주석" },
    { title: "V1 Node Name", detail: "GraphNode name 필드 · 인라인 rename · Inspector Name" },
    { title: "V2 Node Editor", detail: "포트 rail · Webcam/Video 카드 · Audio 파형" },
    { title: "V3 Viewport", detail: "컴팩트 트랜스포트 · 빈 상태 그라디언트 · pane 라벨" },
    { title: "V4 Side Panel", detail: "Diagnostics 탭 · Inspector 타입 배지" },
    { title: "V5 Shell·Editor·Palette", detail: "metaAlign · (+N more) · 빈 결과 CTA · 팔레트/Welcome 버그" },
    { title: "V6 Export & Share", detail: "파일명 규칙 · 완료 액션 1행 · standalone 토큰" },
    { title: "V7 System States", detail: "크래시 폴백 · 스켈레톤 인디케이터" },
    { title: "Report", detail: "보류 항목 문서 · todo 커버리지 · 잔여 hex · 번들 사이즈(참고)" },
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

// 사용자 판단 / 디자인 문서 갱신이 필요한 항목을 모으는 문서 (작업은 멈추지 않는다)
const FOLLOWUP_DOC = "temp/design-followup-v1.1.md"

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
const BRANCH = A.branch || "design/handoff-v1.1"
const ONLY = Array.isArray(A.only) ? A.only : null
// 자율 완주 원칙: E2E 스펙 갱신은 사전 승인(기본 true). 단 "강화 방향만" 허용하고
// 적용된 건은 전부 FOLLOWUP_DOC에 기록해 사용자가 사후 검토한다.
const ALLOW_SPEC_UPDATES = A.allowSpecUpdates !== false
const DO_COMMIT = A.commit !== false

// ─────────────────────────────────────────────────────────────────────────────
// 공통 제약 (CLAUDE.md 요약 — 모든 구현/수정 프롬프트에 삽입)
// ─────────────────────────────────────────────────────────────────────────────
const AUTONOMY = `
[자율 완주 원칙 — 중요]
- 이 워크플로우는 **사용자에게 묻지 않고 끝까지 진행**한다. 사람의 답을 기다리며 멈추는 선택지는 없다.
- status:'blocked'는 **상위 모델(fable 아키텍트)에게 에스컬레이션하는 내부 신호**다 — 사용자에게 묻는 게 아니다. 갈림길에서 판단이 서지 않으면 blocked + questions로 반환하면 fable이 결정을 내려준다.
- 사용자 판단이나 디자이너 결정이 "진짜로" 필요한 항목(시안에 없는 화면, 확정되지 않은 값, 스코프 결정)이라도 **작업을 멈추지 마라**. 대신:
  1) 되돌리기 쉬운 **잠정 결정**을 내려 진행한다 (우선순위: 기존 토큰/패턴으로 근사 → 현행 유지 + 사유 주석 → 최소 변경).
  2) 그 항목을 followups에 기록한다 (audience: 'user' 또는 'designer', 무엇을 왜 잠정 결정했는지 + 정식 결정 시 어디를 바꾸면 되는지).
- followups는 ${FOLLOWUP_DOC} 로 취합되어 사용자가 나중에 한 번에 검토한다. 기록하면 그 항목은 "처리된 것"이다 — 다시 막히지 마라.`

const CONSTRAINTS = `
[품질 제약 — CLAUDE.md, 위반 금지]
- TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes. any / as-unknown-as 캐스팅으로 우회 금지.
- Biome warn 0건 유지. **새 biome-ignore 추가 금지** — 리팩터로 해소하라. 도저히 불가하면 그 코드를 다른 방식으로 재작성하고, 그래도 안 되면 followups(audience:'user')에 기록한 뒤 해당 부분을 현행 유지하라.
- Knip 0건: 새 export는 같은 변경 안에서 실제 호출자/임포터를 함께 연결. 고아 export 금지.
- 순환 의존성 0건: store끼리 직접 상호 import 금지, 공통 의존은 별도 모듈로.
- 커버리지 임계(lines 50 / functions 47 / branches 42 / statements 50) 하락 금지 — 신규 로직에 *.test.ts(x) 동반.
- 게이트 설정 파일(tsconfig/biome.json/knip.json/vitest.config.ts/scripts/check-bundle-size.mjs) **완화 금지**. vitest coverage.exclude에 신규 파일 추가 금지.
- ${
  ALLOW_SPEC_UPDATES
    ? "tests/e2e/** 스펙 수정은 사용자가 사전 승인함 — 단 **강화 방향만** 허용된다: 새 디자인 값/경로를 단언하도록 갱신하는 것만 되고, expect 삭제·완화·test.skip·test.fixme는 절대 금지. 수정했다면 파일·테스트명·사유를 summary와 followups(audience:'user')에 반드시 남겨라 (사용자가 사후 검토한다)."
    : "tests/e2e/** 수정 금지 — 스펙 갱신이 필요해 보이면 코드 쪽에서 해결하고, 불가하면 followups(audience:'user')에 기록한 뒤 진행하라."
}

[토큰 규칙 — v1.1]
- 색·radius·shadow·모션 값은 src/theme.ts의 tokens.* 또는 파생된 var(--*)만 사용. 컴포넌트에 raw hex 직접 쓰기 금지.
- src/theme.ts는 이미 핸드오프 v1.1로 병합되어 있다(신규: surface.letterbox · overlay.gridDot · overlay.scrim · gradient.emptyState). **theme.ts에 새 토큰을 추가하지 마라** — 값의 출처는 디자이너다.
  토큰이 부족하면: (1) 의미가 가장 가까운 기존 토큰으로 근사하고 근거를 주석으로 남긴다 → (2) 그것도 어색하면 현행 값을 유지하고 사유 주석을 남긴다. 어느 쪽이든 followups(audience:'designer')에 "어떤 값이 왜 필요한지 + 잠정 처리"를 기록하라. 값을 지어내 theme.ts에 넣지 마라.
- white/black 채널을 withAlpha()로 직접 파생하던 코드는 tokens.overlay.* 를 참조해야 한다 (D9). 그 외 정당한 알파 파생(액센트/카테고리 hex + withAlpha)은 계속 허용.
- canvas 2D API는 CSS 변수를 읽지 못한다 → 그 경우에만 tokens.* 를 직접 import (D7 Audio 파형).
- 예외: ErrorBoundary 크래시 폴백은 **의도적으로 토큰/웹폰트 비의존**(system-ui + 중립 그레이). README §도메인 규칙 [D6]. 이 파일에서 토큰화를 강행하지 마라.

[번들]
- 번들 사이즈 가드(385 KiB)는 CI 잡으로 별도 존재하며 이 워크플로우의 게이트가 아니다. 여유가 ~5 KiB뿐이니 불필요한 신규 의존성·무거운 라이브러리 도입 금지.

[진행]
- 커밋하지 마라 — 커밋은 워크플로우가 별도 단계에서 수행한다.
- 마무리 전 자가 검증: npx tsc --noEmit, 그리고 수정 파일에 npx biome check --write 를 돌려 통과시켜라.
${AUTONOMY}`

// ─────────────────────────────────────────────────────────────────────────────
// 마일스톤 정의 (의존도 순서)
//   todo      = temp/todo.md 항목 ID (이 워크플로우가 해소해야 할 대상)
//   dec       = design/CHANGELOG.md v1.1 의 디자이너 결정 ID (D1~D21)
//   dependsOn = 선행 마일스톤 (실패해 격리되면 플래너에게 알리고 의존 유닛만 제외한다)
// ─────────────────────────────────────────────────────────────────────────────
const MILESTONES = [
  {
    id: "V0",
    phase: "V0 Foundations",
    todo: ["C4", "C5", "D2(주석)", "E5(확인)", "E7(확인)"],
    dec: ["D9", "D11", "D12"],
    dependsOn: [],
    design: [
      "design/README.md (§Design Tokens — overlay.* / gradient.* 항목)",
      "design/CHANGELOG.md (v1.1 — Changed)",
      "design/Foundations.dc.html",
    ],
    screens: ["design/screens/10-foundations.png"],
    hints: [
      "src/theme.ts (v1.1 병합 완료 — 신규 토큰 확인용, 수정 대상 아님)",
      "src/ui/NodeEditor/index.tsx (도트 그리드 withAlpha('#ffffff', 0.045))",
      "src/ui/NodeEditor/nodes/GpuTimerChip.tsx (스크림 withAlpha('#000000', 0.5))",
      "src/ui/Panels/StatusPill.tsx · src/ui/Panels/GroupInspector.tsx (borderRadius: 7 리터럴)",
      "src/ui/controls/colorConvert.ts · src/ui/Panels/AssetBrowser.tsx (stale 주석)",
    ],
    goal: `v1.1 신규 토큰을 실제로 소비하도록 배선하고, 어느 마일스톤도 커버하지 않은 잔여 리터럴을 정리한다 (이후 마일스톤의 토대).
- [D9 / todo C4] overlay 토큰 소비: 코드가 white/black 채널을 직접 파생하던 두 지점 — 노드 캔버스 도트 그리드(withAlpha("#ffffff", 0.045))와 스크림(withAlpha("#000000", 0.5), GpuTimerChip·몰입 모드·모달 백드롭)을 tokens.overlay.gridDot / tokens.overlay.scrim 참조로 치환한다. 스크림은 여러 곳에서 재사용되므로 전수 grep으로 찾아라.
- CSS 파일에서 참조가 필요하면 cssVars()에 --overlay-* 방출을 추가한다. 단 **소비처와 같은 유닛에서** 추가할 것 (방출만 하고 쓰는 곳이 없으면 안 됨). gradient.emptyState 배선은 V3에서 하므로 여기서 손대지 마라.
- [todo C5] src/ui/Panels/StatusPill.tsx, src/ui/Panels/GroupInspector.tsx의 borderRadius: 7 리터럴 2건을 tokens.radius.button(=7) / var(--radius-button) 참조로 교체.
- [D11 / todo E7 — 확인만] 디자이너가 dc를 토큰 값으로 정정했다 (브레드크럼 아이콘 radius 4→5 = radius.iconBox, 다중선택 칩 radius 8→7 = radius.button, 브레드크럼 노드명 색 #c4dcff → text.primary). 현재 코드가 이미 이 값이므로 **코드 변경 없음이 정상**이다. 정합 여부를 확인하고 어긋나면 정정하라.
- [D12 / todo E5 — 확인만] warnRing = 0.7 알파(errorRing 패밀리 일관)로 확정됐다. theme.ts는 이미 그 값이다. 코드/주석이 CHANGELOG 결정과 어긋나지 않는지 확인만.
- [todo D2] stale 주석 2건: (a) src/ui/controls/colorConvert.ts 모듈 주석의 "ParamInspector/ViewportControls도 사본 유지" → 실제로는 ValueInput.tsx만 남았으므로 갱신. (b) src/ui/Panels/AssetBrowser.tsx 기존 biome-ignore의 사유 문구("keyboard alternative is the Import button below") → Import 버튼이 제거되고 드롭존 자체가 button이 됐으므로 문구만 갱신 (ignore 신규 추가 아님).`,
    checks: [
      "withAlpha('#ffffff', …) / withAlpha('#000000', …) 직접 파생이 src에 남아있지 않은지 (tokens.overlay.* 참조로 치환됐는지) — grep으로 확인",
      "cssVars()에 추가한 CSS 변수가 있다면 실제 소비처가 같은 변경 안에 있는지",
      "StatusPill / GroupInspector에 radius 리터럴이 남지 않았는지",
      "src/theme.ts에 새 토큰이 추가되지 않았는지 (v1.1 확정 토큰만 존재)",
    ],
  },
  {
    id: "V1",
    phase: "V1 Node Name",
    todo: ["E3(선행)", "B8(선행)"],
    dec: ["D15"],
    dependsOn: [],
    design: [
      "design/README.md (§B 노드 rename · §E Inspector Name 필드)",
      "design/CHANGELOG.md (v1.1 — Added, D15)",
      "design/Node Editor.dc.html (헤더 타이틀 인라인 편집)",
      "design/Side Panel.dc.html (Inspector 상단 Name 필드)",
    ],
    screens: ["design/screens/02-node-editor.png", "design/screens/05-side-panel.png"],
    hints: [
      "src/core/graph/types.ts (GraphNode 유니온 — name 필드 도입 지점)",
      "그래프 스토어 / 직렬화 / 세션 복원 (src/state/, persistence 경로)",
      "src/ui/NodeEditor/nodes/NodeCardHeader.tsx (헤더 타이틀)",
      "src/ui/Panels/Inspector.tsx · src/ui/Panels/InspectorNodeHeader.tsx",
    ],
    goal: `[D15 ★선행 의존] 노드 이름(name) 모델 도입. V3(pane 라벨)과 V6(export 파일명)이 이 결과에 의존하므로 먼저 끝나야 한다.
- GraphNode에 사람이 붙이는 이름 필드를 도입한다. 미지정 시 표시명 폴백 규칙(예: 노드 종류 기반 기본 라벨)을 정하고, 내부 id가 UI에 노출되지 않게 한다.
- 두 개의 rename 진입점이 **같은 상태 소스**를 써야 한다: (1) 노드 카드 헤더 타이틀 더블클릭 → 인라인 편집(텍스트 필드 + 캐럿), (2) Inspector 상단 공통 Name 필드.
- 직렬화/영속화 하위호환: 기존 저장본(name 없음)을 복원해도 깨지지 않아야 한다. 마이그레이션 방식은 플래너가 결정하고 notes에 근거를 남겨라.
- undo/redo(historyStore)와 연동 — rename이 히스토리에 기록되어야 한다. store 간 순환 의존을 만들지 마라 (graphStore↔historyStore 순환은 과거에 해소된 이력이 있다).
- 이 마일스톤은 UI 스킨이 아니라 **모델 변경**이다. 기존 그래프 동작(컴파일·연결·선택)이 깨지지 않는지 단위 테스트로 고정하라.`,
    checks: [
      "구 저장본(name 없는 스냅샷) 복원 시 크래시 없이 기본 표시명이 나오는지",
      "그래프 인라인 rename과 Inspector Name 필드가 동일 상태를 읽고 쓰는지",
      "rename이 undo/redo에 기록되는지, store 순환 의존이 생기지 않았는지",
      "노드 id가 UI 문자열로 새어나가는 경로가 남아있는지 (V3에서 최종 확인)",
    ],
  },
  {
    id: "V2",
    phase: "V2 Node Editor",
    todo: ["B5", "C2", "C3", "D1(테스트)"],
    dec: ["D2", "D7", "D8"],
    dependsOn: [],
    design: [
      "design/Node Editor.dc.html (v1.1 갱신 — 포트 rail · Webcam/Video 카드 · Audio 파형)",
      "design/README.md (§B — 포트 라벨 rail, Webcam/Video, Audio, 포트 지오메트리 규칙)",
      "design/CHANGELOG.md (v1.1 — D2/D7/D8)",
    ],
    screens: ["design/screens/02-node-editor.png"],
    hints: [
      "src/ui/NodeEditor/nodes/PortHandle.tsx (포트 + 라벨)",
      "src/ui/NodeEditor/nodes/ShaderNodeView.tsx · OutputNodeView.tsx (썸네일/메타 겹침)",
      "src/ui/NodeEditor/nodes/WebcamNodeView.tsx · VideoNodeView.tsx · AudioNodeView.tsx",
      "src/ui/NodeEditor/nodeCard.css",
      "src/ui/NodeEditor/nodes/nodeViews.test.tsx (회귀 테스트 추가 지점)",
    ],
    goal: `[D2 ★가장 큼 — 노드 카드 레이아웃 전체에 영향] 포트 라벨 rail 도입 + 신규 카드 시안 반영. 디자이너가 "라벨 유지 + 레이아웃 재설계"(옵션 2)를 택했고 dc가 갱신됐다.
- [D2 / todo B5] 포트 라벨을 카드 좌/우 **rail**(폭 ~46px)에 배치하고, 썸네일을 rail만큼 안쪽으로 민다(margin: 0 46px). 라벨 = 포트 타입 패밀리 색, mono 8.5px, max-width ~30–34px ellipsis. 96px 썸네일 위에 글자가 겹치던 문제가 사라져야 한다.
- [D2] Output 노드는 좌 rail 입력 라벨(\`tex\`) + 본체 메타(\`→ viewport\`)를 **함께** 표기한다 (둘 중 하나를 지우는 게 아니라 rail/본체로 분리). dc의 정확한 문자열을 확인하라.
- 포트 지오메트리 규칙(README §B, src/theme.ts 하단 주석)은 그대로 유지: input x = node.left, output x = node.left + node.width, center y = node.top + portTop + 5.5. rail 도입으로 카드 높이/포트 top이 바뀐다면 엣지 좌표가 함께 맞아야 한다.
- [D8 / todo C3] Webcam / Video 카드 신규 시안 반영: Source 카테고리, 프리뷰 16:9, 레터박스 배경 = tokens.surface.letterbox (raw "#000" 제거). Webcam = 라이브 프레임 + 중앙 렌즈 링, Video = 재생 글리프 + 하단 스크럽 바. 출력 포트 violet(resource).
- [D7 / todo C2] Audio 파형: 바 색 = tokens.nodeCategory.source (구 팔레트 "#56c1d6" 제거), 캔버스 배경 **투명**(카드 그라디언트가 비쳐야 함 — "#000" 배경 제거), 무음/권한대기 시 dim. canvas 2D는 CSS 변수를 못 읽으므로 tokens.* 직접 import.
- [todo D1] PortHandle 회귀 테스트 추가: input = hollow ring(2.5px solid 패밀리색 + var(--surface-node-card-solid) 내부) / output = solid disc + portOutputGlow 레시피를 renderToStaticMarkup 문자열 단언으로 고정 (현재는 클래스 존재만 확인 중).`,
    checks: [
      "포트 라벨이 썸네일/메타와 겹치지 않는지 (Shader·Output·Image 카드 실제 렌더 확인)",
      "rail 폭·썸네일 inset·라벨 타이포가 Node Editor.dc.html v1.1 인라인 값과 일치하는지",
      "Webcam/Video 레터박스가 surface.letterbox 참조인지 (raw #000 잔존 여부 grep)",
      "AudioNodeView의 canvas fillStyle이 tokens.nodeCategory.source이고 배경이 투명인지",
      "포트 지오메트리 규칙이 유지되고 엣지가 포트 중심에 붙는지",
      "PortHandle 스타일 회귀 테스트가 input/output 레시피를 실제로 단언하는지",
    ],
  },
  {
    id: "V3",
    phase: "V3 Viewport",
    todo: ["B6", "E4", "E3", "E2(확인)"],
    dec: ["D3", "D10", "D14", "D15(소비)"],
    dependsOn: ["V1"],
    design: [
      "design/Viewport.dc.html (v1.1 갱신 — 컴팩트 트랜스포트 · ⏮ · 빈 상태)",
      "design/README.md (§C)",
      "design/CHANGELOG.md (v1.1 — D3/D10/D14)",
    ],
    screens: ["design/screens/03-viewport.png"],
    hints: [
      "src/ui/Viewport/index.tsx · TransportBar.tsx · PaneOverlay.tsx · EmptyState.tsx",
      "src/index.css (.vp-pane-res 캡션)",
    ],
    goal: `[D3/D10/D14 + D15 소비] 좁은 도킹 폭 대응 + 빈 상태 그라디언트 + pane 라벨의 노드 이름 사용.
- [D3 / todo B6] 좁은 도킹 폭(≤700px — 기본 레이아웃의 뷰포트는 ~590px)에서 트랜스포트 바 **컴팩트 변형**: 스크럽·FOV 슬라이더를 스텝퍼 버튼으로 축약(FOV 탭 → 프리셋 순환), ⏮/▶/시간/배속/reset만 유지. 하단 행 pane의 해상도 캡션은 컴팩트 바 위로 오프셋해 가려지지 않게 한다. 컨테이너 쿼리 사용 가능.
- [D10 / todo E4] 뷰포트 빈 상태 배경을 평면색 → tokens.gradient.emptyState(2종점 radial)로 복원. CSS에서 참조하려면 cssVars() 방출을 이 유닛에서 함께 배선(소비처와 동시에).
- [D14 / todo E2 — 확인만] ⏮ reset-time 버튼은 **유지**로 확정됐고 dc에 편입됐다(⏮ → ▶ → 스크럽 → 배속 → 구분선 → FOV → Reset(카메라) 순). 현재 구현의 순서/글리프가 dc와 맞는지 확인.
- [D15 소비 / todo E3] pane 라벨이 내부 id("Output · output_lx3….1")를 노출하지 않고 V1에서 도입한 노드 이름을 쓰도록 한다 (dc: "Output · main"). 이름 미지정 노드의 폴백 표기도 정하라.`,
    checks: [
      "기본 도킹 폭(~590px)에서 2/3/4 분할 시 해상도 캡션이 트랜스포트 바에 가려지지 않는지",
      "컴팩트 변형의 구성 요소가 Viewport.dc.html v1.1과 일치하는지 (스텝퍼 축약)",
      "빈 상태 배경이 gradient.emptyState 참조인지 (평면색 잔존 여부)",
      "pane 라벨에 내부 노드 id가 더 이상 노출되지 않는지",
    ],
  },
  {
    id: "V4",
    phase: "V4 Side Panel",
    todo: ["C1", "B3"],
    dec: ["D1", "D18"],
    dependsOn: [],
    design: [
      "design/Side Panel.dc.html (v1.1 갱신 — Diagnostics 탭)",
      "design/README.md (§E · §도메인 규칙 'Inspector 타입 배지 = 포트 패밀리 색')",
      "design/CHANGELOG.md (v1.1 — D1/D18)",
    ],
    screens: ["design/screens/05-side-panel.png"],
    hints: [
      "src/ui/Panels/SidePanel.tsx (탭 구성)",
      "src/ui/Panels/DiagnosticsPanel.tsx (구 팔레트 raw hex 10건 — 최다 잔여물)",
      "src/ui/Panels/ParamInspector.tsx (Output type 배지)",
      "debugUiStore (Diagnostics 토글 경로)",
    ],
    goal: `[D1/D18] Diagnostics를 정식 탭으로 승격 + Inspector 타입 배지 규칙 정합.
- [D1 / todo C1] 디자이너가 **Side Panel의 4번째 탭**(Inspector / Assets / Problems / Diagnostics)으로 확정하고 시안을 그렸다. DiagnosticsPanel을 그 탭으로 편입하고 리스킨한다:
  - 런타임 진단 = GPU / Frame / Draw calls / Programs 메트릭 카드 + INFO/WARN/ERROR/DEBUG 레벨 태그 런타임 로그.
  - 레벨 색 = semantic(error/warning/info) + text.muted(debug), 카드 = surface.card, 배경 = surface.panel, 보더 = border.default.
  - raw hex 10건(#7a7a7a #7aa2f7 #e0af68 #ff6b6b #161616 #303030 #ccc #2a2a2a #666 #888)이 **0건**이 되어야 한다.
  - Problems 탭(컴파일 에러 목록)과는 **별개**다 — 합치지 마라.
  - 기존 debugUiStore 토글/진입 경로(상태바 Diagnostics 클릭 등)를 어떻게 탭 편입과 조화시킬지는 플래너가 결정하고 notes에 남겨라. 기존 진입 경로를 말없이 없애지 마라.
- [D18 / todo B3] ParamInspector의 Output type 배지 색을 paramKind → GLSL 타입 → tokens.portTypeToFamily로 도출한다 (float/time → scalar 초록, vec2/3/4·color → vector 노랑). 지금은 항상 vector 노랑이라 그래프의 float 포트(초록)와 어긋난다.`,
    checks: [
      "DiagnosticsPanel에 raw hex가 0건인지 (grep)",
      "Side Panel 탭이 4개이고 Diagnostics 크롬이 Side Panel.dc.html v1.1과 일치하는지",
      "기존 Diagnostics 진입 경로(debugUiStore)가 보존되는지",
      "float/time param의 Output type 배지가 scalar(초록)로 나오고 그래프 포트 색과 일치하는지",
    ],
  },
  {
    id: "V5",
    phase: "V5 Shell·Editor·Palette",
    todo: ["E1", "E8", "E6", "B1", "B2"],
    dec: ["D13", "D19", "D17(사용자 결정: dc 정본 → 구현)"],
    dependsOn: [],
    design: [
      "design/App Shell.dc.html (L359-370 — 도킹 헤더 메타 배지 우측 정렬)",
      "design/Command Palette.dc.html (L116-125 — 빈 결과 CTA)",
      "design/README.md (§도메인 규칙 — 메타 배지 정렬 · 컴파일 에러 카운트)",
      "design/CHANGELOG.md (v1.1 — D13/D19)",
    ],
    screens: ["design/screens/01-app-shell.png", "design/screens/06-command-palette.png"],
    hints: [
      "src/ui/DockPanelHeader.tsx (metaAlign 옵션 추가 지점) · src/ui/CodeEditor/index.tsx",
      "src/ui/Viewport/CompileErrorOverlay.tsx · src/ui/Panels/StatusBar.tsx",
      "src/ui/CommandPalette/index.tsx · src/state/commandPaletteStore.ts",
      "src/ui/WelcomeOverlay.tsx (~L182 포커스 가드)",
    ],
    goal: `dc 정합 2건 + 상호작용 버그 3건. 서로 독립적이니 유닛을 나눠 진행해도 된다.
- [D13 / todo E1] DockPanelHeader에 metaAlign="end" 옵션을 추가하고 Code Editor 도킹 헤더의 메타 배지("GLSL · ES 3.0")를 **우측**(spacer 뒤)으로 옮긴다. dc가 정본이며 README 도메인 규칙에 명문화됐다. 공통 컴포넌트의 기본 동작을 깨지 않도록 옵션으로 도입할 것.
- [D19 / todo E8] CompileErrorOverlay는 **항상 단일(첫 실패) 노드 기준**으로 카운트를 표시하되, 여러 노드가 동시에 실패하면 \`(+N more)\`를 병기해 StatusBar(전 노드 합산)와의 차이를 설명한다.
- [D17 / todo E6 — 사용자 결정: dc를 정본으로 보고 구현] 커맨드 팔레트 검색 결과 0건일 때 'Create a Shader node named "<term>" ↵' CTA 행을 구현한다 (Command Palette.dc.html L116-125). Enter로 실제 Shader 노드가 생성되어야 하며, 노드 이름은 V1에서 도입한 name 필드에 검색어를 넣는다 (V1이 격리됐다면 이름 부여 없이 노드 생성만 하고 followups에 기록).
- [todo B1] 툴바 Search 버튼으로 팔레트를 열 때 이전 검색어가 남는 버그: ⌘K 경로는 setQuery("")/setActive(0)로 리셋하지만 commandPaletteStore.setOpen(true) 직접 호출 경로는 리셋하지 않는다. open이 false→true로 바뀌는 지점에서 리셋해 두 경로를 동일하게 만든다.
- [todo B2] Welcome 카드 클릭 직후 Enter-to-create 불능: 카드 클릭 시 버튼이 포커스를 가져가 \`document.activeElement !== document.body\` 가드에 걸리고 Enter가 카드 재클릭으로 소비된다. 가드에 카드 버튼 포커스를 허용하거나, 카드 클릭 후 포커스를 body/Create로 옮긴다.`,
    checks: [
      "Code Editor 도킹 헤더의 메타 배지가 우측 정렬이고, 다른 패널 헤더는 기존 배치를 유지하는지",
      "다중 셰이더 실패 시 오버레이에 (+N more)가 병기되는지",
      "팔레트 빈 결과 CTA가 실제로 Shader 노드를 생성하는지",
      "툴바 Search 경로로 열었을 때 검색어/선택 인덱스가 리셋되는지",
      "Welcome 카드 클릭 후 Enter로 생성이 되는지",
    ],
  },
  {
    id: "V6",
    phase: "V6 Export & Share",
    todo: ["B8", "B7", "E9"],
    dec: ["D16", "D5"],
    dependsOn: ["V1"],
    design: [
      "design/Export & Share.dc.html (v1.1 갱신 — 파일명 · 완료 카드 액션 1행)",
      "design/README.md (§H — 파일명 규칙 · standalone HTML 산출물)",
      "design/CHANGELOG.md (v1.1 — D16/D5)",
    ],
    screens: ["design/screens/08-export-share.png"],
    hints: [
      "src/ui/ExportShare/ExportShareDialog.tsx (~L494 완료 카드, DoneRecordPanel)",
      "src/export/htmlExport.ts (L58-70 파일명 생성) · src/export/standalonePlayer.js",
    ],
    goal: `[D16/D5 + todo B7] export 파일명 정합 + 완료 화면 레이아웃 + 산출물 토큰 이식.
- [D16 / todo B8] export 파일명 규칙을 \`{projectTitle}-{timestamp}\`로 통일한다 (예: untitled-project-20260714-1532.html — 덮어쓰기 방지). **완료 카드·토스트의 표시명 = 실제 저장명**이어야 한다. 지금은 카드가 'shader-playground.html'로 표시하지만 실제 저장은 \`\${title}-\${Date.now()}.html\`이다. downloadExportedHtml이 최종 파일명을 반환하게 하는 방향을 검토하라. GIF/WebM 카드는 이미 표시=실제이므로 같은 규칙으로 수렴시킨다.
- [todo B7] GIF/WebM 완료 화면의 액션 버튼이 두 행으로 쌓이는 문제: DoneRecordPanel이 자체 .es-done-actions(Save to disk)를 렌더하고 부모가 또 하나(Export again)를 렌더한다. dc(L282-285)는 [Export again | 주 CTA] **한 줄**이다. DoneRecordPanel의 자체 actions를 제거하고 onSave 버튼을 부모 행에 합류시킨다. HTML/Link 완료 화면은 이미 한 줄이므로 회귀시키지 마라.
- [D5 / todo E9] export되어 나가는 standalone HTML 산출물에 앱 토큰을 이식한다 (배경 surface.app, 텍스트 text.primary — 현재 #111/#ddd). 산출물은 앱 밖에서 열리므로 CSS 변수 주입에 의존할 수 없다 → 빌드 시점에 토큰 값을 문자열로 박아 넣는 방식이어야 한다.
- src/export/standalonePlayer.js는 vitest coverage.exclude에 이미 등록된 파일이다. exclude 목록에 새 파일을 추가하지 마라.`,
    checks: [
      "완료 카드/토스트에 표시되는 파일명이 실제 저장 파일명과 같은지 (단위 테스트로 고정)",
      "GIF/WebM 완료 화면의 액션이 한 줄인지, HTML/Link 완료 화면이 회귀하지 않았는지",
      "standalone 산출물에 #111/#ddd 같은 토큰 밖 hex가 남지 않았는지",
      "vitest.config.ts의 coverage.exclude가 변경되지 않았는지",
    ],
  },
  {
    id: "V7",
    phase: "V7 System States",
    todo: ["E10", "B4"],
    dec: ["D6", "D4"],
    dependsOn: [],
    design: [
      "design/System States.dc.html (v1.1 갱신 — 8번째 상태 'App crashed' · 스켈레톤 중앙)",
      "design/README.md (§I · §도메인 규칙 '크래시 폴백 예외')",
      "design/CHANGELOG.md (v1.1 — D6/D4)",
    ],
    screens: ["design/screens/09-system-states.png"],
    hints: [
      "src/ui/ErrorBoundary.tsx (크래시 폴백)",
      "src/ui/NodeEditor/GraphSkeleton.tsx · src/index.css (복원 스켈레톤)",
    ],
    goal: `[D6/D4] 크래시 폴백 시안 반영 + 스켈레톤 인디케이터 위치 수정.
- [D6 / todo E10] ErrorBoundary 폴백이 **8번째 시스템 상태**로 시안화됐다. dc대로 전체 앱을 덮는 오버레이 + Reload / Copy error CTA를 맞추되, **토큰/웹폰트 비의존 원칙은 유지**한다 (system-ui 폰트 + 중립 그레이). CSS 변수·웹폰트 주입이 실패한 상황에서도 렌더돼야 하기 때문이며 README §도메인 규칙에 예외로 명문화됐다. 액센트 버튼 색만 accent.default를 유지한다. 코드에 **이 예외의 사유 주석**을 남겨라 (검증자가 "토큰화 누락"으로 오판하지 않도록).
- [D4 / todo B4] 세션 복원 스켈레톤의 "Restoring graph…" 인디케이터를 좌하단(left:14/bottom:16) → **캔버스 중앙 플로팅**으로 옮긴다. 좌하단은 줌 컨트롤(− % + fit)의 상주 자리라 겹쳤다. 줌 컨트롤을 숨기는 방식이 아니라 인디케이터를 옮기는 쪽으로 확정됐다.`,
    checks: [
      "ErrorBoundary가 CSS 변수/웹폰트 없이도 렌더 가능한 형태를 유지하는지 (토큰 예외 사유 주석 존재)",
      "크래시 폴백의 레이아웃/CTA가 System States.dc.html v1.1의 8번째 상태와 일치하는지",
      "스켈레톤 인디케이터가 캔버스 중앙이고 줌 컨트롤과 겹치지 않는지",
    ],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 스키마
// ─────────────────────────────────────────────────────────────────────────────

// 모든 에이전트가 공유하는 "보류 항목" 구조 — 작업을 멈추는 대신 여기에 쌓는다.
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
          instructions: { type: "string", description: "구현 지시 — 파일별 변경 내용, 참조할 디자인 값 위치, 주의점" },
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
    summary: { type: "string", description: "변경 요약 + 주요 결정. blocked면 지금까지의 부분 진행 상태" },
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
            description: "실행 가능한 단정적 결정. '사용자에게 물어보라'는 답은 금지 — 잠정 결정이라도 반드시 내려라.",
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
          reason: { type: "string", description: "왜 회귀가 아니라 의도된 변경인지 (v1.1의 어느 결정인지)" },
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
    stashRef: { type: "string", description: "보존된 stash 이름 (예: stash@{0} wf-quarantine-V3)" },
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
      description: "temp/todo.md의 모든 작업 항목(B1~B8, C1~C5, D1~D2, E1~E10)에 대한 처리 상태",
      items: {
        type: "object",
        required: ["todo", "status", "note"],
        properties: {
          todo: { type: "string", description: "예: B5, C1, E10" },
          status: {
            type: "string",
            enum: ["done", "verified-no-change", "deferred", "not-covered"],
          },
          note: { type: "string", description: "근거 (커밋/파일, 또는 왜 미처리인지)" },
        },
      },
    },
    residualHexCount: { type: "number" },
    residualHexSummary: { type: "string", description: "파일별 잔여 raw hex 요약 (정당한 잔여물 구분)" },
    bundleKiB: { type: "number", description: "참고용 번들 사이즈 측정치 (게이트 아님). 측정 실패 시 -1" },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 프롬프트 빌더
// ─────────────────────────────────────────────────────────────────────────────
function refBlock(m) {
  return `[디자인 레퍼런스 — 반드시 직접 읽을 것]
- ${m.design.join("\n- ")}
- src/theme.ts — 토큰 단일 출처 (v1.1 병합 완료. 런타임 값의 출처는 이 파일이다 [D20])
- temp/todo.md — 이 마일스톤이 해소해야 할 잔여 작업 항목: ${m.todo.join(", ")}
- temp/design-need-to-update.md — 디자이너에게 보낸 질문 원문 (각 D 항목의 배경/선택지)
- 스크린샷: ${m.screens.join(", ")}
.dc.html은 사내 디자인 툴 포맷이다. 프레임워크는 무시하고 인라인 스타일의 정확한 hex·px·폰트·radius 값만 읽어라 (그 hex를 코드에 직접 쓰지 말고 대응하는 tokens.* 를 찾아 참조).

[이 마일스톤이 반영하는 디자이너 결정] ${m.dec.join(" · ")}
design/CHANGELOG.md의 v1.1 항목이 각 결정의 "왜"를 담고 있다. dc와 코드가 어긋나 보이면 CHANGELOG를 먼저 읽어라 — v1.1에서 이미 결론이 난 항목일 수 있다.
⚠ temp/todo.md의 항목 설명은 v1.0 검증 시점 기준이다. 착수 전 현재 코드에서 그 이슈가 **여전한지 먼저 확인**하라 (이미 해소됐으면 그 사실을 summary에 남기고 넘어간다).`
}

function depsBlock(m, quarantined) {
  const broken = (m.dependsOn || []).filter((d) => quarantined.includes(d))
  if (broken.length === 0) return ""
  return `

[⚠ 선행 마일스톤 실패] ${broken.join(", ")} 가 게이트를 통과하지 못해 **격리(stash)되어 브랜치에서 빠졌다**. 그 결과물(예: V1의 노드 name 필드)은 현재 코드에 없다.
- 그 선행 결과에 의존하는 유닛은 **계획에서 제외**하고, 의존하지 않는 나머지만 진행하라 (워크플로우를 멈추지 말 것).
- 제외한 유닛을 followups(audience:'user')에 기록하라 — "${broken.join(",")} 복구 후 재실행 필요" + 무엇이 빠졌는지.`
}

function plannerPrompt(m, quarantined) {
  return `당신은 ShaderPlayground 디자인 리팩터링(핸드오프 v1.1 후속)의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[배경] design/ 핸드오프 v1을 M0~M8로 재구현하는 작업은 이미 끝나 main에 머지됐다(PR #68). 그 과정에서 시안이 없거나 어긋나던 지점을 디자이너에게 문의해 **핸드오프 v1.1**(디자이너 결정 D1~D21)을 받았고, src/theme.ts는 v1.1 토큰으로 병합된 상태다. 이제 temp/todo.md에 정리된 잔여 작업을 v1.1 결정에 따라 처리한다.

[마일스톤 ${m.id}] ${m.goal}

${refBlock(m)}${depsBlock(m, quarantined)}

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
기존 기능(상태 로직, 상호작용)은 보존한다는 원칙. 파괴적 재작성이 필요하면 notes에 사유를 기록하라.
"확인만" 성격의 항목(코드 변경이 불필요할 수 있는 것)도 유닛으로 넣되, 변경이 없으면 그 사실을 근거와 함께 보고하게 하라 — 억지로 코드를 바꾸지 마라.
디자인이 확정하지 않은 지점이 보이면 **계획 단계에서 잠정 결정을 내려 유닛에 박아 넣고** followups에 기록하라. 계획을 미루지 마라.
${CONSTRAINTS}`
}

function implPrompt(m, unit, answersBlock, priorSummary) {
  const prior = priorSummary
    ? `\n[이전 시도의 부분 진행 상태 — 작업 트리에 이미 반영됨]\n${priorSummary}\n이어서 진행하라 (처음부터 다시 하지 말 것).`
    : ""
  const ans = answersBlock
    ? `\n[아키텍트(상위 모델)의 답변 — 이 결정을 따르라]\n${answersBlock}`
    : ""
  return `당신은 ShaderPlayground 디자인 리팩터링(핸드오프 v1.1 후속)의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[마일스톤 ${m.id} — 작업 유닛 ${unit.id}: ${unit.title}]
${unit.instructions}

[대상 파일] ${unit.files.join(", ")}
[테스트] ${unit.tests}
[수용 기준]
- ${unit.acceptance.join("\n- ")}

${refBlock(m)}
${prior}${ans}

[진행 규칙]
- 확신 없는 설계 결정(토큰 의미 해석, 포트 지오메트리, 스토어/모듈 경계, 기존 동작 변경 여부)은 추측하지 말고 status:'blocked' + questions로 반환하라 → **fable 아키텍트가 답을 준다** (사용자를 기다리는 게 아니다). 각 질문에 조사 내용과 검토한 선택지를 context로 첨부.
- 사소한 구현 디테일은 스스로 결정하라. blocked는 정말 갈림길일 때만.
- 디자인/사용자 결정이 없어 확정할 수 없는 값은 **잠정 결정으로 진행하고 followups에 기록**하라 (멈추지 마라).
- 완료 시 status:'done', summary에 변경 요약과 주요 결정을 기록하라. 코드 변경이 불필요했다면 그 근거를 summary에 남겨라.
${CONSTRAINTS}`
}

function oraclePrompt(m, unit, questions, priorSummary) {
  const qs = questions
    .map((q, i) => `${i + 1}. ${q.question}\n   (context: ${q.context})`)
    .join("\n")
  return `당신은 ShaderPlayground 디자인 리팩터링(핸드오프 v1.1 후속)의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
하위 구현 에이전트가 [마일스톤 ${m.id} / 유닛 ${unit.id}: ${unit.title}] 작업 중 다음 질문에 막혔다. **당신이 최종 결정권자다** — 사용자에게 넘길 수 없다.

[유닛 지시]
${unit.instructions}

[구현 에이전트의 진행 상태]
${priorSummary || "(없음)"}

[질문]
${qs}

${refBlock(m)}

저장소 코드와 디자인 문서(design/README.md, design/CHANGELOG.md, 해당 .dc.html, temp/design-need-to-update.md, Architecture.md)를 직접 확인하고, 각 질문에 **단정적으로** 답하라 — 구체적 파일/값/패턴을 지정하고 선택지 중 하나를 결정해줄 것. 하위 모델이 그대로 실행할 수 있는 수준으로.

[결정 원칙]
- "사용자에게 물어보라" / "디자이너 확인 필요" 같은 답은 **금지**다. 반드시 지금 실행 가능한 결정을 내려라.
- 디자이너가 정하지 않은 값을 지어내지도 마라. 그런 경우의 결정 우선순위:
  (1) 의미가 가장 가까운 기존 토큰/패턴으로 근사 → (2) 현행 유지 + 사유 주석 → (3) 가장 되돌리기 쉬운 최소 변경.
- 그렇게 잠정 결정한 항목은 followups에 기록하라 (audience: designer=시안/토큰, user=스코프/정책). 기록했으면 그 항목은 끝난 것이다.
${AUTONOMY}`
}

function verifierPrompt(m, plan, round) {
  const acceptance = plan.units
    .map((u) => `- [${u.id}] ${u.acceptance.join(" / ")}`)
    .join("\n")
  return `당신은 ShaderPlayground 디자인 리팩터링(핸드오프 v1.1 후속)의 검증자다. 저장소: ${ROOT} (브랜치 ${BRANCH}). 검증 라운드 ${round}.

[마일스톤 ${m.id}] ${m.goal}

[검증 대상] 아직 커밋되지 않은 작업 트리 변경. git status 와 git diff 로 이번 마일스톤의 변경을 파악하라.

${refBlock(m)}

[수용 기준 (플래너가 정의)]
${acceptance}

[마일스톤 특화 체크]
- ${m.checks.join("\n- ")}

[공통 체크]
- 새/수정 파일에 raw hex 직접 사용이 없는지 (tokens.* / var(--*) 참조만). grep -rn 으로 확인. 예외: src/theme.ts, 그리고 README §도메인 규칙이 인정한 크래시 폴백(ErrorBoundary).
- src/theme.ts에 새 토큰이 추가되지 않았는지 (디자이너가 확정한 v1.1 토큰만 존재해야 함).
- 기존 기능(상태 로직·상호작용·단축키)이 깨지지 않았는지.
- 게이트 설정 파일이 무단으로 약화되지 않았는지. tests/e2e/** 변경이 있다면 **강화 방향인지**(expect 삭제·skip이 아닌지) git diff로 확인 — 약화면 blocker다.
- temp/todo.md의 대상 항목(${m.todo.join(", ")})이 실제로 해소됐는지 — 항목별로 확인하라.

[시각 대조 — 가능하면 수행]
- npm run dev 를 백그라운드로 띄우고(이미 떠 있으면 재사용), 스크래치 디렉터리에 일회용 Playwright 스크립트를 작성해 해당 화면의 스크린샷을 찍어라. WebGL 렌더는 playwright.config.ts의 SwiftShader 플래그를 참고.
- 찍은 스크린샷과 ${m.screens.join(", ")} 를 Read로 열어 비교하라. 픽셀 diff가 아니라 구조·색·타이포·간격·상태 표현의 일치를 본다. 스크린샷은 v1.1에서 갱신된 것이다.
- 겹침(overlap)을 다루는 마일스톤(V2 포트 라벨, V3 캡션, V7 스켈레톤)은 **실제 도킹 레이아웃 폭**(뷰포트 ~590px)에서 찍어야 의미가 있다. 전폭 스크린샷만으로 판단하지 마라.
- 브라우저 실행이 불가하면 visualNotes에 그 사실을 남기고 코드 대조만으로 판단하라.

[판정]
- .dc.html 인라인 값과의 불일치, 수용 기준 미충족, 규칙 위반을 issues로 반환. severity: blocker(기능 파손/규칙 위반) / major(디자인 불일치) / minor(사소한 다듬기).
- blocker/major가 없으면 pass:true. minor만 있으면 pass 가능 (issues에는 남겨라).
- 구현이 내린 **잠정 결정**(디자인 미확정으로 근사한 것)은 그 자체로 issue가 아니다 — 근거 주석이 있고 followups에 기록됐다면 통과시키고, 기록이 빠졌으면 당신이 followups에 채워 넣어라.
${AUTONOMY}`
}

function designFixPrompt(m, issues) {
  const list = issues
    .map((i, n) => `${n + 1}. [${i.severity}] ${i.description}\n   파일: ${i.files.join(", ")}${i.fixHint ? `\n   힌트: ${i.fixHint}` : ""}`)
    .join("\n")
  return `당신은 ShaderPlayground 디자인 리팩터링(핸드오프 v1.1 후속)의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
검증자가 [마일스톤 ${m.id}]에서 다음 문제를 발견했다. 전부 수정하라.

${list}

${refBlock(m)}

수정 방법에 판단이 필요하면 status:'blocked' + questions로 반환하라 (fable 아키텍트가 답한다). 사용자를 기다리지 마라.
${CONSTRAINTS}`
}

function gatePrompt(_m) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 품질 게이트를 실행하고 결과만 보고하라. 아무것도 수정하지 마라.

1) npm run check — Bash timeout 600000ms로 실행. (내부: typecheck → lint → deadcode → circular → unit test, 실패 시 즉시 중단됨)
2) 1)이 성공했을 때만: npm run test:e2e — timeout 600000ms. 전체 스펙(약 112건, 6~7분)을 커버해야 한다. 시간 초과가 우려되면 npx playwright test tests/e2e/<파일> 로 나눠 돌리되 **임의 생략 금지**. dev 서버는 자동으로 뜬다.
   ⚠ 유닛 테스트는 jsdom stderr 노이즈(HTMLMediaElement not implemented 등)를 대량 출력한다 — 그건 실패가 아니다. **종료 코드와 요약 라인**으로 판정하라.
3) 번들 사이즈 가드(npm run size:check)는 이 워크플로우의 게이트가 아니다 — 실행하지 마라.

각 실패를 gate(typecheck|lint|deadcode|circular|unit|e2e) 별로 분류하고, detail에 핵심 에러 메시지/실패 스펙명·라인을 담아라. 통과했으면 failures는 빈 배열.`
}

function triagePrompt(m, failures) {
  return `당신은 ShaderPlayground 디자인 리팩터링(핸드오프 v1.1 후속)의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
[마일스톤 ${m.id}] 작업 후 품질 게이트가 실패했다. 실패 목록:

${JSON.stringify(failures, null, 2)}

저장소를 직접 조사해 각 실패의 근본 원인을 파악하고 분류하라. **당신이 결정권자다 — 사용자를 기다리지 말고 반드시 실행 가능한 지시를 내려라.**
- fixes: 코드 결함/회귀 — 하위 모델이 그대로 실행할 수 있는 구체적 수정 지시 (근본 원인 포함, 증상 덮기 금지).
- specChanges: 이번 디자인 변경이 의도한 UI 변화 때문에 기존 E2E expectation이 더 이상 유효하지 않은 경우만. proposedChange는 **새 디자인 값을 단언하는 강화 방향**이어야 하며, expect 삭제·test.skip 같은 약화는 절대 제안하지 마라. reason에 design/CHANGELOG.md v1.1의 어느 결정 때문인지 명시하라.
  ※ 이번 리팩터링은 노드 이름 표시(D15), Side Panel 4번째 탭(D1), 컴팩트 트랜스포트(D3), 포트 rail(D2) 등 **UI 구조를 의도적으로 바꾼다** — 기존 스펙이 옛 UI를 단언하고 있다면 정당한 specChange다. 확신이 없으면 회귀(fixes) 쪽으로 분류하라.
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
  return `당신은 ShaderPlayground 디자인 리팩터링(핸드오프 v1.1 후속)의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
품질 게이트 실패에 대한 아키텍트의 수정 지시다. 전부 적용하라.

[수정 지시]
${fixes}${specs}

적용 후 관련 게이트만 표적 재실행해 확인하라 (예: npx tsc --noEmit, npx vitest run <파일>, npx playwright test <스펙>). 전체 게이트는 별도 단계에서 재실행된다.
지시가 잘못됐다고 판단되면 임의 변경하지 말고 status:'blocked' + questions로 반환하라 (아키텍트가 다시 답한다).
${CONSTRAINTS}`
}

function commitPrompt(m, unitSummaries) {
  const title = m.phase.replace(/^V\d+ /, "")
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 마일스톤 변경을 커밋하라.
1) git add -A
2) git commit — 제목: "design(${m.id}): ${title} — 핸드오프 v1.1". 본문: 아래 변경 요약을 bullet 몇 개로 정리하고, 반영한 디자이너 결정(${m.dec.join(", ")})과 해소한 todo 항목(${m.todo.join(", ")})을 명시한 뒤, 마지막 줄에 정확히 다음을 넣어라:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

[변경 요약]
${unitSummaries}

--no-verify 등 hook 우회 플래그 금지. 커밋 후 sha를 반환하라.
※ ${FOLLOWUP_DOC} 는 워크플로우가 별도로 관리하니 이 커밋에 함께 들어가도 무방하다.`
}

function quarantinePrompt(m, reason) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH}). [마일스톤 ${m.id}]이 품질 게이트를 초록으로 만들지 못했다: ${reason}

워크플로우는 멈추지 않고 다음 마일스톤으로 진행한다. 이 마일스톤의 작업을 **버리지 말고 격리**해서 브랜치를 마지막 초록 커밋 상태로 되돌려라 (빨간 변경이 다음 마일스톤에 섞이면 안 된다).

1) git stash push -u -m "wf-quarantine-${m.id}" — 추적/미추적 파일 모두 보존한다. (작업이 사라지지 않는다 — 나중에 git stash apply 로 복구 가능)
2) git status --porcelain 으로 작업 트리가 깨끗해졌는지 확인.
3) npx tsc --noEmit 로 HEAD 상태가 초록인지 빠르게 확인 (실패하면 note에 기록).
4) git stash list 로 보존된 stash 이름을 확인해 stashRef에 담아라.

아무것도 커밋하지 마라. reset --hard 금지 (작업이 사라진다).`
}

function docPrompt(followups, milestoneStates) {
  return `저장소 ${ROOT}. 이 워크플로우가 자율 진행하면서 **사용자 판단 또는 디자인 문서 갱신이 필요하다고 판단한 항목**들을 모았다.
이것을 ${FOLLOWUP_DOC} 파일로 정리해 써라 (있으면 통째로 덮어쓴다 — 이 문서는 매번 전체 재생성된다).

[수집된 보류 항목 (JSON)]
${JSON.stringify(followups, null, 2)}

[마일스톤 실행 상태 (JSON)]
${JSON.stringify(milestoneStates, null, 2)}

[문서 요구사항]
- 제목: "# 디자인 리팩터링 v1.1 — 보류 항목 (자율 실행 산출물)". 첫 줄에 "이 문서는 워크플로우가 작업을 멈추지 않기 위해 **잠정 결정**으로 진행한 항목들의 목록이다. 각 항목은 이미 코드에 반영돼 있으며, 정식 결정이 나오면 표시된 위치를 고치면 된다."는 취지를 적어라.
- 섹션 구성:
  1. **사용자 판단 필요** (audience: user) — 스코프·정책·게이트 관련. 각 항목: 무엇이 / 왜 / **잠정 처리** / 정식 결정 시 바꿀 위치(파일).
  2. **디자인 문서 갱신 필요** (audience: designer) — 다음 핸드오프(v1.2) 요청 후보. temp/design-need-to-update.md와 같은 형식(🎨 시안 / 🎯 토큰 / ✅ 확답)으로 분류해 주면 그대로 디자이너에게 보낼 수 있다.
  3. **적용된 E2E 스펙 변경** — 사후 검토용. 파일·테스트명·근거(v1.1의 어느 결정)·변경 방향(강화인지) 명시. 없으면 "없음".
  4. **격리된 마일스톤** — 게이트를 통과하지 못해 stash로 빠진 마일스톤이 있으면 그 목록 + stash 이름 + 복구 방법(git stash apply) + 실패 요약. 없으면 "없음".
- 중복 항목은 병합하고, 같은 주제는 묶어라. 항목이 하나도 없는 섹션은 "없음"으로 남겨라 (섹션 자체는 유지).
- 한국어로, 저장소의 다른 temp/*.md 문서와 같은 톤(간결한 체크리스트 + 근거)으로 작성하라.
- 파일을 실제로 쓰고, itemCount에 총 항목 수를 반환하라. **코드는 건드리지 마라.**`
}

// ─────────────────────────────────────────────────────────────────────────────
// 실행 루틴
// ─────────────────────────────────────────────────────────────────────────────

// 전 단계에서 수집되는 보류 항목 (작업을 멈추는 대신 여기 쌓인다)
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
      // fable까지 갔는데도 못 끝냈다 — 멈추지 말고 남은 것을 보류 항목으로 넘긴다.
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
      // 디자인 검증이 끝내 통과하지 못했다 — 게이트는 계속 진행하고, 남은 불일치는 보류 항목으로.
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
        oraclePrompt(m, { id: "design-fix", title: "검증 이슈 수정", instructions: designFixPrompt(m, blocking) }, fixRes.questions, fixRes.summary),
        { label: `oracle:${m.id}/design-fix`, phase: m.phase, model: ORACLE_MODEL, effort: "high", schema: ANSWER_SCHEMA },
      )
      if (ans) {
        collect(ans, `oracle:${m.id}/design-fix`)
        const answersBlock = ans.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
        const second = await agent(designFixPrompt(m, blocking) + `\n\n[아키텍트 답변 — 이 결정을 따르라]\n${answersBlock}`, {
          label: `design-fix:${m.id}:r${round}b`,
          phase: m.phase,
          model: IMPL_MODEL,
          schema: IMPL_SCHEMA,
        })
        collect(second, `design-fix:${m.id}`)
      }
    }
  }
  return { pass: false, note: "max verify rounds" }
}

// 게이트 루프: 실행 → fable 트리아지 → 수정 (스펙 갱신은 강화 방향만) → 재실행
// 어떤 경우에도 워크플로우를 멈추지 않는다 — 실패는 호출자가 격리(stash)로 처리한다.
async function gateLoop(m) {
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
    if (g.checkPass && g.e2ePass)
      return { green: true, appliedSpecChanges, attempts: attempt }
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

    const specs = ALLOW_SPEC_UPDATES ? triage.specChanges || [] : []
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
    if (!ALLOW_SPEC_UPDATES && (triage.specChanges || []).length > 0) {
      for (const s of triage.specChanges) {
        followups.push({
          audience: "user",
          title: `E2E 스펙 갱신 필요(미적용): ${s.spec}`,
          context: `근거: ${s.reason} / 제안: ${s.proposedChange}`,
          interimDecision:
            "allowSpecUpdates:false라 적용하지 않았다. 코드 쪽으로 해결을 시도했고, 실패하면 이 마일스톤은 격리된다.",
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
    log(`  ${m.id} 게이트 r${attempt}: 수정 ${(triage.fixes || []).length}건, 스펙 갱신 ${specs.length}건 적용`)
    const fixRes = await agent(gateFixPrompt(m, { ...triage, specChanges: specs }, ALLOW_SPEC_UPDATES), {
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
log(`브랜치 ${BRANCH} 준비 + v1.1 핸드오프 확인 + 베이스라인 게이트`)
const setup = await agent(
  `저장소 ${ROOT} 준비 단계. 순서대로:
1) git status --porcelain 확인 — 작업 트리가 더러우면(추적 파일 변경 존재) ok:false, reason에 상태 요약을 담아 반환하고 종료. 아무것도 수정/스태시하지 마라.
2) 핸드오프 v1.1이 실제로 들어와 있는지 확인 — 아래가 모두 참이어야 한다. 하나라도 아니면 ok:false + reason:
   - design/CHANGELOG.md 에 "## v1.1" 섹션이 있다.
   - src/theme.ts 에 tokens.overlay(gridDot/scrim), tokens.gradient(emptyState), surface.letterbox 가 있다.
   - src/theme.ts 가 withAlpha / cssVars / PORT_DIAMETER / tokens 를 export 한다 (구현이 쓰는 export들 — 없으면 v1.1 병합이 덜 된 것이다).
3) 깨끗하면 브랜치 ${BRANCH}로 전환 (없으면 현재 HEAD에서 생성: git switch -c ${BRANCH}, 있으면 git switch ${BRANCH}).
4) node_modules가 없으면 npm ci.
5) 베이스라인 확인: npm run check 를 timeout 600000ms로 실행. **완전히 초록이어야 한다**. 실패하면 ok:false + reason에 실패 게이트 요약 — 수정하지 마라. 빨간 베이스라인에선 리팩터링을 시작하지 않는다.
   ※ 유닛 테스트의 jsdom stderr 노이즈(HTMLMediaElement not implemented 등)는 실패가 아니다. 종료 코드로 판정하라.
모두 통과하면 ok:true, branch, reason에 베이스라인 상태 한 줄.

이 단계는 워크플로우가 유일하게 중단될 수 있는 지점이다 (더러운 트리/빨간 베이스라인/핸드오프 누락 — 어느 것도 자동으로 고칠 수 없다). 이후 단계는 무슨 일이 있어도 끝까지 진행된다.`,
  { label: "setup", model: IMPL_MODEL, effort: "low", schema: SETUP_SCHEMA },
)
if (!setup || !setup.ok)
  return { status: "aborted", reason: setup ? setup.reason : "setup agent lost" }

const report = []
const quarantined = [] // 게이트 실패로 stash된 마일스톤 ID

for (const m of MILESTONES) {
  if (ONLY && !ONLY.includes(m.id)) continue
  phase(m.phase)
  log(`── ${m.id} 시작 (todo: ${m.todo.join(", ")} / 결정: ${m.dec.join(", ")})`)

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
      interimDecision: "이 마일스톤은 손대지 않고 다음으로 넘어갔다. 해당 todo 항목은 미처리로 남는다.",
      source: `plan:${m.id}`,
    })
    report.push({ milestone: m.id, status: "planner-failed", todo: m.todo })
    quarantined.push(m.id) // 후속 마일스톤이 의존성 부재를 알 수 있도록
    continue // 멈추지 않는다
  }
  collect(plan, `plan:${m.id}`)
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
    log(`  ⚠ ${m.id} 게이트 실패 — 작업을 stash로 격리하고 다음 마일스톤으로 계속한다`)
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
      title: `${m.id} 게이트 실패 — 격리됨 (todo ${m.todo.join(", ")} 미해소)`,
      context: `실패: ${reason}`,
      interimDecision: DO_COMMIT
        ? `작업을 git stash("wf-quarantine-${m.id}")로 보존하고 브랜치를 마지막 초록 커밋으로 되돌린 뒤 계속 진행했다. 복구: git stash apply <ref>.`
        : "commit:false 모드라 격리하지 않았다 — 작업 트리에 빨간 변경이 남아 있을 수 있다.",
      source: `gate:${m.id}`,
    })
  }

  report.push({
    milestone: m.id,
    todo: m.todo,
    decisions: m.dec,
    plan: { units: plan.units.map((u) => u.title), notes: plan.notes },
    units: unitResults.map((r) => ({ unit: r.unit, status: r.status })),
    designVerify: verify,
    gates: { green: gate.green, attempts: gate.attempts, note: gate.note, failures: gate.failures },
    specChanges: gate.appliedSpecChanges,
    commit: commit ? { sha: commit.sha, committed: commit.committed } : null,
    quarantine: quarantine ? { clean: quarantine.clean, stashRef: quarantine.stashRef } : null,
  })

  // 마일스톤마다 보류 문서를 갱신한다 (중간에 죽어도 기록이 남도록)
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
  `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 리팩터링의 마무리 점검을 하라. **읽기 전용 — 코드를 수정하지 마라.**

[실행된 마일스톤] ${ranIds || "(없음)"}
[격리된 마일스톤] ${quarantined.length ? quarantined.join(", ") : "(없음)"}

1) todo 커버리지 대조: temp/todo.md의 §2 작업 목록에 있는 **모든 항목**(B1~B8, C1~C5, D1~D2, E1~E10)에 대해, 현재 코드/커밋 기준으로 처리 상태를 판정하라.
   - done: 실제로 코드가 바뀌어 해소됨 (근거 파일/커밋)
   - verified-no-change: 확인 결과 코드 변경이 불필요했음 (이미 정합, 또는 "현상 유지"로 결정된 항목)
   - deferred: 이번 실행 범위 밖 (A1 머지 결정, 실행되지 않은/격리된 마일스톤의 항목)
   - not-covered: 다뤄졌어야 하는데 누락됨 ← 있으면 note에 분명히 남겨라
   git log --oneline 으로 이번 브랜치의 커밋을 확인하고, 필요하면 해당 파일을 직접 읽어 판정하라. 추측하지 말 것.

2) 잔여 raw hex 스캔:
   grep -rnE '#[0-9a-fA-F]{3,8}\\b' src --include='*.ts' --include='*.tsx' --include='*.css'
   실행 후 src/theme.ts 와 *.test.* 는 제외하고 집계하라. "정당한 잔여물"(주석 속 디자인 참조값, README §도메인 규칙이 인정한 ErrorBoundary 크래시 폴백 예외 등)과 "미처리 잔여물"을 구분해 요약하라.

3) 번들 사이즈 참고 측정 (게이트 아님 — 실패해도 무방):
   npm run build && npm run size:check 를 timeout 600000ms로 실행하고 js 번들 KiB를 bundleKiB에 담아라.
   ⚠ CI 한도는 385 KiB이고 직전 측정이 379.58 KiB라 여유가 매우 적다. 한도를 넘더라도 **scripts/check-bundle-size.mjs를 수정하지 마라** — 한도 상향은 사용자 승인 사항이다. 넘었으면 그 사실만 summary에 보고하라 (그리고 이는 ${FOLLOWUP_DOC}의 사용자 판단 항목이 된다).
   (로컬 Node 버전이 CI(.nvmrc = 22)와 다르면 gzip 크기가 조금 달라질 수 있다 — 그 사실도 함께 적어라.)`,
  { label: "coverage-scan", model: IMPL_MODEL, effort: "low", schema: COVERAGE_SCHEMA },
)

return {
  branch: BRANCH,
  handoff: "v1.1 (design/CHANGELOG.md — D1~D21)",
  allowSpecUpdates: ALLOW_SPEC_UPDATES,
  milestones: report,
  quarantined,
  followupDoc: {
    path: FOLLOWUP_DOC,
    written: doc ? doc.written : false,
    itemCount: doc ? doc.itemCount : followups.length,
  },
  todoCoverage: coverage ? coverage.items : "coverage scan failed",
  residualHex: coverage
    ? { count: coverage.residualHexCount, summary: coverage.residualHexSummary }
    : { count: -1, summary: "scan failed" },
  bundleKiB: coverage ? coverage.bundleKiB : -1,
  note: `자율 완주 모드 — 사용자 확인 없이 끝까지 진행했다. 판단이 필요한 항목은 ${FOLLOWUP_DOC} 에 정리돼 있다. 번들 사이즈(CI 한도 385 KiB)는 게이트가 아니므로 PR CI에서 최종 확인할 것. temp/todo.md A1(main 머지/PR)은 사용자 결정 사항이다.`,
}
