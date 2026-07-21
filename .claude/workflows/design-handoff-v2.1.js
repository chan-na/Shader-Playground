export const meta = {
  name: "design-handoff-v2-1",
  description:
    "디자인 핸드오프 v2.1(X1~X17 + Y1~Y2) 코드 반영. v2.0 구현의 잠정 결정 확정 라운드 — breaking 아님, 소형 배치. 대부분 '현행 승인'(코드 변경 0, 검증만) + 실제 코드 작업 6건(X2/X10/X12/X13/X14/X17). 배치 직렬 체인, 각 배치 게이트 green 후 커밋. 자율 완주.",
  whenToUse:
    "design/ 번들 v2.1(8fd9d6c + fix 6de4272)의 디자이너 정본을 코드에 반영할 때. 사용자에게 묻지 않고 끝까지 진행하며, 판단 필요 항목은 temp/design-followup-v2.1.md에 모은다. 근거는 temp/design-request-v2.1.md · temp/design-request-v2.1-fix.md · design/CHANGELOG.md §v2.1. args: { only?: ['B1'...], branch?, allowSpecUpdates?: bool, commit?: bool }",
  phases: [
    { title: "Setup", detail: "브랜치 · v2.1 번들 확인 · 베이스라인 게이트" },
    {
      title: "B1 Diag",
      detail:
        "진단 스트립 단일화 — 2×2 메트릭 카드 제거(X12) + 오버레이 배경 surface.rail(X10). X13-diag는 카드와 함께 소멸",
    },
    {
      title: "B2 Tokens",
      detail:
        "토큰/스타일 기계적 — index.css 라벨색 →accent-bright(X13) + skeletonStatus→floatingPill 개명(X14, 값 불변)",
    },
    {
      title: "B3 Auto-open",
      detail:
        "자동열기 UX — 토글 라벨 Auto: ON/OFF + nowrap(X2) + ⌘K 팔레트 'Toggle Code auto-open' 명령(X2 도달성)",
    },
    {
      title: "B4 Rail",
      detail:
        "접힌 34px 레일 인테리어(X17) — grip+dot+세로 라벨+에러 dot+위치 chevron. 유일한 신규 UI",
    },
    { title: "Report", detail: "X1~X17·Y1~Y2 커버리지 · 잔여 hex · 번들(참고, 한도 393)" },
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
const HANDOFF = "v2.1"
const BUNDLE_LIMIT = 393 // KiB — v1.4에서 385→393 상향(사용자 sign-off). 게이트 아님(CI 잡). v2.0 실측 389.23/393.

const FOLLOWUP_DOC = "temp/design-followup-v2.1.md"

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
const BRANCH = A.branch || "design/handoff-v2.1"
const ONLY = Array.isArray(A.only) ? A.only : null
// v2.1은 대부분 forbid(E2E-invisible)다. 유일하게 B4(레일 인테리어)만 정당한 강화 여지 有.
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
  1) 되돌리기 쉬운 **잠정 결정**으로 진행한다 (우선순위: 정본/기존 패턴 근사 → 현행 유지 + 사유 주석 → 최소 변경).
  2) followups에 기록한다 (audience: 'user' | 'designer', 무엇을 왜 잠정 결정했는지 + 정식 결정 시 바꿀 위치).
- followups는 ${FOLLOWUP_DOC} 로 취합된다. 기록하면 그 항목은 "처리된 것"이다 — 다시 막히지 마라.

[⛔ 장시간 명령 실행 규칙 — 이 규칙 위반이 실제로 v2.0 워크플로우를 두 번 죽였다]
- **오래 걸리는 명령(npm run check, npm run test:e2e, npx playwright/vitest)을 백그라운드(run_in_background)로 띄워놓고 완료 알림을 기다리며 턴을 끝내지 마라.** 너는 워크플로우 서브에이전트다 — 백그라운드 완료 알림으로 다시 깨워주지 않는다. 기다리면 그대로 죽고 네 작업 전체가 유실된다.
- 장시간 명령은 **반드시 포그라운드에서 timeout을 크게(최대 600000ms) 잡고** 실행하라. 그래도 초과가 우려되면 파일 단위로 쪼개 각각 포그라운드로 돌려라(임의 생략 금지). "돌려놓고 다른 일 하기"는 금지다.
- 유일한 예외: dev 서버(npm run dev)처럼 **종료를 기다리지 않는** 상주 프로세스만 백그라운드 허용.
- 시스템이 StructuredOutput 호출을 요구하면 **그 즉시 호출하라.** 증거가 아직 불완전하면 "무엇이 미확인인지"를 결과에 명시하고(예: pass:false + 사유, 또는 summary에 미확인 항목) 반환하라 — 알림을 기다리는 선택지는 존재하지 않는다.`

const CONSTRAINTS = `
[품질 제약 — CLAUDE.md, 위반 금지]
- TypeScript strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes. any / as-unknown-as 캐스팅 우회 금지.
- Biome warn 0건 유지. **새 biome-ignore 추가 금지** — 리팩터로 해소하라. 불가하면 followups(audience:'user')에 기록 후 현행 유지.
- Knip 0건: 새 export는 같은 변경 안에서 실제 호출자/임포터를 함께 연결. 고아 export 금지. **삭제(X12 카드) 시 그 export/타입/테스트가 고아로 남지 않게 소비처까지 함께 제거하라.**
- 순환 의존성 0건: store끼리 직접 상호 import 금지 (단방향 selector/subscribe만).
- 커버리지 임계(lines 50 / functions 47 / branches 42 / statements 50) 하락 금지. **X12로 카드+전용 테스트를 지우면 커버리지가 흔들릴 수 있다 — 스트립/헬퍼 테스트가 값 경로를 계속 덮는지 확인하고, 필요하면 스트립 쪽 테스트를 보강하라.**
- 게이트 설정 파일(tsconfig/biome.json/knip.json/vitest.config.ts/scripts/check-bundle-size.mjs) **완화 금지**. vitest coverage.exclude에 신규 파일 추가 금지.

[토큰 규칙 — v2.1은 신규 토큰 0 · 값 변경 0]
- **신규 토큰을 절대 추가하지 마라.** v2.1의 유일한 토큰 정의 변경은 **X14 개명**이다: \`radius.skeletonStatus → radius.floatingPill\`, \`shadow.skeletonStatus → shadow.floatingPill\` (src/theme.ts). **값은 절대 불변**(radius 10 · shadow "0 8px 24px rgba(0,0,0,0.5)"). cssVars()가 kebab으로 \`--radius-floating-pill\` / \`--shadow-floating-pill\`를 자동 emit한다.
- 개명은 **참조를 전부 함께** 갱신해야 한다: theme.ts 키 2곳 + CSS var 소비처(index.css의 \`var(--radius-skeleton-status)\`·\`var(--shadow-skeleton-status)\`) + 관련 주석. **하나라도 놓치면 런타임에 CSS var가 미정의(무효)가 되어 pill 스타일이 깨진다** — grep으로 \`skeleton-status\`/\`skeletonStatus\` 잔재 0을 확인하라.
- **기존 토큰 값은 절대 변경 금지.** src/theme.ts를 통째로 덮어쓰지 마라 — design/theme.ts(디자이너 정본)와 src/theme.ts(런타임 정본, **상위집합**)는 둘 다 유지된다. src의 구현 파생 항목(tokens 내부 키 nodeCardSolid·emptyStateIcon·cardLg·modal·thumbnailInset·onCanvasText·overlayBar·shadow.modal + named export withAlpha·cssVars)이 소실되면 안 된다(v1.1 덮어쓰기 실사고).
- **X13은 값이 아니라 소비처 교체**다: index.css의 라벨색 \`var(--accent-hover)\` → \`var(--accent-bright)\` — **"dc 라벨색 #7dbcff" 주석이 붙은 그 한 줄만.** 다른 \`--accent-hover\`(hover 상태)는 절대 건드리지 마라. ⚠ X13의 DiagnosticsPanel 반쪽(#34d399→--success-bright)은 **X12가 카드를 지우면서 소멸**한다(KNOWN_FACTS 참조) — 되살리려 하지 마라.
- 색·radius·shadow·모션은 src/theme.ts의 tokens.* 또는 var(--*)만 사용. 컴포넌트에 raw hex 직접 금지. canvas 2D API는 CSS 변수를 못 읽으므로 그 경우만 tokens.* 직접 import.
- 예외: ErrorBoundary 크래시 폴백 + src/export/standalonePlayer.js 폴백은 **의도적으로 토큰 비의존**. 토큰화 강행 금지.
${
  ALLOW_SPEC_UPDATES
    ? `
[E2E 스펙 정책 — v2.1은 breaking이 아니라 대부분 E2E-invisible이다]
tests/e2e/** 수정은 **원칙적으로 최소화**한다. v2.1의 실제 코드 변경은 대부분 E2E에 영향이 없어야 정상이다:
- X2 라벨 개명: m7은 토글을 \`getByTestId("code-auto-open-toggle")\`로 잡는다(라벨 텍스트 단언 아님) → **라벨 개명은 E2E-invisible.** 깨지면 회귀다.
- X10/X13/X14: 색·토큰 개명 → E2E는 색을 단언하지 않음 → 무영향.
- X12: 2×2 카드는 렌더 호스트가 없어 E2E가 단언하지 않음(오버레이 스트립만 단언) → 무영향.
스펙 수정이 허용되는 **유일한 경우는 B4(X17 레일 인테리어)**다 — 접힌 레일에 처음으로 인테리어가 생기므로, 그 존재(세로 라벨/에러 dot)를 **추가로 단언**하는 강화는 정당하다. 단 **레일 폭(34px)·접힘 메커니즘·기존 expect는 절대 약화/삭제/skip/fixme 금지.** 스펙을 손댔다면 파일·테스트명·사유를 summary와 followups(audience:'user')에 남겨라.`
    : `
[E2E 스펙 정책]
tests/e2e/** 수정 금지 — 코드 쪽에서 해결하고, 불가하면 followups(audience:'user')에 기록 후 진행하라. (allowSpecUpdates:false 모드)`
}

[번들]
- 번들 사이즈 가드(${BUNDLE_LIMIT} KiB)는 CI 잡이며 이 워크플로우의 게이트가 아니다. v2.0 실측 389.23/393로 여유 ~3.8 KiB. v2.1은 X12(카드 제거=감소)와 X17(레일 인테리어=소폭 증가)이 상쇄될 것으로 예상되나, 초과하더라도 **scripts/check-bundle-size.mjs를 절대 수정하지 마라** — 한도 상향은 사용자 승인 사항이다. 초과가 보이면 followups(audience:'user')에 기록.

[진행]
- 커밋하지 마라 — 커밋은 워크플로우가 별도 단계에서 수행한다.
- 마무리 전 자가 검증: npx tsc --noEmit, 그리고 수정 파일에 npx biome check --write.
${AUTONOMY}`

// ─────────────────────────────────────────────────────────────────────────────
// ⛔ 전 배치 공통 — v2.1 정본 사실 (이 세션의 코드 조사로 확정. 재조사로 헤매지 마라)
//    ⚠ CHANGELOG/요청서의 file:line은 v2.0 시점 값이라 드리프트했다 — 아래가 실측 정본이다.
// ─────────────────────────────────────────────────────────────────────────────
const KNOWN_FACTS = `
[⛔ v2.1 반영 — 이미 확인된 정본 사실 (재조사 불필요, 실측 line은 아래를 신뢰하라)]
⚠ **성격**: v2.1은 v2.0 구현(PR #72, main 머지 \`3d9168f\`)이 dc/CHANGELOG 미정의 코너에서 내린 **잠정 결정을 디자이너가 확정**한 라운드다. X1~X17 응답의 **대부분은 "현행 승인"** = 이미 코드에 있으니 **코드 변경 없이 "일치 검증"만** 하면 된다. 실제 코드 작업은 **X2·X10·X12·X13·X14·X17 6건**뿐이다. Y1·Y2는 **디자이너가 design/Side Panel.dc.html에서 이미 처리**(\`6de4272\`)했으므로 **코드 작업 없음**(App Shell 상태바 오버레이가 정본, Side Panel은 inspector·assets 2탭).

[X12 ⇄ X13 상호작용 — 반드시 이 순서/해석을 지켜라]
- **X13의 "DiagnosticsPanel.tsx 값색 → --success-bright"는 X12가 지우는 2×2 카드 안에 있다.** \`src/ui/Panels/DiagnosticsPanel.tsx\`의 \`variant==="full"\` 카드 분기 안 \`metrics\` 배열(Frame 항목 \`color:"var(--success)"\`, "#6fe3b8 → semantic.success 근사" 주석)이 그 위치다.
- **살아남는 스트립(\`DiagnosticsMetricStrip.tsx\`)은 값에 per-value 색을 안 준다** — 전체가 \`color:var(--text-secondary)\`, 라벨만 \`--text-muted\`. 즉 카드를 지우면 \`--success\` 근사 자체가 소멸하고, **--success-bright를 새로 꽂을 소비처가 diagnostics에 없다.**
- 따라서: **X12(카드 제거) 후 X13은 index.css 라벨색 한 줄로 축소된다.** DiagnosticsPanel에 --success-bright를 억지로 넣거나 카드를 보존하려 하지 마라. 이 소멸은 정상이며 coverage/followup에 "X13-diag는 X12로 subsume"으로 기록.

[X12 — 2×2 메트릭 카드 제거 (진단 스트립 단일화)]
- \`src/ui/Panels/DiagnosticsPanel.tsx\`: \`variant==="full"\` 분기가 \`data-testid="diagnostics-metric-cards"\` 그리드(2×2)를 렌더한다. 프로덕션 호스트는 없다 — \`StatusOverlays.tsx:71\`은 \`<DiagnosticsPanel variant="overlay" />\`만 쓴다. "full"은 테스트만 소비. → **"full" 카드 분기 + 로컬 \`metrics\` 배열 제거, \`variant\` prop 단순화**(overlay 단일 경로면 prop 자체를 없앨 수 있는지 검토 — 단 다른 소비처 확인 후).
- **삭제할 테스트**: \`DiagnosticsPanel.test.tsx\`의 "renders the 2x2 metric cards ...(variant='full')"·"suppresses ...(variant='overlay')" 등 카드 전용 케이스 · \`StatusOverlays.test.tsx\`의 "shows the metric strip and suppresses the 2x2 cards" 중 카드 억제 단언(스트립 존재 단언은 유지) · \`DiagnosticsMetricStrip.test.tsx\`의 "same source as the 2x2 cards" 문구는 카드 소멸에 맞게 정리(값 소스 동일성 단언 자체는 유지).
- **공유 헬퍼는 보존**: \`src/ui/Panels/diagnosticsTab.ts\`의 \`frameMetricValue\`·\`linkedProgramsValue\`·\`diagnosticsMetricValues\`는 스트립이 계속 쓴다 — 지우지 마라.

[X10 — 진단 오버레이 배경]
- \`src/index.css\`의 \`.status-overlay\`(현재 ~L1599) 배경이 \`var(--surface-panel)\`("dc L210 #0d0f12 근사" 주석) → **\`var(--surface-rail)\`로 교체 + 주석 갱신**(dc L405 #0f1114 = surface.rail 정확 일치, rail 톤 통일 의도). \`--surface-rail\`은 theme.ts:32 \`rail:"#0f1114"\`에서 cssVars가 emit — 신규 아님. 스트립은 배경 미지정(부모 상속)이라 본문=스트립 동일 bg 관계 자동 보존.

[X13 — index.css 라벨색 (소비처 교체, 값 아님)]
- \`src/index.css\` **~L372** \`color: var(--accent-hover);\` — 바로 위 ~L370 "dc 라벨색 #7dbcff는 무토큰 — accent.hover(#57a9ff)로 근사" 주석이 붙은 **딱 그 한 줄** → \`var(--accent-bright)\`로 교체 + stale 주석 갱신(#7dbcff = accent.bright S26 정본). **다른 \`--accent-hover\` 사용처(~L825/957/1044 등 hover 상태)는 절대 건드리지 마라.**

[X14 — skeletonStatus → floatingPill 개명 (값 불변)]
- \`src/theme.ts\`: **:177** \`skeletonStatus: 10\`(radius) · **:203** \`skeletonStatus: "0 8px 24px rgba(0,0,0,0.5)"\`(shadow) → 키명 \`floatingPill\`. 값·주석 의미 유지(주석은 "캔버스 플로팅 필 (그래프 스켈레톤 상태 + add-node pill 공용) [B-6·X14]"로).
- cssVars()는 kebab 자동 변환(theme.ts:268 radius / :273 shadow)이라 \`--radius-floating-pill\`·\`--shadow-floating-pill\`를 자동 emit. **CSS var 소비처를 함께 갱신**: \`src/index.css\` \`var(--radius-skeleton-status)\`(~L3501·L3555)·\`var(--shadow-skeleton-status)\`(~L3507) → \`-floating-pill\`. 주석 잔재(~L3499/3505/3524/3526/3528/3429 · theme 주석)도 갱신.
- 소비 컴포넌트는 \`.graph-skeleton-status\`(GraphSkeleton.tsx) + add-node pill CSS. **CSS 클래스명(.graph-skeleton-status)은 바꾸지 마라** — 개명 대상은 토큰(var)뿐이다. grep으로 \`skeleton-status\`(CSS var)와 \`skeletonStatus\`(TS 키) 잔재 0 확인.

[X2 — Auto-open 토글 라벨 + 팔레트 명령]
- \`src/ui/CodeEditor/AutoOpenToggle.tsx:28\` \`{autoCode ? "Auto-open: ON" : "Auto-open: OFF"}\` → **"Auto: ON" / "Auto: OFF"** + \`white-space:nowrap\`(34px·0 12px 스테이지 스트립에서 안 넘침). 극한 폭(vertex+fragment 동시 에러 dot 2개)에서만 ellipsis. aria/title 문구(:7-10)는 의미 유지.
- \`src/ui/CodeEditor/AutoOpenToggle.test.tsx:25/35/46\`이 \`textContent\`로 "Auto-open: ON/OFF"를 단언 → **"Auto: ON/OFF"로 갱신**(의도된 라벨 변경 반영, 약화 아님).
- **팔레트 명령 신설**(X2 도달성): \`src/ui/CommandPalette/helpers.ts\`(buildCommands)에 "Toggle Code auto-open" 명령 추가 → editorStore의 autoCode 토글 액션 호출(기존 토글이 쓰는 setter 재사용, 새 전역 만들지 마라). dc \`Command Palette.dc.html\`의 \`C("◉","Toggle Code auto-open",[],"...")\` 정본 참조. \`CommandPalette.test.tsx\`/\`helpers.test.ts\`에 명령 존재 단언 추가.
- ⚠ E2E m7은 testid로 토글을 잡으므로 라벨 개명은 무영향. 팔레트 명령 추가가 팔레트 E2E의 명령 개수 단언을 건드리면 그건 **강화(추가)**로 갱신.

[X17 — 접힌 34px 레일 인테리어 (유일한 신규 UI)]
- \`src/ui/DockPanelHeader.tsx\`: \`collapsed && railCapable\` → \`isRail\`(:103), \`<div className="dock-header--rail">\`(:111). 현재 rail은 grip+chevron 크롬만. **인테리어 추가**: ⣿ grip + 패널 색 dot + **세로 라벨**(writing-mode vertical, "제목 · 메타" 예 "Code · GLSL") + (에러 시) 빨강 에러 dot + 위치 기반 펼침 chevron. **범용 규칙** — code 전용이 아니라 모든 rail-collapsed leaf에 적용(라벨=패널 kind 메타, 에러 dot은 code만).
- 패널 kind/제목·메타 = \`src/ui/dockLayoutModel.ts\`(leafPanelKind + META류) · 색 dot = 기존 도킹 헤더 색 dot 소스 재사용. **에러 dot 소스 = \`src/state/diagnosticsStore.ts\` byNode**(code 노드 컴파일 에러 유무). 위치 chevron = 이미 있는 \`collapseChevron\`/DockPanelHeader 로직 재사용(신규 방향 계산 만들지 마라).
- CSS: \`src/index.css\` \`.dock-header--rail\`(~L422 근처, v2.0에서 정의됨) 확장. writing-mode·정렬은 dc \`App Shell.dc.html\`의 접힘 레일 오버레이 정본 참조.
- **V2 불변식 유지**: 접힘 메커니즘(34px 폭·부모 dir 파생·divider 비활성)은 기존 로직 그대로 — 새 접힘 분기를 만들지 마라. 인테리어는 rail div **안의 렌더**만 추가.
- 접힘 상태 인테리어 단위 테스트 추가(세로 라벨 존재 · code 에러 시 dot 표시 · 비-code는 에러 dot 없음).

[일치 검증만 필요한 "현행 승인" 항목 — 코드 변경 금지, 드리프트만 followup]
- **X1**(\`src/state/codeAutoOpen.ts\`: kind === "shader" || "compute" — 이미 그러함, :20-21) · **X3**(자동접기 × 최대화: 접히는 leaf 자신 최대화 시만 해제 — \`src/state/dockStore.ts\` setCollapsed) · **X4**(autoCode 비영속 — editorStore, autoSave 미연결) · **X5**(T1 center 폴백 zone:right 60/40 — dockTree insertDetachedLeaf) · **X6**(＋Panel in-order 첫 canMerge 병합) · **X7**(＋More = ⌘K 팔레트 오픈 — AddNodePill) · **X8**(File ▾ 메뉴 = Load/Import/Export/Snap — AppToolbar) · **X9**(pill z-index 11) · **X11**(스트립=카드 동일 소스, 라벨 "Draws" — diagnosticsTab) · **X15**(스테이지 스트립 34px·0 12px, active accent border-top 2px) · **X16**(dc 죽은 코드 — 코드 무관).
- 이들은 **이미 구현돼 있어야** 정상이다. 검증 중 정본과 다르면 그건 회귀 신호 — followup(audience:'user')에 기록하되 임의 재작성 말고 최소 정정.`

// ─────────────────────────────────────────────────────────────────────────────
// 배치 정의 (v2.0의 마일스톤과 동형)
//   items        = 이 배치가 반영하는 요청 ID (X/Y)
//   dependsOn    = 선행 배치 (격리되면 의존 유닛 제외)
//   parallelUnits= true면 유닛 동시 실행 (파일 disjoint 전제)
//   specPolicy   = 'forbid'면 이 배치에선 E2E 스펙 수정 금지 (E2E 영향 없어야 정상)
// ─────────────────────────────────────────────────────────────────────────────
const MILESTONES = [
  {
    id: "B1",
    phase: "B1 Diag",
    items: ["X12", "X10", "X11-verify", "X13-diag(subsumed)"],
    dependsOn: [],
    parallelUnits: false,
    goal: `진단 오버레이 정리 — 2×2 메트릭 카드 제거(X12) + 오버레이 배경 통일(X10).
(a) [X12] \`DiagnosticsPanel.tsx\`의 \`variant==="full"\` 2×2 카드 분기 + 로컬 \`metrics\` 배열 제거, \`variant\` prop 단순화(overlay 단일 경로). 오버레이 메트릭 스트립(\`DiagnosticsMetricStrip\`)이 유일 경로로 확정. **공유 헬퍼 diagnosticsTab.ts는 보존**(스트립이 계속 씀).
(b) [X12 테스트] 카드 전용 단위 테스트 제거(DiagnosticsPanel.test.tsx 카드 케이스 · StatusOverlays.test.tsx 카드 억제 단언). **스트립 존재/값-소스 동일성 단언은 유지·필요시 보강**해 커버리지 유지.
(c) [X10] \`.status-overlay\` 배경 \`var(--surface-panel)\` → \`var(--surface-rail)\` + 주석 갱신(1줄).
(d) [X13-diag] Frame 값색 --success 근사는 (a)로 카드와 함께 **소멸** — 되살리지 말 것. coverage에 "X12로 subsume" 기록.
E2E는 무영향이 정상(카드는 렌더 호스트 없음, 오버레이 색은 미단언) → specPolicy forbid.`,
    design: [
      "design/CHANGELOG.md (§v2.1 D. X10·X11·X12 · G. Y2)",
      "design/README.md (§M problems/diagnostics — 오버레이 bg surface.rail · 스트립 유일 경로 · 카드 제거)",
      "design/App Shell.dc.html (진단 오버레이 본문/스트립 bg #0f1114 = surface.rail · ~26px 스트립)",
      "design/Side Panel.dc.html (Y1 정정본 — inspector·assets 2탭, diagStats/카드 제거됨)",
    ],
    screens: ["design/screens/05-side-panel.png"],
    hints: [
      "src/ui/Panels/DiagnosticsPanel.tsx — variant==='full' 카드 그리드(data-testid=diagnostics-metric-cards) + 로컬 metrics 배열(Frame color var(--success))",
      "src/ui/Panels/StatusOverlays.tsx:71 <DiagnosticsPanel variant='overlay' /> (유일 프로덕션 호스트) · DiagnosticsMetricStrip 삽입 지점",
      "src/ui/Panels/DiagnosticsMetricStrip.tsx (per-value 색 없음, 라벨 --text-muted) · diagnosticsTab.ts(공유 헬퍼, 보존)",
      "src/index.css:~1599 .status-overlay { background: var(--surface-panel) } · theme.ts:32 rail(#0f1114)→--surface-rail",
      "테스트: DiagnosticsPanel.test.tsx(카드 케이스) · StatusOverlays.test.tsx(카드 억제) · DiagnosticsMetricStrip.test.tsx",
    ],
    checks: [
      "variant==='full' 2×2 카드 분기와 로컬 metrics 배열이 제거됐고, 오버레이 스트립이 유일 메트릭 경로인지",
      "diagnosticsTab.ts 공유 헬퍼(frameMetricValue/linkedProgramsValue/diagnosticsMetricValues)가 보존됐고 스트립이 계속 소비하는지",
      "카드 전용 테스트가 제거됐고 커버리지 임계가 유지되는지(스트립/헬퍼 테스트가 값 경로를 덮는지)",
      ".status-overlay 배경이 var(--surface-rail)로 바뀌고 주석이 갱신됐는지 · 스트립이 동일 bg를 상속하는지",
      "X13-diag(--success-bright)가 카드 소멸로 subsume됐고, DiagnosticsPanel에 --success-bright를 억지로 넣지 않았는지",
      "knip 고아 0 · 순환 0 · E2E 무영향(카드 미단언)인지",
    ],
    specPolicy: "forbid",
  },
  {
    id: "B2",
    phase: "B2 Tokens",
    items: ["X13-label", "X14"],
    dependsOn: [],
    parallelUnits: false,
    goal: `토큰/스타일 기계적 변경 — 값 변경 0, 신규 토큰 0.
(a) [X13-label] \`src/index.css\` "dc 라벨색 #7dbcff" 주석이 붙은 \`color: var(--accent-hover)\` 한 줄 → \`var(--accent-bright)\` + 주석 갱신. **다른 --accent-hover(hover 상태)는 불가침.**
(b) [X14] \`src/theme.ts\` radius/shadow.\`skeletonStatus\` → \`floatingPill\` 개명(값 불변) + 주석 갱신. cssVars 자동 kebab emit(--radius-floating-pill/--shadow-floating-pill). CSS var 소비처(index.css var(--radius-skeleton-status)×2·var(--shadow-skeleton-status)×1) + 주석 잔재 전부 갱신. **CSS 클래스명 .graph-skeleton-status는 불변**(토큰만 개명).
(c) grep으로 \`skeleton-status\`(var)·\`skeletonStatus\`(키) 잔재 0 확인 — 놓치면 CSS var 미정의로 pill 스타일 파손.
E2E는 색·토큰 개명이라 무영향 → specPolicy forbid.`,
    design: [
      "design/CHANGELOG.md (§v2.1 E. X13·X14)",
      "design/README.md (§토큰 — radius.skeletonStatus→floatingPill(그래프 스켈레톤 + add-node pill 공용))",
      "design/theme.ts (radius.floatingPill:? · shadow.floatingPill:? · 값 불변 — 개명 정본)",
    ],
    screens: [],
    hints: [
      "src/index.css:~370-372 'dc 라벨색 #7dbcff' 주석 + color:var(--accent-hover) (딱 이 한 줄만)",
      "src/theme.ts:177 skeletonStatus(radius 10) · :203 skeletonStatus(shadow) · :243-273 cssVars(kebab emit)",
      "src/index.css:3487 .graph-skeleton-status / :3501·3555 var(--radius-skeleton-status) / :3507 var(--shadow-skeleton-status) / 3499·3505·3524·3526·3528 주석",
      "src/theme.test.ts(있으면) — 토큰 존재/이름 스냅샷",
    ],
    checks: [
      "index.css 라벨색이 딱 그 한 줄만 var(--accent-bright)로 바뀌었고 다른 --accent-hover는 불변인지",
      "theme.ts radius/shadow가 floatingPill로 개명됐고 값(10 / '0 8px 24px rgba(0,0,0,0.5)')이 불변인지",
      "cssVars가 --radius-floating-pill/--shadow-floating-pill를 emit하고, index.css의 var() 소비처가 전부 갱신됐는지",
      "grep 'skeleton-status'/'skeletonStatus' 잔재 0(CSS 클래스 .graph-skeleton-status 제외)인지",
      "기존 토큰 값·구현 파생 export(withAlpha·cssVars·tokens 내부 키)가 소실 안 됐는지 · 신규 토큰 0인지",
    ],
    specPolicy: "forbid",
  },
  {
    id: "B3",
    phase: "B3 Auto-open",
    items: ["X2"],
    dependsOn: [],
    parallelUnits: false,
    goal: `자동열기(W5) 후속 UX — 라벨 단축 + 도달성 명령(X2).
(a) [라벨] \`AutoOpenToggle.tsx:28\` "Auto-open: ON/OFF" → "Auto: ON/OFF" + \`white-space:nowrap\`. 극한 폭(에러 dot 2개)에서만 ellipsis. aria/title 의미 유지. \`AutoOpenToggle.test.tsx\`의 textContent 단언을 새 라벨로 갱신(약화 아님).
(b) [팔레트 명령] \`CommandPalette/helpers.ts\` buildCommands에 "Toggle Code auto-open" 명령 추가 → editorStore autoCode 토글 setter 재사용(새 전역 금지). dc Command Palette.dc.html 정본 참조. CommandPalette.test.tsx/helpers.test.ts에 명령 존재 단언 추가.
E2E m7은 testid로 토글을 잡아 라벨 개명 무영향 → specPolicy forbid. 팔레트 명령 추가가 E2E 명령-개수 단언을 건드리면 강화(추가)로.`,
    design: [
      "design/CHANGELOG.md (§v2.1 A. X2)",
      "design/README.md (§A Code 자동 접기 — 라벨 규칙 X2 · 도달성 ⌘K 명령)",
      "design/App Shell.dc.html (Auto: ON/OFF 토글 nowrap) · design/Command Palette.dc.html (Toggle Code auto-open)",
    ],
    screens: [],
    hints: [
      "src/ui/CodeEditor/AutoOpenToggle.tsx:28 라벨 · :7-10 aria/title · AutoOpenToggle.test.tsx:25/35/46 textContent 단언",
      "src/ui/CommandPalette/helpers.ts buildCommands(명령 등록) / index.tsx / CommandPalette.test.tsx · helpers.test.ts",
      "src/state/editorStore(autoCode 토글 setter — 토글 버튼이 쓰는 액션 재사용) · codeAutoOpen.ts",
      "tests/e2e/m7-code-auto-open.spec.ts:151/179 getByTestId('code-auto-open-toggle') (라벨 텍스트 미단언 — 개명 무영향 근거)",
    ],
    checks: [
      "토글 라벨이 'Auto: ON'/'Auto: OFF' + nowrap인지 · AutoOpenToggle.test.tsx가 새 라벨로 갱신됐는지",
      "⌘K 팔레트에 'Toggle Code auto-open' 명령이 있고 autoCode를 토글하는지(기존 setter 재사용)",
      "E2E m7이 무수정 통과(testid 사용)인지 · 팔레트 E2E가 있으면 강화 방향인지",
      "새 명령의 export/소비가 knip 고아를 만들지 않는지 · 단위 테스트가 명령을 덮는지",
    ],
    specPolicy: "forbid",
  },
  {
    id: "B4",
    phase: "B4 Rail",
    items: ["X17"],
    dependsOn: [],
    parallelUnits: false,
    goal: `접힌 34px 레일 인테리어 정식 채택(X17-b) — v2.1 유일의 신규 UI.
- \`DockPanelHeader.tsx\`의 \`isRail\` 렌더(현재 grip+chevron 크롬만)에 인테리어 추가: **⣿ grip + 패널 색 dot + 세로 라벨(writing-mode vertical, "제목 · 메타") + (에러 시) 빨강 에러 dot + 위치 기반 펼침 chevron**. **범용 규칙**: 모든 rail-collapsed leaf에 적용(라벨=패널 kind 메타), **에러 dot은 code leaf만**(소스 diagnosticsStore byNode의 code 컴파일 에러).
- **V2 불변식 준수**: 접힘 메커니즘(34px 폭·부모 dir 파생·divider 비활성)은 기존 로직 그대로 — 새 접힘 분기 금지. 인테리어는 rail div **안의 렌더만** 추가. 위치 chevron 방향은 기존 로직 재사용.
- CSS \`.dock-header--rail\` 확장(writing-mode·정렬·dot·라벨). dc App Shell 접힘 레일 오버레이 정본 참조. hex 직접 금지 — 라벨/에러 dot 색은 대응 토큰(text 계열·error·색 dot)만.
- 단위 테스트: 세로 라벨 존재 · code 에러 시 에러 dot · 비-code는 에러 dot 없음 · 접힘 폭/메커니즘 불변.
- 접힌 레일에 처음으로 인테리어가 생기므로 E2E(m5-dock-chrome/m1)에 그 존재를 **추가 단언**하는 강화는 정당(폭·메커니즘·기존 expect 불가침).`,
    design: [
      "design/CHANGELOG.md (§v2.1 F. X17 — 접힌 레일 인테리어 정식 채택 · G. Y1 railLabel 범용 규칙)",
      "design/README.md (§M 접기/최대화 R4 — 접힌 34px 레일 인테리어)",
      "design/App Shell.dc.html (접힘 leaf 34px 세로 레일 오버레이: grip+dot+세로 라벨+에러 dot+펼침 chevron)",
    ],
    screens: ["design/screens/01-app-shell.png"],
    hints: [
      "src/ui/DockPanelHeader.tsx:77 collapsed / :80 railCapable / :103 isRail / :111 .dock-header--rail div / :208-209 chevron aria",
      "src/ui/dockLayoutModel.ts leafPanelKind + 패널 메타(제목·kind·색 dot 소스)",
      "src/state/diagnosticsStore.ts byNode (code 컴파일 에러 → 에러 dot 소스)",
      "src/index.css:~422-428 .dock-header--rail (v2.0 정의 — 확장)",
      "tests/e2e/m5-dock-chrome.spec.ts(34px width rail·R4)·m1-dock-header-collapse.spec.ts (폭/메커니즘 단언 — 불가침)",
    ],
    checks: [
      "접힌 레일이 grip+색 dot+세로 라벨(writing-mode)+위치 chevron을 렌더하는지 · 라벨=패널 kind 메타인지",
      "에러 dot이 code leaf 컴파일 에러 시에만(diagnosticsStore) 뜨고 비-code엔 없는지",
      "접힘 폭 34px·부모 dir 파생·divider 비활성 등 V2 메커니즘이 불변인지(새 분기 없이 rail 내부 렌더만 추가)",
      "raw hex 직접 사용 0(토큰/var만) · 단위 테스트(라벨/에러 dot/폭 불변) 추가됐는지",
      "E2E 변경이 있으면 강화 방향(추가 단언)이고 기존 폭/메커니즘 expect가 약화·skip 0인지",
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
      description: "의도된 v2.1 디자인 변경이라 E2E 스펙 갱신이 필요한 항목 (약화 아님)",
      items: {
        type: "object",
        required: ["spec", "reason", "proposedChange"],
        properties: {
          spec: { type: "string", description: "스펙 파일 + 테스트명" },
          reason: { type: "string", description: "왜 회귀가 아니라 의도된 v2.1 변경인지" },
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
      description: "v2.1 전 항목(X1~X17 · Y1~Y2)의 처리 상태",
      items: {
        type: "object",
        required: ["id", "status", "note"],
        properties: {
          id: { type: "string", description: "예: X1..X17, Y1, Y2" },
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
- src/theme.ts — 런타임 토큰 단일 출처 (**상위집합** — 덮어쓰지 마라. v2.1은 X14 개명(floatingPill)만, 값 불변)
- temp/design-request-v2.1.md — v2.1 요청서 원문 (X1~X17의 배경/선택지/"다르게 확정 시 바꿀 위치")
- temp/design-request-v2.1-fix.md — v2.1 수정 요청서 (Y1~Y2 + 응답 후 계획 배치표)
${m.screens.length ? `- 스크린샷: ${m.screens.join(", ")}` : ""}
.dc.html은 사내 디자인 툴 포맷이다. 프레임워크는 무시하고 인라인 스타일의 정확한 hex·px·폰트·radius 값과 \`<script type="text/x-dc">\`의 로직만 읽어라 (그 hex를 코드에 직접 쓰지 말고 대응하는 tokens.* 를 참조).

[이 배치가 반영하는 항목] ${m.items.join(" · ")}
design/CHANGELOG.md의 §v2.1이 각 X/Y 결정의 "왜 + 무엇을 확정했는지"를 담고 있다 — **결정의 정본은 CHANGELOG §v2.1이다.** dc와 코드가 어긋나 보이면 CHANGELOG를 먼저 읽어라. ⚠ 요청서의 file:line은 v2.0 시점이라 드리프트했다 — 실측 정본은 아래 KNOWN_FACTS다.
${KNOWN_FACTS}`
}

function depsBlock(m, quarantined) {
  const broken = (m.dependsOn || []).filter((d) => quarantined.includes(d))
  if (broken.length === 0) return ""
  return `

[⚠ 선행 배치 실패] ${broken.join(", ")} 가 게이트를 통과하지 못해 **격리(stash)되어 브랜치에서 빠졌다**. 그 결과물은 현재 코드에 **없다**.
- 그 선행 결과에 의존하는 유닛은 **계획에서 제외**하고, 의존하지 않는 나머지만 진행하라 (워크플로우를 멈추지 말 것).
- 이 배치가 사실상 진행 불가라면 유닛을 "확인만" 수준으로 축소하고 followups(audience:'user')에 "${broken.join(",")} 복구 후 재실행 필요"를 기록하라.`
}

function parallelBlock(m) {
  return m.parallelUnits
    ? `

[⚠ 이 배치의 유닛은 **병렬 실행**된다]
- **유닛 간 파일이 절대 겹치면 안 된다** — 겹치면 서로의 편집을 덮어쓴다.
- **유닛 간 결과 의존이 없어야 한다.** 겹치거나 의존하면 하나의 유닛으로 합쳐라.`
    : ""
}

function specPolicyBlock(m) {
  return m.specPolicy === "forbid"
    ? `

[🔒 이 배치는 E2E 스펙 수정 금지]
이 변경은 E2E에 영향이 없어야 정상이다(색·토큰 개명·라벨 개명은 미단언이거나 testid 기반 / 카드는 렌더 호스트 없음). E2E가 깨지면 그건 **회귀**다 — tests/e2e/**를 고치지 말고 **코드를 고쳐서** 통과시켜라. 불가하면 followups(audience:'user')에 기록.`
    : ""
}

function plannerPrompt(m, quarantined) {
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[배경] design/ 핸드오프는 v1~v2.0까지 반영·머지됐다(v2.0 = PR #72, main 머지 \`3d9168f\`). **v2.1 번들(\`8fd9d6c\` + fix \`6de4272\`)**은 v2.0 구현이 dc/CHANGELOG 미정의 코너에서 내린 **잠정 결정을 디자이너가 확정**한 라운드다(breaking 아님, 소형). X1~X17 응답의 **대부분은 "현행 승인"**(코드 이미 존재 → 일치 검증만) + 실제 코드 작업 6건(X2·X10·X12·X13·X14·X17). Y1·Y2는 디자이너가 Side Panel.dc.html에서 이미 처리 → 코드 작업 없음.

[배치 ${m.id}] ${m.goal}

${refBlock(m)}${depsBlock(m, quarantined)}${parallelBlock(m)}${specPolicyBlock(m)}

[현재 코드 진입점 힌트]
- ${m.hints.join("\n- ")}
- Architecture.md — 모듈 경계 / SPEC.md — 기능 명세 / CLAUDE.md — 품질 게이트 규약

[할 일]
디자인 레퍼런스와 현재 코드를 직접 읽고, 이 배치를 1~4개의 작업 유닛으로 분해하라. 각 유닛은:
- 하위 모델(sonnet)이 이 지시만 보고 구현할 수 있을 만큼 구체적으로: 어떤 파일을 어떻게(file:line — ⚠ 실측 line은 KNOWN_FACTS 신뢰, 요청서 line은 드리프트), 어떤 디자인 값(.dc.html/CHANGELOG 어느 부분)을 참조하는지, 기존 코드의 어떤 패턴을 따르는지.
- ${m.parallelUnits ? "**서로 파일이 겹치지 않게** 분해 (병렬 실행됨)" : "유닛 간 의존 순서대로 정렬 (앞 유닛의 결과 위에 뒤 유닛이 얹힘)"}.
- knip 제약: 새 export는 같은 유닛에서 호출자 연결. 삭제(X12) 시 소비처/테스트까지 함께.
- tests: 커버리지 임계 유지를 위해 추가/갱신할 단위 테스트를 명시. ${m.specPolicy === "allow" ? "이 배치는 신규 UI(X17)라 E2E 강화 단언 추가가 정당할 수 있으니 어느 스펙을 어떻게 강화할지도 유닛에 담아라(폭·메커니즘 불가침)." : "이 배치는 E2E 무영향이 정상이다 — E2E 스펙을 유닛에 넣지 마라."}
- acceptance: 검증자가 확인할 구체 기준.
기존 기능(상태 로직, 상호작용, 단축키)은 보존이 원칙이다. **v2.1은 소형 정합 라운드다 — 과잉 재작성 금지.** 파괴적 재작성이 필요해 보이면 그건 신호가 잘못된 것이니 notes에 사유를 기록하고 최소 변경으로 가라.
디자인이 확정하지 않은 지점이 보이면 **계획 단계에서 잠정 결정을 내려 유닛에 박아 넣고** followups에 기록하라. 계획을 미루지 마라.
${CONSTRAINTS}`
}

function implPrompt(m, unit, answersBlock, priorSummary) {
  const prior = priorSummary
    ? `\n[이전 시도의 부분 진행 상태 — 작업 트리에 이미 반영됨]\n${priorSummary}\n이어서 진행하라 (처음부터 다시 하지 말 것).`
    : ""
  const ans = answersBlock ? `\n[아키텍트(상위 모델)의 답변 — 이 결정을 따르라]\n${answersBlock}` : ""
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[배치 ${m.id} — 작업 유닛 ${unit.id}: ${unit.title}]
${unit.instructions}

[대상 파일] ${unit.files.join(", ")}
[테스트] ${unit.tests}
[수용 기준]
- ${unit.acceptance.join("\n- ")}

${refBlock(m)}${parallelBlock(m)}${specPolicyBlock(m)}
${prior}${ans}

[진행 규칙]
- 확신 없는 설계 결정(토큰 의미 해석, 삭제 범위, 개명 소비처, 기존 동작 변경 여부)은 추측하지 말고 status:'blocked' + questions로 반환하라 → **fable 아키텍트가 답을 준다** (사용자를 기다리는 게 아니다).
- 사소한 구현 디테일은 스스로 결정하라. blocked는 정말 갈림길일 때만.
- 디자인/사용자 결정이 없어 확정할 수 없는 값은 **잠정 결정으로 진행하고 followups에 기록**하라 (멈추지 마라).
- 완료 시 status:'done', summary에 변경 요약과 주요 결정을 기록하라. **코드 변경이 불필요했다면(현행 승인 항목) 그 근거를 summary에 남겨라 — 이것도 정상 완료다.**
${CONSTRAINTS}`
}

function oraclePrompt(m, unit, questions, priorSummary) {
  const qs = questions.map((q, i) => `${i + 1}. ${q.question}\n   (context: ${q.context})`).join("\n")
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
하위 구현 에이전트가 [배치 ${m.id} / 유닛 ${unit.id}: ${unit.title}] 작업 중 다음 질문에 막혔다. **당신이 최종 결정권자다** — 사용자에게 넘길 수 없다.

[유닛 지시]
${unit.instructions}

[구현 에이전트의 진행 상태]
${priorSummary || "(없음)"}

[질문]
${qs}

${refBlock(m)}

저장소 코드와 디자인 문서(design/CHANGELOG.md §v2.1, design/README.md, design/App Shell.dc.html, design/Side Panel.dc.html, design/Command Palette.dc.html, temp/design-request-v2.1.md, temp/design-request-v2.1-fix.md, Architecture.md)를 직접 확인하고, 각 질문에 **단정적으로** 답하라 — 구체적 파일/값/패턴을 지정하고 선택지 중 하나를 결정해줄 것.

[결정 원칙]
- "사용자에게 물어보라" / "디자이너 확인 필요" 같은 답은 **금지**다. 반드시 지금 실행 가능한 결정을 내려라.
- v2.1은 확정 정본이다. 답이 없어 보이면 CHANGELOG §v2.1 + 요청서의 해당 X/Y 항목을 다시 읽어라. 정본에 없는 값이면 (1) 의미가 가장 가까운 기존 토큰/패턴 근사 → (2) 현행 유지 + 사유 주석 → (3) 최소 변경. **theme.ts에 신규 토큰/신규 값을 지어내지 마라(v2.1은 신규 토큰 0, X14 개명만).**
- 잠정 결정한 항목은 followups에 기록(audience: designer=시안/토큰, user=스코프/정책).
${AUTONOMY}`
}

function verifierPrompt(m, plan, round) {
  const acceptance = plan.units.map((u) => `- [${u.id}] ${u.acceptance.join(" / ")}`).join("\n")
  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 검증자다. 저장소: ${ROOT} (브랜치 ${BRANCH}). 검증 라운드 ${round}.

[배치 ${m.id}] ${m.goal}

[검증 대상] 아직 커밋되지 않은 작업 트리 변경. git status / git diff 로 이번 배치의 변경을 파악하라.

${refBlock(m)}

[수용 기준 (플래너가 정의)]
${acceptance}

[배치 특화 체크]
- ${m.checks.join("\n- ")}

[공통 체크]
- 새/수정 파일에 raw hex 직접 사용이 없는지 (tokens.* / var(--*) 참조만). grep -rn 으로 확인. 예외: src/theme.ts, ErrorBoundary 크래시 폴백, src/export/standalonePlayer.js.
- **src/theme.ts 토큰 규칙**: v2.1은 **신규 토큰 0 · 값 변경 0**. ${m.id === "B2" ? "X14 개명(skeletonStatus→floatingPill)이 값 불변으로 됐고 CSS var 소비처가 전부 갱신됐는지(grep 'skeleton-status' 잔재 0), 다른 토큰 값이 안 바뀌었는지." : "이 배치가 theme.ts를 건드렸다면 신규 토큰/값 변경이 없는지."} 구현 파생 항목 — tokens 내부 키(nodeCardSolid·emptyStateIcon·cardLg·modal·thumbnailInset·onCanvasText·overlayBar·shadow.modal)와 named export(withAlpha·cssVars) — 가 소실되지 않았는지 (v1.1 덮어쓰기 사고 이력).
- 기존 기능(상태 로직·상호작용·단축키)이 깨지지 않았는지. **v2.1은 소형 정합 — 과잉 변경(무관 파일 리팩터)이 섞이지 않았는지도 확인.**
- 게이트 설정 파일이 무단으로 약화되지 않았는지. scripts/check-bundle-size.mjs가 수정되지 않았는지.
- tests/e2e/** 변경이 있다면 ${m.specPolicy === "forbid" ? "**이 배치는 스펙 수정 금지다 — 변경이 있으면 blocker**(E2E-invisible이어야 정상)." : "**강화 방향인지**(추가 단언, expect 삭제·skip·fixme·폭/메커니즘 약화가 아닌지) git diff로 확인 — 약화면 blocker. X17 레일 인테리어 존재를 추가 단언하는 것만 허용."}.

[시각 대조 — 가능하면 수행]
- npm run dev 를 백그라운드로 띄우고(이미 떠 있으면 재사용), 스크래치 디렉터리에 일회용 Playwright 스크립트로 해당 화면 스크린샷을 찍어 ${m.screens.length ? m.screens.join(", ") : "(해당 없음)"} 와 비교하라. WebGL은 playwright.config.ts의 SwiftShader 플래그 참고.
- **B4(X17 레일 인테리어)는 실제 접힘을 구동하라** — code leaf를 접어 34px 레일에 세로 라벨/에러 dot이 뜨는지, 폭이 34px로 불변인지 pointer 이벤트로 확인. 정적 스크린샷만으로 부족하면 상호작용을 디스패치하라.
- 브라우저 실행 불가면 visualNotes에 남기고 코드 대조만으로 판단.

[판정]
- .dc.html/CHANGELOG §v2.1 값·로직과의 불일치, 수용 기준 미충족, 규칙 위반을 issues로 반환. severity: blocker(기능 파손/규칙 위반) / major(디자인 불일치) / minor(다듬기).
- blocker/major 없으면 pass:true. minor만 있으면 pass 가능(issues엔 남겨라).
- 구현이 내린 **잠정 결정**은 근거 주석 + followups 기록이 있으면 통과시키고, 기록이 빠졌으면 당신이 followups에 채워 넣어라.
- **"현행 승인" 항목이라 코드 변경이 없는 유닛**은 정상이다 — 변경 없음을 이유로 fail하지 마라. 단 정본과 실제 코드가 어긋나면 그건 회귀 신호이니 issue로.
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
검증자가 [배치 ${m.id}]에서 다음 문제를 발견했다. 전부 수정하라.

${list}

${refBlock(m)}${specPolicyBlock(m)}

수정 방법에 판단이 필요하면 status:'blocked' + questions로 반환하라 (fable 아키텍트가 답한다). 사용자를 기다리지 마라.
${CONSTRAINTS}`
}

function gatePrompt(_m) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 품질 게이트를 실행하고 결과만 보고하라. 아무것도 수정하지 마라.

1) npm run check — Bash timeout 600000ms로 실행. (내부: typecheck → lint → deadcode → circular → unit test, 실패 시 즉시 중단)
2) 1)이 성공했을 때만: npm run test:e2e — timeout 600000ms. 전체 스펙(약 140건, 6~10분). 시간 초과가 우려되면 npx playwright test tests/e2e/<파일> 로 나눠 돌리되 **임의 생략 금지**. dev 서버는 자동으로 뜬다.
⛔ 두 명령 모두 **포그라운드로만** 실행하라(run_in_background 금지). 백그라운드로 띄우고 완료 알림을 기다리면 이 에이전트는 재호출되지 않고 그대로 죽는다 — 실제로 v2.0 워크플로우가 그렇게 두 번 죽었다.
   ⚠ 유닛 테스트는 jsdom stderr 노이즈(HTMLMediaElement not implemented 등)를 대량 출력한다 — 그건 실패가 아니다. **종료 코드와 요약 라인**으로 판정하라.
3) 번들 사이즈 가드(npm run size:check)는 이 워크플로우의 게이트가 아니다 — 실행하지 마라.

각 실패를 gate(typecheck|lint|deadcode|circular|unit|e2e) 별로 분류하고, detail에 핵심 에러 메시지/실패 스펙명·라인을 담아라. 통과했으면 failures는 빈 배열.`
}

function triagePrompt(m, failures) {
  const specNote =
    m.specPolicy === "forbid"
      ? `\n🔒 **이 배치는 specPolicy:forbid다** — E2E 영향이 없어야 정상이다(색·토큰·라벨 개명은 미단언/testid, 카드는 렌더 호스트 없음). E2E 실패는 전부 **회귀(fixes)**로 분류하라. specChanges는 **빈 배열**이어야 한다.`
      : `\n※ 이 배치(B4)는 **접힌 레일에 인테리어를 신설**한다(X17). 기존 스펙이 레일에 인테리어가 없다는 전제라면, 인테리어 존재를 **추가 단언**하는 것만 정당한 specChange다. **레일 폭(34px)·접힘 메커니즘·기존 expect의 약화·skip·fixme는 절대 금지.** 확신이 없으면 회귀(fixes) 쪽으로.`

  return `당신은 ShaderPlayground 디자인 핸드오프 ${HANDOFF} 반영 작업의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
[배치 ${m.id}] 작업 후 품질 게이트가 실패했다. 실패 목록:

${JSON.stringify(failures, null, 2)}

저장소를 직접 조사해 각 실패의 근본 원인을 파악하고 분류하라. **당신이 결정권자다 — 사용자를 기다리지 말고 반드시 실행 가능한 지시를 내려라.**
- fixes: 코드 결함/회귀 — 하위 모델이 그대로 실행할 수 있는 구체적 수정 지시 (근본 원인 포함, 증상 덮기 금지). ⚠ v2.1은 소형 정합이라 대부분의 게이트 실패는 **회귀(fixes)**다 — 삭제(X12)로 인한 고아 export/타입/import, 개명(X14) 누락 참조, 라벨 단언 미갱신 등.
- specChanges: 이번 v2.1 변경이 의도한 UI 변화 때문에 기존 E2E expectation이 더 이상 유효하지 않은 경우만. proposedChange는 **새 값을 추가 단언하는 강화 방향**이어야 하며, expect 삭제·test.skip·fixme·폭/메커니즘 약화는 절대 제안하지 마라. reason에 design/CHANGELOG.md §v2.1의 어느 X/Y 결정 때문인지 명시하라.${specNote}
  ※ 적용된 스펙 변경은 전부 사용자에게 사후 보고되므로, 각 건을 followups(audience:'user')에도 남겨라.
${AUTONOMY}`
}

function gateFixPrompt(m, triage, allowSpec) {
  const fixes = triage.fixes
    .map((f, n) => `${n + 1}. ${f.instruction}\n   파일: ${f.files.join(", ")}`)
    .join("\n")
  const specs =
    allowSpec && triage.specChanges.length
      ? `\n[승인된 E2E 스펙 갱신 — 새 값을 추가 단언하는 강화 방향으로만]\n${triage.specChanges.map((s, n) => `${n + 1}. ${s.spec}: ${s.proposedChange}\n   근거: ${s.reason}`).join("\n")}`
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
  const title = m.phase.replace(/^B\d+ /, "")
  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 배치 변경을 커밋하라.
1) git add -A
2) git commit — 제목: "design(${m.id}): ${title} — 핸드오프 ${HANDOFF}". 본문: 아래 변경 요약을 bullet 몇 개로 정리하고, 반영한 항목(${m.items.join(", ")})을 명시한 뒤, 마지막 줄에 정확히 다음을 넣어라:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

[변경 요약]
${unitSummaries}

--no-verify 등 hook 우회 플래그 금지. 커밋 후 sha를 반환하라.
※ 코드 변경이 전혀 없는 배치(전부 현행 승인)면 커밋하지 말고 committed:false로 반환하라.
※ ${FOLLOWUP_DOC} 는 워크플로우가 별도로 관리하니 이 커밋에 함께 들어가도 무방하다.`
}

function quarantinePrompt(m, reason) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH}). [배치 ${m.id}]이 품질 게이트를 초록으로 만들지 못했다: ${reason}

워크플로우는 멈추지 않고 다음 배치로 진행한다. 이 배치의 작업을 **버리지 말고 격리**해서 브랜치를 마지막 초록 커밋 상태로 되돌려라.

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

[배치 실행 상태 (JSON)]
${JSON.stringify(milestoneStates, null, 2)}

[문서 요구사항]
- 제목: "# 디자인 핸드오프 v2.1 — 보류 항목 (자율 실행 산출물)". 첫 줄에 "이 문서는 워크플로우가 작업을 멈추지 않기 위해 **잠정 결정**으로 진행한 항목들의 목록이다. 각 항목은 이미 코드에 반영돼 있으며, 정식 결정이 나오면 표시된 위치를 고치면 된다."는 취지를 적어라.
- 섹션 구성:
  1. **사용자 판단 필요** (audience: user) — 스코프·정책·게이트. 각 항목: 무엇이 / 왜 / **잠정 처리** / 정식 결정 시 바꿀 위치(파일).
  2. **디자인 문서 갱신 필요** (audience: designer) — 다음 핸드오프 요청 후보. temp/design-request-v2.1.md와 같은 형식(🎨 시안 / 🎯 토큰 / ✅ 확답)으로 분류해 그대로 디자이너에게 보낼 수 있게 하라.
  3. **적용된 E2E 스펙 변경** — 사후 검토용. 파일·테스트명·근거(v2.1의 어느 X/Y 결정)·변경 방향(강화/추가 단언인지) 명시. 없으면 "없음".
  4. **격리된 배치** — stash로 빠진 배치 + stash 이름 + 복구 방법(git stash apply) + 실패 요약. 없으면 "없음".
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
          interimDecision: `강화(추가 단언) 방향으로 갱신함 — ${s.proposedChange}. (사전 승인된 정책이나 사후 검토 필요)`,
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
log(`브랜치 ${BRANCH} 준비 + v2.1 번들 확인 + 베이스라인 게이트`)
const setup = await agent(
  `저장소 ${ROOT} 준비 단계. 순서대로:
1) git status --porcelain 확인 — 작업 트리가 더러우면 ok:false, reason에 상태 요약을 담아 반환하고 종료. 아무것도 수정/스태시하지 마라.
2) **핸드오프 v2.1이 실제로 들어와 있는지** 확인 — 아래가 모두 참이어야 한다. 하나라도 아니면 ok:false + reason:
   - design/CHANGELOG.md 에 "## v2.1" 섹션이 있다.
   - design/README.md 첫 줄 버전이 "v2.1" 이다.
   - design/theme.ts 가 radius/shadow의 **floatingPill**을 정의한다(X14 개명 반영). 그리고 "skeletonStatus" 키가 theme.ts에서 사라졌다.
   - design/Side Panel.dc.html 에 "diagStats" 문자열이 **없다**(Y1 정정 — 2×2 카드 제거). 있으면 fix 커밋(6de4272)이 안 들어온 것.
   - src/theme.ts 가 withAlpha / cssVars / tokens 를 export 한다(구현 파생 export 생존). **참고**: src/theme.ts는 아직 skeletonStatus(개명 전)여야 정상이다 — 개명은 이 워크플로우 B2가 수행한다.
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
      title: `${m.id} 플래너 실패 — 배치 건너뜀`,
      context: "fable 플래너가 유닛을 내지 못했다.",
      interimDecision: "이 배치는 손대지 않고 다음으로 넘어갔다. 해당 항목은 미처리로 남는다.",
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
    log(`  ⚠ ${m.id} 게이트 실패 — stash로 격리하고 다음 배치로 계속한다`)
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

  // 배치마다 보류 문서 갱신 (중간에 죽어도 기록이 남도록)
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
  `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 v2.1 반영 작업의 마무리 점검을 하라. **읽기 전용 — 코드를 수정하지 마라.**

[실행된 배치] ${ranIds || "(없음)"}
[격리된 배치] ${quarantined.length ? quarantined.join(", ") : "(없음)"}

1) **항목 커버리지 대조**: v2.1의 X1~X17 · Y1~Y2를 현재 코드/커밋 기준으로 판정하라. **대부분은 "현행 승인"이라 verified-no-change가 정상이다.** 실제 코드 작업 항목만 done이어야 한다:
   - **done 기대**: X2(토글 라벨 'Auto: ON/OFF'+nowrap+팔레트 'Toggle Code auto-open') · X10(.status-overlay bg var(--surface-rail)) · X12(2×2 카드 제거·스트립 단일화) · X13(index.css 라벨색 var(--accent-bright); diag 반쪽은 X12로 subsume) · X14(theme radius/shadow.floatingPill 개명·값 불변·소비처 갱신) · X17(접힌 레일 인테리어).
   - **verified-no-change 기대(현행 승인)**: X1(codeAutoOpen shader|compute) · X3(setCollapsed 최대화 분기) · X4(autoCode 비영속) · X5(T1 center 폴백 zone:right 60/40) · X6(＋Panel canMerge 병합) · X7(＋More=팔레트) · X8(File ▾ 메뉴) · X9(pill z-index 11) · X11(스트립=카드 동일 소스·라벨 Draws) · X15(스테이지 스트립 34px·0 12px·accent border-top) · X16(dc 죽은 코드, 코드 무관).
   - **Y1·Y2**: 디자이너가 design/Side Panel.dc.html에서 처리(6de4272) → 코드 작업 없음. status는 verified-no-change, note에 "디자이너 dc 정정, 코드 영향 없음" + design/Side Panel.dc.html에 diagStats/problems 탭이 실제로 없는지 확인 결과.
   판정: done(실제 코드 변경) / verified-no-change(현행 승인·코드 이미 정합) / deferred(격리된 배치) / not-covered(다뤄졌어야 하는데 누락 ← note에 분명히). 정본은 design/CHANGELOG.md §v2.1. git log --oneline 으로 브랜치 커밋 확인하고 필요하면 파일을 직접 읽어 판정하라. **추측 금지.**

2) **핵심 불변식 확인**:
   - src/theme.ts에 radius/shadow.**floatingPill**이 있고 skeletonStatus 잔재가 0인지(grep 'skeletonStatus'/'skeleton-status' — CSS 클래스 .graph-skeleton-status는 예외). 토큰 **값**(radius 10 / shadow "0 8px 24px rgba(0,0,0,0.5)")이 불변인지. 구현 파생 항목(nodeCardSolid 등 + withAlpha·cssVars export)이 살아있는지. **신규 토큰이 0인지.**
   - DiagnosticsPanel의 variant==='full' 2×2 카드가 제거됐고 오버레이 스트립이 유일 경로인지 · 공유 헬퍼(diagnosticsTab.ts)가 보존됐는지.
   - .status-overlay 배경이 var(--surface-rail)인지.
   - 접힌 레일 인테리어(세로 라벨/에러 dot)가 추가됐고 접힘 폭 34px·메커니즘이 불변인지.
   - tests/e2e 변경이 있다면 강화(추가 단언) 방향(약화·skip·fixme 0)인지 git diff로.

3) **잔여 raw hex 스캔**:
   grep -rnE '#[0-9a-fA-F]{3,8}\\b' src --include='*.ts' --include='*.tsx' --include='*.css'
   실행 후 src/theme.ts 와 *.test.* 는 제외하고 집계. "정당한 잔여물"(주석 속 참조값, ErrorBoundary 폴백, standalonePlayer.js 폴백)과 "미처리 잔여물"을 구분해 요약하라.

4) **번들 사이즈 참고 측정** (게이트 아님):
   npm run build && npm run size:check 를 timeout 600000ms로 실행하고 js 번들 KiB를 bundleKiB에, ${BUNDLE_LIMIT} KiB 초과 여부를 bundleOverLimit에 담아라. 초과해도 scripts/check-bundle-size.mjs를 **수정하지 마라**.`,
  { label: "coverage-scan", model: IMPL_MODEL, effort: "low", schema: COVERAGE_SCHEMA },
)

return {
  branch: BRANCH,
  handoff: "v2.1 (8fd9d6c + fix 6de4272) — v2.0 잠정 결정 확정 라운드 (X1~X17 · Y1~Y2). breaking 아님.",
  allowSpecUpdates: ALLOW_SPEC_UPDATES,
  codeWork: "X2 · X10 · X12 · X13 · X14 · X17 (나머지 X/Y는 현행 승인/디자이너 dc 정정 = 검증만)",
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
  note: `자율 완주 모드 — 사용자 확인 없이 끝까지 진행했다. 판단이 필요한 항목은 ${FOLLOWUP_DOC} 에 정리돼 있다. v2.1은 소형 정합 라운드(신규 토큰 0)라 대부분 현행 승인 검증이며, 실제 코드 작업은 6건이다. E2E 강화는 B4(X17 레일 인테리어) 추가 단언만 허용(폭·메커니즘 불가침). 번들(CI 한도 ${BUNDLE_LIMIT} KiB)은 게이트가 아니며 X12 감소분이 X17 증가분을 상쇄할 것으로 예상된다 — 초과 시 한도 상향은 사용자 승인 사항.`,
}
