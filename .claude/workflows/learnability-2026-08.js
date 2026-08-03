export const meta = {
  name: "learnability-2026-08",
  description:
    "학습 가시성 개선 계획(docs/learnability-plan-2026-08.md) T0~T4 전량 구현 — A-3(노드 분리) 제외. 티어 = 마일스톤 직렬 체인, 각 마일스톤마다 계획 → 병렬 구현 → 다중 렌즈 적대적 검증 → 게이트 루프 → 커밋. 자율 완주. 디자인 결정이 필요한 지점은 '디자인 무침습' 원칙으로 잠정 처리하고 디자이너 요청서(AA 시리즈)로 취합한다.",
  whenToUse:
    "docs/learnability-plan-2026-08.md 의 T0(번들 예산) · T1(정직성) · T2(침묵 제거) · T3(멘탈 모델) · T4(varying 브리지)를 코드에 반영할 때. A-3(Shader 노드 분리)은 범위 밖이다. **인자 없이 실행하면 M0~M4 전 티어가 사용자 개입 없이 순차 완주한다** — 중단 가능 지점은 Setup 하나뿐(더러운 트리 / 빨간 베이스라인 / 계획 문서 부재)이고, 이후에는 게이트가 실패해도 재시도·격리 후 계속 진행한다. M0·M1은 후속 티어의 선행 조건이라 격리 전에 재시도를 1회 더 받는다. 사용자 판단 필요 항목은 temp/learnability-followup.md 로, 디자이너 결정 필요 항목은 temp/design-request-v2.3-learnability.md 로 취합되며 마일스톤마다 갱신된다(중간에 죽어도 기록이 남는다). ⚠ 전 티어 1회 실행은 대형 작업이다(에이전트 100~250, 게이트 실행만 수 시간). 계획 문서의 '한 세션 = 한 티어' 원칙대로 나눠 돌리려면 args.only 를 쓰고, 중단 지점부터 이어가려면 args.startFrom 을 써라. args: { only?: ['M0'|'M1'|'M2'|'M3'|'M4'], startFrom?: 'M2', branch?, allowSpecUpdates?: bool, commit?: bool, lenses?: number, verifyRounds?: number }",
  phases: [
    { title: "Setup", detail: "브랜치 · 계획 문서 확인 · 베이스라인 게이트 + Node 22 번들 실측" },
    {
      title: "M0 Budget",
      detail:
        "T0 — 번들 게이트를 엔트리 청크 기준으로 전환(T0-1) + loaders.gl 동적 import(T0-2) + shareUrl import 충돌 해소(T0-3). T1~T4의 선행 조건",
    },
    {
      title: "M1 Honesty",
      detail:
        "T1 — A-1 fullscreen 대체 표시 · D-1 Pass Inspector · C-1 시스템 유니폼 섹션 · B-1 Mesh attribute 계약 (SPEC Phase 36)",
    },
    {
      title: "M2 Silence",
      detail:
        "T2 — E-1 미연결 sampler/미사용 유니폼 경고 · E-4 연결된 슬라이더 무력화 표시 · B-2 attribute 소비 체크 (SPEC Phase 37)",
    },
    {
      title: "M3 Model",
      detail:
        "T3 — C-2 @default 이관 · E-2 렌더 상태 표시 · E-3 텍스처 파라미터 표시 · F-1 좌표계 카드 · F-2 데모 레슨화 (SPEC Phase 38)",
    },
    {
      title: "M4 Varying",
      detail: "T4 — A-2 varying 브리지 시각화 (A-3 노드 분리는 범위 밖) (SPEC Phase 39)",
    },
    {
      title: "Report",
      detail: "followup 문서 · 디자이너 요청서(AA) · 트래커/SPEC 갱신 확인 · 커버리지 · Node 22 번들 실측",
    },
  ],
}

// ─────────────────────────────────────────────────────────────────────────────
// 설정
// ─────────────────────────────────────────────────────────────────────────────
const ROOT = "/Users/channa/Repository/github/chan-na/ShaderPlayground"
const IMPL_MODEL = "sonnet" // 일반 구현 · 게이트 실행 (토큰 절약)
const ORACLE_MODEL = "fable" // 계획 · 검증 · 트리아지 (정확도)
const SCAN_MODEL = "haiku" // 커밋 · 격리 등 기계적 작업

const PLAN_DOC = "docs/learnability-plan-2026-08.md"
const FOLLOWUP_DOC = "temp/learnability-followup.md"
const DESIGN_REQUEST_DOC = "temp/design-request-v2.3-learnability.md"
const DESIGN_REQUEST_VERSION = "v2.3"
const DESIGN_ITEM_PREFIX = "AA" // Z8까지 소진 → 새 시리즈
const BASE_SHA = "445c925" // KNOWN_FACTS 실측 기준 커밋 (main)

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
const BRANCH = A.branch || "feat/learnability-2026-08"
const ONLY = Array.isArray(A.only) ? A.only : null
// 재개용: 이 마일스톤 이전은 전부 건너뛴다 (only와 병용 가능 — 둘 다 통과해야 실행)
const START_FROM = typeof A.startFrom === "string" ? A.startFrom : null
const ALLOW_SPEC_UPDATES = A.allowSpecUpdates !== false
const DO_COMMIT = A.commit !== false

const MAX_QA_ROUNDS = 2 // 구현 시도 횟수 (초과 시 fable이 직접 구현)
const MAX_VERIFY_ROUNDS = Number(A.verifyRounds) > 0 ? Number(A.verifyRounds) : 2
const MAX_GATE_ROUNDS = 4
const MAX_REFUTE_TARGETS = 5 // 라운드당 적대적 교차검증에 태울 blocking 지적 수 (초과분은 보수적으로 '확정' 처리 + 로그)
const REFUTERS_PER_FINDING = 2 // 둘 다 반박해야 기각 (불확실하면 유지 = 보수적)

// ─────────────────────────────────────────────────────────────────────────────
// 공통 제약 블록
// ─────────────────────────────────────────────────────────────────────────────
const AUTONOMY = `
[자율 완주 원칙 — 중요]
- 이 워크플로우는 **사용자에게 묻지 않고 끝까지 진행**한다. 사람의 답을 기다리며 멈추는 선택지는 없다.
- status:'blocked'는 **상위 모델(fable 아키텍트)에게 에스컬레이션하는 내부 신호**다 — 사용자에게 묻는 게 아니다. 갈림길에서 판단이 서지 않으면 blocked + questions로 반환하면 fable이 결정해준다.
- 사용자/디자이너 결정이 "진짜로" 필요해 보여도 **멈추지 마라.** 대신:
  1) 되돌리기 쉬운 **잠정 결정**으로 진행한다 (우선순위는 아래 [디자인 무침습 원칙]의 사다리를 따른다).
  2) followups(audience:'user') 또는 designRequests(디자이너)에 기록한다.
- followups는 ${FOLLOWUP_DOC}, designRequests는 ${DESIGN_REQUEST_DOC} 로 취합된다. 기록하면 그 항목은 "처리된 것"이다 — 다시 막히지 마라.

[⛔ 장시간 명령 실행 규칙 — 이 규칙 위반이 실제로 과거 워크플로우를 두 번 죽였다]
- **오래 걸리는 명령(npm run check, npm run test:e2e, npm run build, npx playwright/vitest)을 백그라운드(run_in_background)로 띄워놓고 완료 알림을 기다리며 턴을 끝내지 마라.** 너는 워크플로우 서브에이전트다 — 백그라운드 완료 알림으로 다시 깨워주지 않는다. 기다리면 그대로 죽고 네 작업 전체가 유실된다.
- 장시간 명령은 **반드시 포그라운드에서 timeout을 크게(최대 600000ms) 잡고** 실행하라. 초과가 우려되면 파일 단위로 쪼개 각각 포그라운드로 돌려라(임의 생략 금지).
- 유일한 예외: dev 서버(npm run dev)처럼 **종료를 기다리지 않는** 상주 프로세스.
- 시스템이 StructuredOutput 호출을 요구하면 **그 즉시 호출하라.** 증거가 불완전하면 "무엇이 미확인인지"를 결과에 명시하고 반환하라 — 알림을 기다리는 선택지는 없다.`

const CONSTRAINTS = `
[품질 제약 — CLAUDE.md, 위반 금지]
- TypeScript strict + noUnusedLocals/Parameters + noUncheckedIndexedAccess + exactOptionalPropertyTypes. \`any\` / \`as unknown as T\` 캐스팅 우회 금지. 인덱스 접근 결과는 항상 \`T | undefined\`로 다뤄라.
- Biome warn 0건 유지. **새 biome-ignore 추가 금지** — 리팩터로 해소하라. 정말 불가하면 사유+대안 검토를 followups(audience:'user')에 남기고 현행 유지.
- Knip 0건: 새 export는 **같은 변경 안에서** 실제 호출자/임포터를 함께 연결. 고아 export/타입/의존성 금지. 삭제 시 소비처·테스트까지 함께 제거.
- 순환 의존성 0건(\`npm run circular\`): **store끼리 직접 상호 import 금지.** 새 스토어는 leaf(다른 스토어를 import하지 않음)여야 한다 — debugUiStore/diagnosticsStore가 그 선례다.
- 커버리지 임계(lines 50 / functions 47 / branches 42 / statements 50) 하락 금지. **신규 UI/스토어/헬퍼는 단위 테스트를 같은 변경에 동반하라.** vitest.config.ts의 임계치·coverage.exclude를 건드리지 마라.
- 게이트 설정 파일(tsconfig.json / biome.json / knip.json / vitest.config.ts / .github/workflows/**) **완화 금지**. \`--no-verify\` 등 우회 플래그 금지.
- scripts/check-bundle-size.mjs 는 **M0(T0-1)에서만** 수정한다. 그 외 마일스톤에서 한도를 올리거나 스크립트를 고치는 것은 금지 — 초과하면 코드를 줄여라.`

const DESIGN_POLICY = `
[🎨 디자인 무침습 원칙 — 이 워크플로우의 핵심 정책]
이 라운드는 **디자인 핸드오프가 아니다.** design/ 번들(현행 정본 v2.2)은 이 작업의 입력이지 산출물이 아니다.
- **design/** 아래 파일(README.md · CHANGELOG.md · theme.ts · *.dc.html · screens/)을 **절대 수정하지 마라.**
- **src/theme.ts 에 신규 토큰을 추가하지 마라.** 값 변경도 금지. 기존 토큰/CSS 변수만 조합하라.
- **6번째 도킹 패널을 만들지 마라.** \`src/state/dockTree.ts\` 의 \`DockPanelId = "nodeEditor" | "viewport" | "inspector" | "code" | "assets"\` 확장은 디자인 정본 이탈이며 이 워크플로우 범위 밖이다.
- 컴포넌트에 raw hex 직접 사용 금지 (tokens.* 또는 var(--*)만). 예외: src/theme.ts, ErrorBoundary 크래시 폴백, src/export/standalonePlayer.js.

**새 UI가 필요할 때의 사다리 — 위에서부터 순서대로 시도하고, 한 칸 내려갈 때마다 그 사유를 남겨라:**
1. **기존 표면 재사용** — Inspector 섹션(\`.inspector-section\`/\`.inspector-label\`), ProblemsPanel 행, 노드 카드 meta(\`.node-card__meta\`), PortHandle 툴팁(title), HelpModal 섹션(\`.help-modal__section\`), StatusBar 칩.
2. **기존 선례 패턴 복제** — 예: Compute 노드의 Attributes 렌더(\`src/ui/Panels/Inspector.tsx\` Attributes 섹션)를 Mesh에 그대로 적용. StatusOverlays 하단 트랜지언트 오버레이 패턴을 Pass Inspector에 재사용.
3. **기존 토큰/클래스만으로 최소 신규 마크업** — 새 CSS 클래스는 만들되 값은 전부 기존 var(--*).
4. 그래도 안 되면 **최소 잠정 UI**로 진행하고 designRequests에 기록.

**디자이너에게 물어야 할 것을 발견하면 멈추지 말고 designRequests 배열에 담아라.** 각 항목은 실제 요청서 형식으로 쓴다:
- title(한 줄) / background(dc·CHANGELOG가 무엇을 정의하지 않았는지) / interimDecision(지금 코드에 넣은 잠정 처리) / options(선택지 (a),(b),…) / recommendation(권장안 + 이유) / changeLocations(다르게 확정 시 바꿀 파일·심볼) / impact(번들·E2E·직렬화 영향) / newTokenNeeded(신규 토큰이 필요한 요청인지).
- 워크플로우가 이것을 모아 ${DESIGN_REQUEST_DOC} (${DESIGN_ITEM_PREFIX}1~${DESIGN_ITEM_PREFIX}n)로 발행한다.`

const NODE22 = `
[📦 번들 측정 규칙 — Node 22가 아니면 그 수치는 게이트의 수치가 아니다]
- \`.nvmrc\` = 22. \`npm run size:check\`는 Node 22가 아니면 WARNING을 출력한다. **경고가 보이면 그 수치를 근거로 판단하지 마라.**
- Node 22 확보 절차: \`node -v\` 확인 → 22가 아니면 (a) \`nvm use 22\`(있으면) 또는 (b) 스크래치 디렉터리에 \`npm i --prefix <scratch> node@22\` 후 \`<scratch>/node_modules/node/bin/node scripts/check-bundle-size.mjs\` 를 이미 빌드된 dist에 대해 실행.
- Node ≥ 24는 zlib-ng라 같은 dist를 ~1.8 KiB 작게 잰다 — 로컬 PASS가 CI PASS를 보장하지 않는다.
- 한도 초과 시 **scripts/check-bundle-size.mjs 를 고치지 마라**(M0 예외). 코드를 줄이거나, 줄일 수 없으면 followups(audience:'user')에 "한도 상향은 사용자 승인 사항"으로 기록하라.`

const KNOWN_FACTS = `
[📌 실측 정본 (${BASE_SHA} = main 기준, 2026-08-01 확인)]
⚠ ${PLAN_DOC} 의 file:line 인용 일부는 이미 드리프트했다(예: 계획서가 말하는 \`src/core/graph/splitLayout.ts\`는 존재하지 않고 테스트만 남아 있다). **계획서의 line 번호를 믿지 말고 아래 실측값 + 직접 grep 을 신뢰하라.**

번들 / 빌드
- \`scripts/check-bundle-size.mjs:53-55\` \`const LIMITS_KIB = { js: 396 }\` — 현재 유일한 한도. \`checkGroup("JS", jsFiles, LIMITS_KIB.js)\` 가 \`dist/assets/*.js\` **전부의 gzip 합계**를 잰다(:148·154).
- 같은 파일 :8-52 의 주석이 **예산 결정의 유일한 기록**이다(360→363→385→393→396 + Node 22/24 측정 정정). **보존하고 그 아래에 이어 적어라.**
- :57-87 \`ciNodeMajor()\`/\`reportNodeContext()\` — Node 불일치 경고. 유지.
- :95-111 \`listAssets\` 의 ENOENT → \`process.exit(2)\` 방침 = "조용히 통과하지 않는다". 엔트리 식별 실패도 같은 방침(exit 2)이어야 한다.
- \`vite.config.ts\` 는 9줄짜리 최소 설정 — \`build\` 키가 아직 없다. \`base\`는 GITHUB_PAGES에서 \`/Shader-Playground/\`로 바뀐다(엔트리 식별에 파일명/HTML 파싱이 취약한 이유).
- 실측(Node 22.23.2): 현재 정적 = 엔트리 392.12 / 총합 395.12. loaders.gl 동적 분리 시 = 엔트리 **349.15**(-42.97) / 총합 **396.30**(현 게이트 FAIL).

T0 대상
- \`src/state/assetActions.ts:16\` \`import { loadGltfFromFile } from "../core/assets/gltfLoader"\`, \`:18\` \`import { loadObjFromFile } from "../core/assets/objLoader"\`. 호출부는 \`:106\` / \`:124\` 이며 **둘 다 이미 async 함수 안의 await** — 동적 변환이 자명하다.
- \`gltfLoader.ts\`가 \`objLoader.ts\`의 \`toGeometryHandle\`을 import하므로 **둘 다 동적**이어야 엔트리에서 완전히 빠진다.
- \`src/state/assetActions.test.ts\` 가 두 모듈을 \`vi.mock\` 한다 — vitest는 동적 \`import()\`도 가로채므로 무수정 통과가 예상되나 **반드시 실행해 확인**하라.
- shareUrl 충돌: \`src/ui/BootstrapGate.tsx:31\` \`const mod = await import("../state/shareUrl")\` (동적) vs \`src/ui/ExportShare/ExportShareDialog.tsx:17\` \`import { encodeShareUrl } from "../../state/shareUrl"\` (정적). \`src/ui/ExportShare/ExportShareDialog.test.tsx:32\` 가 \`import * as shareUrlModule\` 로 스파이하므로 동적화하면 테스트 갱신이 필요하다(약화 아님 — 스파이 방식 변경).

ExecutionPlan (T1의 데이터 원천 — 신규 계산 0)
- \`src/core/graph/compile.ts:65-88\` \`ShaderPass\`: \`meshIsFullscreen:boolean\`(:71) · \`meshComputeNodeId\`(:79) · \`meshComputeVaos\`(:80) · \`samplers:SamplerBinding[]\`(:81) · \`paramBindings\`(:83) · \`width/height\`(:86-87).
- \`SamplerBinding\`(:54-58) = { uniformName, sourceNodeId, unit } · \`ParamBinding\`(:60-63) = { uniformName, sourceNodeId }.
- \`ComputePass\`(:99-127): attributes(inName/outName/size) · count · primitive(GL 상수) · read:"A"|"B" · paramBindings.
- \`ExecutionPlan\`(:124-160): \`passes[]\`(위상 순서) · \`passByNode\` · \`shaderPassByNode\`(:135) · \`outputs\` · \`compiledVertexSource: Record<string,string>\`(:153).
- fullscreen 대체 로직: \`:551\` \`let meshIsFullscreen = true\` → mesh/compute 해결 시 \`:564\`·\`:570\`에서 false → \`:576-579\` \`if (meshIsFullscreen) vertexSource = fullscreenVert\` 후 \`compiledVertexSource[sn.id] = vertexSource\`. \`:661\` 에서 pass에 실림.
- **emptyPlan**(:183·190): fatal validate(cycle 등)에서는 \`shaderPassByNode\` 빈 Map + \`compiledVertexSource: {}\` — 이때 배지/행 상태를 어떻게 할지 정할 것(직전 값 유지 권장).

발행 지점 / 스토어
- \`src/ui/Viewport/index.tsx:205\` \`const recompile = ()=>{...}\` — RAF hot path가 **아니다**(recompile 시에만 돈다). \`:233-234\` 에서 \`plan.compiledVertexSource[id]\` 를 diagnosticsStore로 발행, \`:240\` \`retainOnly\`, \`:257\` \`setPanes\`. **새 요약 발행은 여기에 붙인다.**
- \`src/state/diagnosticsStore.ts\`: \`NodeDiagnostics\`(:4-16, \`compiledVertexSource?: string\` 포함) / \`DiagnosticsState\`(:18-29) / \`retainOnly\`(:41-53, 변화 없으면 identity 보존) / \`emptyDiagnostics()\`(:57). **leaf 스토어다 — 다른 스토어를 import하지 않는다.**
- \`src/state/debugUiStore.ts\`: \`open\`(diagnostics) / \`problemsOpen\` **상호 배타**(:42-54) — 하단 172px 오버레이가 dc상 **단일 슬롯**이기 때문. 여기에 3번째를 넣는 것은 디자인 정본이 정의하지 않은 지점이다 → designRequests 대상.
- \`src/ui/Panels/StatusOverlays.tsx\`: \`.status-overlay\` 하나를 diagnostics/problems가 번갈아 차지. 헤더 → (diagnostics면) 26px 메트릭 스트립 → 본문. 오버플로 회귀 이력 주석 필독.
- \`src/ui/Panels/StatusBar.tsx:82-83\` \`toggleOpen\`/\`toggleProblems\`, \`:172·183\` 트리거 버튼(testid \`status-problems\` / \`open-diagnostics\`).
- \`src/state/gpuTimerStore.ts\` — \`GpuTimerState\`(:15) 노드별 EMA. 미지원 환경 대비 필요.

코드 에디터 / 노드 뷰
- \`src/ui/CodeEditor/StageTabs.tsx\`: 56줄. 라벨 \`"vertex.glsl"\`(:22) / \`"fragment.glsl"\`(:29) **하드코딩**, testid \`stage-tab-vertex|fragment\`, \`data-active\`/\`data-has-error\` 속성. 라벨 분기는 props 확장으로.
- \`src/ui/Viewport/compileErrorInfo.ts:127-134\` — vertex 발췌를 \`diags.compiledVertexSource ?? node.vertexSource\` 에서 뽑는다(주석이 이미 이 사실을 인지). A-1이 "보이는 소스 = 발췌 소스"를 만들면 이 주석도 갱신 대상.
- \`src/ui/NodeEditor/nodes/\`: ShaderNodeView · MeshNodeView(60줄, asset이면 \`{vertexCount} verts\`만 표시) · ComputeNodeView · ErrorBadge · BlockedBadge · GpuTimerChip · PortHandle · NodeCardHeader(meta prop). **배지 선례는 ErrorBadge/BlockedBadge/GpuTimerChip 이다.**
- \`src/ui/Panels/Inspector.tsx\` — Compute 노드의 \`Attributes\` 섹션(≈:287-307)이 \`{a.inName} → {a.outName} ({a.size}, seed={a.seed})\` 를 렌더한다. **B-1/C-1이 따라야 할 선례.** Mesh 섹션은 현재 없다.

유니폼 / 메시 / 텍스처
- \`src/core/graph/uniformParser.ts:67-76\` \`SYSTEM_UNIFORMS\` 8종(u_time·u_resolution·u_view·u_proj·u_model·u_camera·u_mouse·u_frame). \`:83-92\` \`SYSTEM_UNIFORM_DESCRIPTIONS\` (u_view/u_camera 설명에 이미 "(fullscreen 패스에서는 미적용)" 문구 존재).
- \`:162·169\` 힌트 파서가 **이미 \`@default V\` / \`@default V1,V2,V3\` 를 지원**한다 → C-2는 파서 변경 불필요.
- \`src/core/nodes/registry.ts:99-107\` shader inputs = mesh 포트 + samplerUniforms(:101) + inspectorUniforms(:104). :123 compute도 동일 패턴 → **유니폼이 슬라이더이자 포트**인 구조(L1의 뿌리).
- \`src/core/graph/execute.ts:140\` bindSystemUniforms / \`:188\` bindUserUniforms(paramBindings가 uniformValues를 덮어씀 = L1) / \`:224\` bindSamplers.
- \`execute.ts:335-352\` 렌더 상태: \`gl.enable(gl.BLEND)\` 호출 **0건**, \`CULL_FACE\` 항상 disable, DEPTH_TEST는 \`pass.meshIsFullscreen\` 분기로만 on/off. clearColor는 (0,0,0,1) 고정.
- \`src/core/gl/mesh.ts:35-36\` \`const loc = attribLocations[attr.name]; if (loc === undefined || loc < 0) continue;\` — **조용한 스킵**(B-2의 근거).
- \`src/core/gl/uniforms.ts:20\` \`if (loc === null) return;\` — 미사용 유니폼 조용한 스킵(E-1의 근거).
- \`src/core/gl/texture.ts\`: FBO 텍스처(:29-32) = LINEAR/LINEAR + CLAMP_TO_EDGE, 밉맵 없음. 이미지 텍스처(:53-67) = UNPACK_FLIP_Y_WEBGL + generateMipmap + LINEAR_MIPMAP_LINEAR/LINEAR + REPEAT. **같은 GLSL이 다른 결과를 내는 이유**(L2).
- 메시 attribute 계약은 **전 경로 고정 3종**: \`src/core/assets/primitives.ts\` 5개 프리미티브 전부 \`a_position(3)·a_normal(3)·a_uv(2)\`, \`src/core/assets/objLoader.ts:76-82\` 동일. glTF도 같은 형태로 정규화.

C-2 하드코딩 좌표 (진짜 "몰래 넣는 값")
- \`src/ui/NodeEditor/AddNodePill.tsx:101\` · \`src/ui/CommandPalette/index.tsx:233·279·677\` 이 \`uniformValues: { u_baseColor: [0.5, 0.7, 1.0] }\` 를 심는다. \`src/shaders/templates/starter.frag:24\` 가 그 유니폼의 선언.
- \`src/state/demoGraph.ts:23\` 은 **다른 값** \`[0.3, 0.7, 1.0]\` — 데모의 의도된 아트디렉션일 가능성이 높다(신규 노드 4곳과 구분해 판단할 것).
- ⚠ **E2E 영향**: \`tests/e2e/phase-7-8-assets-serialization.spec.ts:79-86\` 이 직렬화된 \`uniformValues.u_baseColor\` 를 단언한다. \`src/state/shareUrl.test.ts:18\` 도 갱신 대상.
- **하위 호환**: 저장된 프로젝트(autosave/share URL)의 uniformValues가 \`@default\`를 **이겨야** 한다(현행 동작과 동일).

기타
- \`src/ui/NodeEditor/HelpModal.tsx\` 132줄 — \`.help-modal__section\` + \`.help-modal__section-title\` 구조. **탭 UI는 없다**(F-1이 "탭 추가"라고 쓰였지만 현재 구조는 섹션 나열이다 → 섹션 추가가 최소 침습).
- \`src/core/glsl/symbolTable.ts\` — \`buildSymbolTable(source)\`(:395) · \`GlslSymbol\`(:41) · \`SymbolTable\`(:62). A-2 varying 매칭의 재사용 후보.
- \`src/ui/Panels/ProblemsPanel.tsx\` 193줄 — severity(error/warning/info) → 글리프/색 맵(:20-30), 칩 요약 행(:97-), \`data-testid="problem-row"\`(:167). 데이터는 \`diagnosticsStore.byNode\` 기반.
- SPEC.md 최신은 \`### Phase 35\`(:444). 신규는 **36부터**. \`### (백로그)\`(:456) 위에 삽입한다.`

const GATE_RULES = `
[게이트 규약]
\`\`\`
npm run check      # typecheck → lint → deadcode → circular → test(+커버리지 임계)
npm run test:e2e   # Playwright, check에 포함되지 않음 — 별도 실행 필수
\`\`\`
- E2E는 \`tests/e2e/\` Phase 스펙. **expect 약화 · test.skip · test.fixme 추가 금지.** 의도된 동작 변경이면 **추가 단언(강화) 방향**으로만 갱신하고 전부 followups(audience:'user')에 기록한다.
- 신규 기능은 새 스펙 파일을 추가한다(계획서 D-3 기본 권장 = 티어마다 새 Phase 스펙).
- 유닛 테스트는 jsdom stderr 노이즈(HTMLMediaElement not implemented 등)를 대량 출력한다 — 그건 실패가 아니다. **종료 코드와 요약 라인**으로 판정하라.`

// ─────────────────────────────────────────────────────────────────────────────
// 마일스톤 정의 (= 계획서의 티어)
// ─────────────────────────────────────────────────────────────────────────────
const MILESTONES = [
  {
    id: "M0",
    phase: "M0 Budget",
    tier: "T0",
    items: ["T0-1", "T0-2", "T0-3"],
    dependsOn: [],
    parallelUnits: false,
    bundleGate: true,
    // 후속 전 마일스톤이 이 예산 위에서 돈다 — 격리 전에 한 번 더 시도한다.
    criticalRetries: 1,
    specPhase: null,
    lenses: ["gate-risk", "regression", "measurement"],
    goal: `T0 — 번들 예산 확보. **기능 변경 0, 순수 배관.** T1~T4의 선행 조건이며, 이게 초록이 되기 전에는 어떤 UI도 추가할 수 없다(현재 여유 0.88 KiB).

(a) [T0-1] 게이트 기준을 "전체 합계" → "**엔트리 청크**"로 전환. \`scripts/check-bundle-size.mjs\` 의 \`LIMITS_KIB\` 를 \`{ entry, total }\` 로 확장하고 \`checkGroup\` 을 두 번 호출한다.
   - 엔트리 식별: **vite manifest 채택**(계획서 D-0b 기본 권장) — \`vite.config.ts\` 에 \`build: { manifest: true }\` 를 추가하고 \`dist/.vite/manifest.json\` 에서 \`isEntry: true\` 항목을 찾는다. \`base\`가 \`/Shader-Playground/\`로 바뀌어도 영향 없다. **파일명 패턴(index-*.js) 채택 금지.**
   - 한도(계획서 D-0a 제안값): **entry 375 KiB / total 430 KiB.** 구현 시 Node 22 실측 후 확정하되 **entry 여유는 20~30 KiB 범위**를 유지한다(그 이상이면 래칫이 헐거워진다). 제안값과 다르게 정했다면 사유를 주석과 followups에 남겨라.
   - 엔트리를 식별하지 못하면 **exit 2로 실패**한다(기존 ENOENT 분기와 같은 방침 — 조용히 통과 금지).
   - 기존 주석 이력(360→396)을 **보존**하고 그 아래에 T0 전환 사유를 이어 적는다. \`reportNodeContext()\` 는 그대로 동작해야 한다.
(b) [T0-2] loaders.gl 동적 import. \`assetActions.ts\` 의 objLoader/gltfLoader **둘 다** 정적 import를 제거하고 호출부(:106·:124)에서 \`const { loadObjFromFile } = await import("../core/assets/objLoader")\` 형태로 바꾼다. 엔트리 -43 KiB 실측 완료.
   - **실패 경로 확인**: 청크 fetch 실패(오프라인/배포 중 캐시 불일치) 시 예외가 기존 에러 토스트 경로에 잡히는지 확인하고, 안 잡히면 \`toast.error\` 를 추가하라.
(c) [T0-3] \`shareUrl\` 정적/동적 import 충돌 해소. \`ExportShareDialog.tsx\` 쪽도 **동적으로** 통일한다(부트 경로에서 빼는 게 원래 의도). 다만 \`ExportShareDialog\` 자체가 이미 지연 로드되는지 먼저 확인하라. vite reporter 경고가 사라져야 한다.

**완료 조건**: Node 22에서 \`npm run size:check\` 가 entry/total 두 줄을 각각 보고하고 green + \`npm run check\` + \`npm run test:e2e\` green + 스크립트 주석에 전환 사유와 실측 수치 기록.`,
    hints: [
      "scripts/check-bundle-size.mjs:53-55(LIMITS_KIB) · :95-111(listAssets/exit 2) · :121-144(checkGroup) · :146-155(main)",
      "vite.config.ts (9줄, build 키 없음 — build.manifest 추가 지점)",
      "src/state/assetActions.ts:16·18(정적 import) · :106·:124(await 호출부) · assetActions.test.ts(vi.mock)",
      "src/ui/BootstrapGate.tsx:31(동적) vs src/ui/ExportShare/ExportShareDialog.tsx:17(정적) · ExportShareDialog.test.tsx:32(import * as 스파이)",
      "tests/e2e/phase-7-8-assets-serialization.spec.ts(에셋 임포트 — dev 서버는 동적 import를 네이티브로 서빙하므로 통과 예상)",
      "tests/e2e/phase-11-share-export.spec.ts(shareUrl 경로)",
    ],
    checks: [
      "size:check가 entry/total 두 그룹을 각각 보고하고 두 한도 모두 검사하는지 · 하나라도 초과 시 exit 1인지",
      "엔트리 식별이 vite manifest(isEntry:true) 기반이고, 식별 실패 시 exit 2 + 명확한 에러 메시지인지 (파일명 패턴 폴백 금지)",
      "기존 주석 이력(360/363/385/393/396 + Node 22/24 측정 정정)이 보존됐고 그 아래에 T0 전환 사유·실측 수치가 추가됐는지",
      "objLoader/gltfLoader가 **둘 다** 동적이고 엔트리 청크에서 완전히 빠졌는지(manifest/빌드 출력으로 확인)",
      "동적 import 실패 시 사용자에게 보이는 에러 경로가 있는지(토스트) · assetActions.test.ts가 무수정 또는 정당한 갱신으로 통과하는지",
      "shareUrl이 한쪽으로 통일돼 vite reporter 경고가 사라졌는지 · ExportShareDialog.test.tsx 스파이가 동적 import에 맞게 갱신됐는지(약화 아님)",
      "기능 변경 0인지 — UI 동작·직렬화·저장 포맷에 손댄 곳이 없는지",
    ],
    specPolicy: "forbid",
  },
  {
    id: "M1",
    phase: "M1 Honesty",
    tier: "T1",
    items: ["A-1", "D-1", "C-1", "B-1"],
    dependsOn: ["M0"],
    parallelUnits: false,
    bundleGate: true,
    // M2·M3·M4가 전부 이 마일스톤의 배관(plan 요약 스토어 · meshIsFullscreen 발행)에
    // 의존한다. 여기서 격리되면 남은 세 티어가 껍데기만 남으므로 재시도를 준다.
    criticalRetries: 1,
    specPhase: "Phase 36 — 실행 파이프라인 가시성 I (정직성 회복)",
    lenses: ["regression", "truthfulness", "design-canon", "gate-risk"],
    goal: `T1 — 정직성 회복. 네 항목의 뿌리는 하나다: **ExecutionPlan이 이미 알고 있는 사실을 UI로 올리기.** 신규 계산은 거의 0이고 노출만 하면 된다. 배관(plan 요약 발행)을 공유하므로 함께 한다.

(a) [A-1] **풀스크린 대체를 정직하게 표시 — 버그에 가깝다, 최우선.**
   - 현재: mesh 입력이 없으면 vertexSource가 조용히 \`fullscreen.vert\`로 교체되는데, 새 Shader 노드는 항상 \`basic.vert\`를 들고 태어난다 → \`vertex.glsl\` 탭에 **실행되지 않는 코드**가 보이고 편집해도 화면이 안 변한다. 사용자 노출 "fullscreen" 문자열 0건.
   - **불리언은 그래프에서 유추하지 마라**(mesh 노드가 있어도 에셋 미로드면 fullscreen으로 떨어지고, compute 패스 생성 실패도 마찬가지다). \`plan.shaderPassByNode.get(id).meshIsFullscreen\` 을 recompile 시 스토어로 발행하라.
   - UI: vertex 탭 라벨 \`fullscreen.vert (auto)\` · fullscreen일 때 **컴파일된 소스를 읽기 전용으로** 표시(계획서 D-2 기본 권장 — "보이는 것 = 도는 것") · ShaderNodeView에 \`FULLSCREEN\` 배지(ErrorBadge/BlockedBadge 선례를 따를 것).
   - **엣지 케이스**: fatal validate(cycle 등)의 emptyPlan에서는 맵이 비어 있다 → **직전 값 유지 권장**. 어떻게 정했든 그 근거를 주석에 남겨라.
   - 수용: ① mesh 미연결 노드 → 탭이 \`fullscreen.vert (auto)\`, 내용이 실제 fullscreen.vert, 편집 불가 ② mesh 연결 → 사용자 소스로 복귀, 편집 가능 ③ Chain 데모 3개 노드가 즉시 정직해짐 ④ vertex 에러 오버레이 발췌 라인이 화면에 보이는 소스와 일치.
(b) [D-1] **Pass Inspector — 목표 대비 ROI 최고.** "이 프레임에 실제로 무엇이 어떤 순서로 실행되는가"를 보여준다(L5 해소).
   - 열: # / 노드 / kind / FBO(WxH + 배율) / mesh 출처(fullscreen quad | POINTS×N, read=A | 프리미티브) / samplers(u_tex ← noise1 (unit 0)) / GPU ms.
   - 데이터 전부 plan에 있다(신규 계산 0): \`plan.passes[]\`(위상 순서 보존) · width/height · samplers[] · meshIsFullscreen · meshComputeNodeId · ComputePass의 read/count/primitive · \`gpuTimerStore.byNode\`.
   - **배치는 디자인 미결(계획서 D-1)**: 기본 권장은 \`StatusOverlays\` 트랜지언트 오버레이 패턴 재사용(디자인 정본 무영향). ⚠ 다만 그 오버레이는 dc상 **단일 슬롯 상호 배타**다 — 3번째를 넣으려면 debugUiStore의 상호 배타를 3원화해야 하고, 그건 dc가 정의하지 않은 지점이다. **잠정 결정으로 진행하고 반드시 designRequests에 담아라.**
   - 성능: recompile 때만 요약을 만든다(RAF hot path 아님). 큰 그래프의 GC 압력을 피하려 **얕은 요약**만 만들 것.
   - 수용: ① 데모 4종에서 패스 수·순서가 executePlan 실행 순서와 일치 ② resolutionScale 0.5×면 해당 행 FBO가 절반 ③ 컴퓨트 데모에서 ping-pong read 측이 프레임마다 A/B로 토글되는 게 보임 ④ GPU 타이머 미지원 환경에서 ms 열이 깨지지 않음.
(c) [C-1] **시스템 유니폼 섹션.** Inspector에 "System uniforms (auto-bound)" 섹션 — **이 노드 소스가 선언한 것만** 표시. 행: 이름 / 타입 / 현재 값 / **바인딩 여부**. \`u_view·u_proj·u_model·u_camera\` 는 fullscreen 패스에서 \`not bound (fullscreen pass)\` 회색 처리 ← (a)의 meshIsFullscreen 발행을 그대로 재사용. 설명 문자열은 \`SYSTEM_UNIFORM_DESCRIPTIONS\` 재사용(새로 쓰지 마라).
(d) [B-1] **Mesh attribute 계약 노출.** Compute 노드가 이미 하는 것과 **같은 패턴**(Inspector의 Attributes 섹션)이라 UI 선례가 있다. Mesh 노드 카드 / mesh 포트 hover에 \`a_position vec3 · a_normal vec3 · a_uv vec2\` + vertexCount / indexCount / primitive. 프리미티브는 정적으로 알 수 있고, 에셋 메시는 \`assetStore.meshes[id].data.attributes\` 에서 읽는다. **Compute 출력도 타입이 mesh지만 실체는 TF ping-pong 버퍼**라는 사실을 구분해 표시하라.

**공유 배관**: (a)(b)(c)가 전부 같은 발행 지점(\`Viewport/index.tsx\` recompile)과 같은 사실(meshIsFullscreen)을 쓴다. **중복 스토어를 만들지 말고 하나의 leaf 스토어로 통합**하라(예: \`src/state/passPlanStore.ts\`). 순환 의존성 0을 반드시 확인할 것.`,
    hints: [
      "src/core/graph/compile.ts:65-88(ShaderPass) · :99-127(ComputePass) · :124-160(ExecutionPlan) · :551-579(fullscreen 대체) · :661 · :183·190(emptyPlan)",
      "src/ui/Viewport/index.tsx:205(recompile) · :233-234(compiledVertexSource 발행) · :240(retainOnly) · :257(setPanes) — 발행 지점",
      "src/state/diagnosticsStore.ts(leaf 스토어 선례) · src/state/debugUiStore.ts:42-54(상호 배타) · src/state/gpuTimerStore.ts:15",
      "src/ui/Panels/StatusOverlays.tsx(트랜지언트 오버레이) · StatusBar.tsx:82-83·172·183(트리거)",
      "src/ui/CodeEditor/StageTabs.tsx:22·29(라벨 하드코딩) · src/ui/CodeEditor/index.tsx(readOnly) · src/ui/Viewport/compileErrorInfo.ts:127-134(발췌 소스 주석)",
      "src/ui/NodeEditor/nodes/ShaderNodeView.tsx · ErrorBadge.tsx · BlockedBadge.tsx · GpuTimerChip.tsx(배지 선례) · MeshNodeView.tsx · PortHandle.tsx(툴팁)",
      "src/ui/Panels/Inspector.tsx(Compute Attributes 섹션 ≈:287-307 = B-1/C-1의 선례) · src/core/graph/uniformParser.ts:67-92",
      "src/core/assets/primitives.ts(a_position/a_normal/a_uv 고정) · objLoader.ts:76-82 · src/state/assetStore.ts",
      "tests/e2e/phase-3-4-editor-uniform.spec.ts · phase-9-editor-ux.spec.ts · m7-code-auto-open.spec.ts(vertex 탭 내용을 가정할 수 있음 — 먼저 확인) · phase-5-6-graph-chain.spec.ts · phase-13-compute.spec.ts · phase-15-gpu-timer.spec.ts · phase-17-resolution-scale.spec.ts",
    ],
    checks: [
      "meshIsFullscreen이 **plan에서 발행**되고 그래프 유추가 아닌지 · emptyPlan(cycle) 케이스의 배지 상태 방침이 코드 주석으로 명시됐는지",
      "fullscreen 노드의 vertex 탭이 실제 fullscreen.vert 내용을 읽기 전용으로 보이는지 · mesh 연결 시 사용자 소스로 복귀하고 편집 가능한지",
      "vertex 에러 오버레이 발췌가 화면에 보이는 소스와 일치하는지(compileErrorInfo의 fallback 주석도 갱신됐는지)",
      "Pass Inspector 행이 plan.passes 위상 순서와 1:1인지 · FBO 크기가 resolutionScale을 반영하는지 · ping-pong read 측이 표시되는지 · GPU 타이머 미지원에서 깨지지 않는지",
      "요약 발행이 recompile에서만 일어나고 RAF hot path에 들어가지 않았는지 · 요약이 얕은지(깊은 복사/대형 객체 생성 없음)",
      "C-1이 **그 노드 소스가 선언한 시스템 유니폼만** 보여주는지 · SYSTEM_UNIFORM_DESCRIPTIONS를 재사용했는지(문구 중복 정의 금지) · fullscreen에서 u_view가 '미바인딩'으로 표시되는지",
      "B-1이 프리미티브 5종 + 임포트 OBJ/glTF 전부에서 정확한지 · compute 출력 mesh(TF 버퍼)와 실제 지오메트리를 구분해 표시하는지",
      "새 스토어가 leaf인지(다른 스토어 import 0) · 스토어가 중복 생성되지 않고 하나로 통합됐는지 · npm run circular 0건인지",
      "신규 토큰 0 · design/ 미수정 · DockPanelId 미확장 · raw hex 0인지",
      "SPEC.md에 Phase 36 항목이 추가됐고 tests/e2e에 신규 스펙 파일(phase-36-*)이 추가됐는지",
    ],
    specPolicy: "allow",
  },
  {
    id: "M2",
    phase: "M2 Silence",
    tier: "T2",
    items: ["E-1", "E-4", "B-2"],
    dependsOn: ["M0", "M1"],
    parallelUnits: true,
    bundleGate: true,
    specPhase: "Phase 37 — 조용한 실패의 진단 승격",
    lenses: ["regression", "truthfulness", "gate-risk"],
    goal: `T2 — 침묵 제거. 조용한 실패를 진단으로 승격한다. **T1의 배관(plan 요약 발행)을 재사용하고 새로 만들지 마라.**

(a) [E-1] **미연결 sampler / 미사용 유니폼 경고.** ProblemsPanel에 warning 행을 추가한다.
   - \`u_tex: sampler 선언됐으나 연결된 엣지 없음 → 검은색 샘플링\`
   - \`u_foo: 선언됐으나 프로그램에 존재하지 않음(미사용/최적화 제거)\`
   - 데이터: \`parseUniforms\` 결과 ∖ \`pass.samplers\`/\`paramBindings\`, 그리고 \`program.uniforms\` 의 loc 유무.
   - ⚠ **주의**: GLSL 옵티마이저가 제거한 유니폼과 사용자 오타를 **구분할 수 없다.** 문구를 단정적으로 쓰지 마라("~일 수 있습니다" 톤). 이 한계를 문구에 반영했는지가 수용 기준이다.
   - severity는 warning(error 아님) — ProblemsPanel의 기존 severity 맵/칩 요약과 정합해야 한다.
(b) [E-4] **연결된 유니폼의 슬라이더 무력화 표시(L1).** 유니폼은 슬라이더이자 포트인데 엣지가 연결되면 슬라이더가 조용히 무력화된다(슬라이더는 여전히 활성이고 값도 움직이는데 화면만 안 변함). Inspector/UniformControl에 connected 체크가 **0건**이다.
   - 엣지가 연결된 유니폼은 슬라이더를 **비활성 + \`driven by <노드명>\`** 표시.
   - 데이터: \`graphStore.edges\` 에서 \`(target=nodeId, targetHandle=uniformName)\` 조회. 노드명은 \`displayNodeName\` 재사용.
(c) [B-2] **mesh attribute 소비 여부 체크.** 연결된 vertex shader가 선언한 attribute에 ✓, 안 쓰는 것에 \`제공되지만 미선언(스킵됨)\`. \`mesh.ts:35-36\` 의 조용한 스킵을 UI로 승격한다. **오타 탐지 장치로서 가치가 크다**(\`a_UV\` → 즉시 눈에 보임).
   - 데이터: \`uploadMesh\` 에 넘기는 \`attribLocations\`(= program.attributes) vs MeshData.attributes. **plan에 attribute 매칭 결과를 실어 보내야 할 수 있다** — 그 경우 M1이 만든 요약 스토어를 확장하라(새 스토어 금지).

**병렬 실행 주의**: 이 마일스톤의 유닛은 병렬로 돈다. (a)(b)(c)는 파일이 겹치지 않게 분해해야 한다 — 공통 배관(요약 스토어) 수정이 두 유닛에 걸치면 **하나의 유닛으로 합쳐라.**`,
    hints: [
      "src/ui/Panels/ProblemsPanel.tsx:17-30(severity 맵) · :56-115(칩 요약) · :156-180(행 렌더, testid problem-row) · problemsSummary.ts",
      "src/state/diagnosticsStore.ts(byNode) · src/core/graph/diagnostics.ts(GLSLDiagnostic)",
      "src/core/graph/uniformParser.ts(parseUniforms/samplerUniforms/inspectorUniforms) · src/core/gl/program.ts(uniforms/attributes) · src/core/gl/uniforms.ts:20",
      "src/core/graph/execute.ts:188(bindUserUniforms — paramBindings 덮어쓰기) · :224(bindSamplers)",
      "src/ui/Panels/Inspector.tsx · src/ui/Panels/UniformControl.tsx · src/ui/Panels/uniformFilter.ts · src/state/graphStore.ts(edges)",
      "src/core/gl/mesh.ts:29-45(attribLocations 스킵) · src/ui/NodeEditor/nodes/MeshNodeView.tsx",
      "tests/e2e/phase-16-diagnostics.spec.ts · phase-24-live-validation.spec.ts · phase-10-params-multioutput.spec.ts · phase-5-6-graph-chain.spec.ts",
    ],
    checks: [
      "E-1 경고 문구가 옵티마이저 제거와 오타를 구분할 수 없다는 한계를 반영해 **단정적이지 않은지** · severity가 warning이고 기존 칩 요약과 정합하는지",
      "E-1이 실제 미연결/미사용에만 뜨는지 — 정상 그래프(데모 4종)에서 오탐 0인지",
      "E-4가 (target=nodeId, targetHandle=uniformName) 엣지에 정확히 반응하는지 · 슬라이더가 실제로 disabled이고 `driven by <노드명>`이 보이는지 · 엣지를 끊으면 복귀하는지",
      "B-2의 ✓/미선언 판정이 program.attributes 실측 기준인지(소스 문자열 추측이 아닌지) · a_UV 같은 오타가 즉시 보이는지",
      "새 스토어를 만들지 않고 M1의 요약 스토어를 확장했는지 · 순환 0건인지",
      "병렬 유닛 간 파일 충돌이 없었는지(같은 파일을 두 유닛이 편집하지 않았는지)",
      "신규 토큰 0 · design/ 미수정 · raw hex 0 · 커버리지 임계 유지(신규 로직에 단위 테스트 동반)",
      "SPEC.md Phase 37 + tests/e2e/phase-37-* 신규 스펙이 추가됐는지",
    ],
    specPolicy: "allow",
  },
  {
    id: "M3",
    phase: "M3 Model",
    tier: "T3",
    items: ["C-2", "E-2", "E-3", "F-1", "F-2"],
    dependsOn: ["M0", "M1"],
    parallelUnits: true,
    bundleGate: true,
    specPhase: "Phase 38 — 멘탈 모델 교정 (기본값·렌더 상태·좌표계)",
    lenses: ["regression", "truthfulness", "design-canon", "gate-risk"],
    goal: `T3 — 잘못된 멘탈 모델 교정.

(a) [C-2] **\`uniformValues\` 하드코딩 초기값을 \`@default\`로 이관 — 이 계획에서 유일하게 "자동화를 제거"하는 항목.**
   - \`uniformParser\`는 **이미 \`@default V1, V2, V3\` 를 지원한다** → 파서 변경 불필요. 템플릿에 \`// @color @default 0.5, 0.7, 1.0\` 을 적고 노드 생성 시의 \`uniformValues: { u_baseColor: [...] }\` 하드코딩을 제거하면 **"시스템이 몰래 넣는 값"이 문자 그대로 사라진다.**
   - 대상: \`AddNodePill.tsx:101\` · \`CommandPalette/index.tsx:233·279·677\` · \`starter.frag\`.
   - ⚠ \`demoGraph.ts:23\` 은 **다른 값**(\`[0.3,0.7,1.0]\`)이다 — 데모의 의도된 아트디렉션일 가능성이 높다. 신규 노드 생성 4곳과 구분해 판단하고, 유지하기로 했다면 그 사유를 주석 + followups에 남겨라.
   - ⚠ **하위 호환**: 기존 저장 프로젝트(autosave/share URL)에 이미 uniformValues가 들어 있다. **저장된 값이 \`@default\`를 이기는 게 맞다**(현행 동작과 동일). 이 불변식을 단위 테스트로 못 박아라.
   - ⚠ **E2E 영향 확실**: \`phase-7-8-assets-serialization.spec.ts:79-86\` 이 직렬화된 uniformValues.u_baseColor를 단언한다. \`shareUrl.test.ts:18\` 도 갱신 대상. **약화가 아니라 새 진실을 단언하는 방향**으로만 고치고 전부 followups(audience:'user')에 기록하라.
(b) [E-2] **렌더 상태 표시(L4).** Pass Inspector 행(M1 산출물)에 \`blend off · cull off · depth on|off\` 표시.
   - **최소한 알파가 무시된다는 사실을 어딘가에 명시하라.** 현재 \`gl.enable(gl.BLEND)\` 호출이 0건이라 \`outColor.a\` 를 써도 아무 일도 안 일어나는데 설명이 없다.
   - **블렌딩을 실제로 노출(포트/노드 옵션 추가)하는 것은 범위 밖이다** — 표시만 하고, 필요하면 designRequests/followups에 남겨라.
(c) [E-3] **텍스처 파라미터 표시(L2).** Image 노드와 Shader 노드(FBO)에 wrap/filter/mipmap 표시. 중간 텍스처(CLAMP_TO_EDGE+LINEAR, 밉맵 없음)와 이미지 텍스처(REPEAT+LINEAR_MIPMAP_LINEAR)가 달라 **같은 GLSL이 다른 결과**를 내는 사실을 드러낸다.
   - ⚠ 계획서 **D-4 미결**: Image 노드 wrap/filter를 조작 가능하게 만들지는 미정이며, 그렇게 하면 \`ImageGraphNode\` 스키마 확장 → 직렬화/sanitize/undo 경로 전부 영향이다. **이 워크플로우의 잠정 결정: 표시만 한다**(범위 확대 회피). 조작 가능화는 followups(audience:'user', D-4)에 기록하라.
   - 값은 \`texture.ts\` 의 실제 호출과 **한 곳에서** 파생시켜라 — UI에 상수 문자열을 손으로 복제해 두면 코드가 바뀔 때 다시 거짓말이 된다.
(d) [F-1] **좌표계 설명 카드(L3).** UV 원점 · \`gl_FragCoord\` · \`u_mouse\` · 이미지 flip · 썸네일 readback Y-flip이 어떻게 맞물리는지 한 장.
   - 계획서는 "HelpModal에 탭 추가"라고 쓰지만 **현재 HelpModal에 탭 UI는 없다**(\`.help-modal__section\` 나열). 탭 신설은 디자인 결정이므로 **섹션 추가가 최소 침습**이다. 탭이 정말 필요하다고 판단되면 designRequests에 담고 섹션으로 진행하라.
   - 내용은 **코드에서 검증한 사실만** 적어라(fullscreen.vert 좌하단 · texture.ts의 UNPACK_FLIP_Y · gl_FragCoord/u_mouse 좌하단). 추측 금지.
(e) [F-2] **데모를 레슨화(L8, 저비용).** 기존 데모 4종에 Group 노드 \`label\` 로 단계 설명 삽입. 코드 변경 최소. 데모 그래프의 **동작·노드 구성은 바꾸지 마라**(E2E가 데모 구조를 가정한다).

**병렬 주의**: (a)~(e)는 파일이 겹치지 않게 분해하라. (b)는 M1의 Pass Inspector 파일을 건드리므로 다른 유닛과 같은 파일을 공유하면 안 된다.`,
    hints: [
      "src/shaders/templates/starter.frag:23-24 · src/ui/NodeEditor/AddNodePill.tsx:101 · src/ui/CommandPalette/index.tsx:233·279·677 · src/state/demoGraph.ts:23",
      "src/core/graph/uniformParser.ts:160-175(@range/@label/@default 힌트 파서) · src/state/serialization.ts · src/state/projectSanitize.ts · src/state/shareUrl.ts",
      "src/state/shareUrl.test.ts:18 · tests/e2e/phase-7-8-assets-serialization.spec.ts:79-86 · src/shaders/templates/starter.test.ts:75-76",
      "src/core/graph/execute.ts:335-352(BLEND 0건 · CULL_FACE 항상 disable · DEPTH_TEST는 meshIsFullscreen 분기)",
      "src/core/gl/texture.ts:29-32(FBO) · :53-67(이미지 UNPACK_FLIP_Y + mipmap + REPEAT)",
      "src/shaders/fullscreen.vert(좌하단 UV) · src/ui/NodeEditor/NodeThumbnail.tsx(썸네일 readback Y-flip) · src/state/mouseStore.ts",
      "src/ui/NodeEditor/HelpModal.tsx(.help-modal__section 나열 구조, 132줄) · src/state/demoGraph.ts(Group 노드 label)",
      "tests/e2e/phase-19-mouse-frame.spec.ts · phase-29-node-groups.spec.ts · phase-30-group-collapse.spec.ts · phase-11-share-export.spec.ts",
    ],
    checks: [
      "C-2: 신규 Shader 노드 생성 4경로 전부에서 uniformValues 하드코딩이 사라졌고 @default가 그 값을 대신하는지 · 첫 프레임 렌더 결과가 이전과 동일한지",
      "C-2 하위 호환: 저장된 uniformValues가 @default를 **이기는지** — 단위 테스트로 못 박혔는지 · 기존 share URL/autosave가 깨지지 않는지",
      "C-2 E2E 스펙 변경이 **약화가 아니라 새 진실 단언**인지 · demoGraph의 다른 값에 대한 판단 근거가 주석/followups에 있는지",
      "E-2가 Pass Inspector 행에 렌더 상태를 표시하고, 알파 무시 사실이 사용자에게 도달하는지 · 블렌딩 기능 자체를 추가하지 않았는지(범위 준수)",
      "E-3 값이 texture.ts의 실제 호출에서 파생되는지(UI에 손으로 복제한 상수 문자열이 아닌지) · Image 노드 스키마를 확장하지 않았는지(D-4 = 표시만)",
      "F-1 카드의 모든 주장이 코드에서 검증 가능한지(추측 문장 0) · HelpModal에 탭을 신설하지 않고 섹션으로 처리했는지",
      "F-2가 데모 그래프의 동작/노드 구성을 바꾸지 않고 label만 추가했는지 · 데모 관련 E2E가 무수정 통과인지",
      "신규 토큰 0 · design/ 미수정 · raw hex 0 · 커버리지 임계 유지",
      "SPEC.md Phase 38 + tests/e2e/phase-38-* 신규 스펙이 추가됐는지",
    ],
    specPolicy: "allow",
  },
  {
    id: "M4",
    phase: "M4 Varying",
    tier: "T4",
    items: ["A-2"],
    dependsOn: ["M0", "M1"],
    parallelUnits: false,
    bundleGate: true,
    specPhase: "Phase 39 — varying 계약 시각화",
    lenses: ["regression", "truthfulness", "gate-risk"],
    goal: `T4 — **A-2 varying 계약 시각화만.** (A-3 Shader 노드 분리는 이 워크플로우의 명시적 범위 밖이다 — 착수하지 마라. 직렬화 v1→v2 마이그레이션·ExecutionPlan 구조 변경·E2E 대부분 영향이 걸린 breaking 변경이며 별도 계획 문서가 필요하다.)

- 노드 카드/Inspector에 \`vertex ▸ fragment\` 사이 **varying 브리지 섹션**: \`v_uv vec2 ✓ · v_normal vec3 (미사용) · v_world vec3 (미사용)\` — vertex의 \`out\` ∩ fragment의 \`in\` 매칭 표시.
- **fragment가 받는데 vertex가 안 주면 링크 에러 사전 경고.** 이게 진짜 학습 장치다 — 링커가 말해주기 전에 UI가 먼저 말한다.
- 데이터: \`src/core/glsl/symbolTable.ts\` 의 \`buildSymbolTable(source)\` 가 이미 심볼을 파싱한다 → **재사용 가능성을 먼저 확인**하고, 부족하면 최소 확장만 하라(별도 파서 신설 금지).
- ⚠ **A-1과의 정합**: fullscreen으로 컴파일되는 노드는 vertex 쪽 계약이 \`fullscreen.vert\`(v_uv만)에서 온다. **사용자 소스가 아니라 실제 컴파일된 소스 기준**으로 매칭해야 정직하다 — M1이 발행한 meshIsFullscreen/compiledVertexSource를 쓰라.
- 오탐 주의: 전처리기 분기(#ifdef)·주석 안 선언·구조체 varying 등에서 심볼 파싱이 틀릴 수 있다. 확신이 낮은 케이스는 경고를 띄우지 말고 조용히 넘겨라(거짓 경고가 침묵보다 나쁘다). 그 판단 기준을 주석에 남겨라.`,
    hints: [
      "src/core/glsl/symbolTable.ts:41(GlslSymbol) · :62(SymbolTable) · :395(buildSymbolTable) · :678(symbolsVisibleAt) · :728(resolveSymbol)",
      "src/shaders/basic.vert · src/shaders/fullscreen.vert · src/shaders/templates/starter.frag:21(in vec2 v_uv) · unlit.frag(v_normal 소비)",
      "M1 산출물: meshIsFullscreen / compiledVertexSource 발행 스토어 — 실제 컴파일 소스 기준 매칭에 필요",
      "src/ui/Panels/Inspector.tsx · src/ui/NodeEditor/nodes/ShaderNodeView.tsx · src/ui/Panels/ProblemsPanel.tsx(사전 경고 출구 후보)",
      "tests/e2e/phase-25-glsl-lsp.spec.ts · phase-27-glsl-refs-rename.spec.ts · phase-28-cross-stage-rename.spec.ts(symbolTable 소비처 회귀 위험)",
    ],
    checks: [
      "varying 매칭이 **실제 컴파일된 vertex 소스**(fullscreen 대체 반영) 기준인지 — 사용자 소스 기준이면 A-1이 고친 거짓말이 되살아난다",
      "fragment in ∖ vertex out 케이스에 링크 에러 사전 경고가 뜨는지 · 반대(vertex만 out)는 정상으로 취급하는지(링크 에러가 아님)",
      "symbolTable을 재사용했고 별도 GLSL 파서를 신설하지 않았는지 · 기존 LSP 소비처(hover/rename/refs)에 회귀가 없는지",
      "#ifdef·주석·구조체 등 파싱 불확실 케이스에서 **거짓 경고를 내지 않는지** · 그 판단 기준이 주석에 있는지",
      "A-3(노드 분리)에 해당하는 변경이 섞여 들어가지 않았는지 — 직렬화 스키마·ExecutionPlan 구조·GraphNode 종류가 불변인지",
      "신규 토큰 0 · design/ 미수정 · raw hex 0 · 커버리지 임계 유지",
      "SPEC.md Phase 39 + tests/e2e/phase-39-* 신규 스펙이 추가됐는지",
    ],
    specPolicy: "allow",
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// 적대적 검증 렌즈
// ─────────────────────────────────────────────────────────────────────────────
const LENS_SPECS = {
  regression: {
    title: "회귀 — 기존 동작이 깨졌는가",
    focus: `기존 기능(상태 로직·상호작용·단축키·직렬화·undo/redo·데모 그래프)이 이 변경으로 깨지는 경로를 찾아라.
- git diff 로 삭제·수정된 라인을 하나씩 훑고, 각 소비처를 grep으로 역추적하라.
- 특히: 스토어 구독 변경이 불필요한 리렌더/무한 루프를 만드는가 · recompile 경로에 추가된 작업이 RAF hot path로 새는가 · plan이 비어 있는(emptyPlan/cycle/GPU 미지원/에셋 미로드) 경우의 분기가 있는가 · React hook deps 누락이 있는가.
- **실패 시나리오를 구체적 입력·상태로 서술하라**("큰 그래프에서 느릴 수 있다" 같은 막연한 지적은 금지).`,
  },
  truthfulness: {
    title: "정직성 — 새 UI가 실제로 진실을 말하는가",
    focus: `이 라운드의 존재 이유는 "UI가 거짓말하지 않게 하는 것"이다. 새로 추가된 표시가 **또 다른 거짓말이 되는 경로**를 찾아라.
- 표시된 값이 런타임의 실제 값과 갈라지는 조건이 있는가? (예: plan이 재컴파일되기 전의 스테일 값, 상수를 UI에 손으로 복제해 둔 곳, 그래프에서 유추한 값)
- 배지/라벨이 뜨지 **않아야** 할 때 뜨거나, 떠야 할 때 안 뜨는 조건이 있는가?
- 경고 문구가 실제로 구분할 수 없는 두 원인(옵티마이저 제거 vs 오타 등)을 단정하고 있는가?
- 새 표시가 실제 GL 호출/plan 필드에서 파생되는가, 아니면 사람이 적어 넣은 문자열인가? **후자는 코드가 바뀌면 즉시 거짓이 된다.**`,
  },
  "design-canon": {
    title: "디자인 정본 — 무침습 원칙을 지켰는가",
    focus: `[디자인 무침습 원칙] 위반을 찾아라.
- design/ 아래 파일이 수정됐는가? (git diff --stat design/ — 하나라도 있으면 blocker)
- src/theme.ts에 신규 토큰이 추가되거나 값이 바뀌었는가? (blocker)
- dockTree.ts의 DockPanelId가 확장됐는가? (blocker)
- 컴포넌트에 raw hex가 직접 쓰였는가? grep -rnE '#[0-9a-fA-F]{3,8}\\b' 로 확인(예외: src/theme.ts, ErrorBoundary 폴백, src/export/standalonePlayer.js, *.test.*, 주석 속 참조값).
- 새 UI가 사다리(기존 표면 재사용 → 선례 복제 → 최소 마크업)의 몇 번째 칸을 썼는가? 더 위 칸으로 해결 가능했는데 내려간 곳이 있으면 지적하라.
- 디자이너 결정이 필요한 지점을 designRequests에 기록하지 않고 임의로 확정한 곳이 있는가? 있으면 **당신이 designRequests에 채워 넣어라.**`,
  },
  "gate-risk": {
    title: "게이트 리스크 — check/e2e/번들이 빨개질 경로",
    focus: `게이트를 실제로 돌리기 전에 실패를 예측하라(게이트 실행은 별도 단계다 — 여기서는 정적으로 읽어라).
- **Knip**: 새 export에 실제 호출자/임포터가 같은 변경 안에 있는가? 삭제한 심볼의 소비처·테스트가 고아로 남았는가?
- **circular**: 새 스토어/모듈이 다른 스토어를 import하는가? 양방향 참조가 생겼는가?
- **typecheck**: noUncheckedIndexedAccess(배열/Record 접근 후 undefined 처리) · exactOptionalPropertyTypes(optional 프로퍼티에 undefined 명시 할당) · noUnusedLocals 위반이 있는가?
- **biome**: 새 biome-ignore가 추가됐는가(금지)? useExhaustiveDependencies 위반은?
- **커버리지**: 신규 파일/분기에 단위 테스트가 동반됐는가? 테스트 없는 큰 신규 파일은 임계치를 떨어뜨린다.
- **E2E**: tests/e2e 변경이 있다면 expect 약화·skip·fixme가 있는가(blocker)? 기존 스펙이 가정하는 DOM 구조(testid·텍스트·순서)를 이 변경이 깨는가?
- **번들**: 이 변경이 엔트리 청크에 얼마나 붙는가? 큰 라이브러리를 새로 정적 import했는가?`,
  },
  measurement: {
    title: "측정 정확성 — 번들 게이트가 옳은 것을 재는가",
    focus: `M0 전용 렌즈. 게이트 스크립트 자체의 정확성을 의심하라.
- 엔트리 청크 식별이 정말 견고한가? manifest가 없거나 isEntry 항목이 0개/2개 이상일 때 어떻게 되는가? **조용히 통과하는 경로가 하나라도 있으면 blocker**(방침은 exit 2).
- entry 그룹이 정말 "사용자가 첫 로딩에서 기다리는 것"을 재는가? 엔트리가 정적으로 import하는 공유 청크가 빠져 있어 과소 측정하지는 않는가? (manifest의 imports 체인을 따라가야 정확할 수 있다 — 어느 쪽으로 정했든 근거가 주석에 있어야 한다.)
- total 안전망이 실제로 검사되는가(둘 중 하나만 검사하고 끝나지 않는가)?
- 보고된 실측 수치가 **Node 22**에서 나온 것인가? 경고가 뜬 채로 기록된 수치는 근거가 아니다.
- 기존 주석 이력이 소실되지 않았는가? 새로 추가된 사유가 "무엇을 왜 바꿨는지 + 실측치"를 담고 있는가?
- loaders.gl 동적 분리가 정말 엔트리에서 빠졌는가(빌드 출력/manifest로 확인) — 어딘가에 남은 정적 import 하나가 전부 무효화한다.`,
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 스키마
// ─────────────────────────────────────────────────────────────────────────────
const FOLLOWUP_ITEMS = {
  type: "array",
  description:
    "**사용자** 판단이 필요한 항목(스코프·정책·게이트·E2E 스펙 변경). 작업을 멈추지 말고 잠정 결정으로 진행한 뒤 여기에 기록하라. 디자인 결정은 여기가 아니라 designRequests로. 없으면 빈 배열.",
  items: {
    type: "object",
    required: ["audience", "title", "context", "interimDecision"],
    properties: {
      audience: {
        type: "string",
        enum: ["user"],
        description: "이 배열은 사용자 판단 전용이다(디자인은 designRequests).",
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

const DESIGN_REQUEST_ITEMS = {
  type: "array",
  description:
    "**디자이너** 결정이 필요한 항목. design/ 정본(v2.2)이 정의하지 않은 지점에서 구현이 잠정 결정을 내렸을 때마다 여기에 담아라. 워크플로우가 이것을 실제 요청서로 발행한다. 없으면 빈 배열.",
  items: {
    type: "object",
    required: [
      "area",
      "title",
      "background",
      "interimDecision",
      "options",
      "recommendation",
      "changeLocations",
    ],
    properties: {
      area: {
        type: "string",
        description: "그룹핑용 주제. 예: 'Pass Inspector 배치' / '노드 카드 배지' / 'Inspector 섹션' / 'HelpModal' / 'ProblemsPanel 경고'",
      },
      title: { type: "string", description: "한 줄 제목 (요청서 소제목이 된다)" },
      background: {
        type: "string",
        description:
          "design/ 정본(CHANGELOG·README·해당 .dc.html)이 **무엇을 정의하지 않았는지**. 참조한 dc 파일/섹션을 구체적으로 밝혀라.",
      },
      interimDecision: {
        type: "string",
        description: "지금 코드에 들어간 잠정 처리 (디자인 무침습 사다리의 몇 번째 칸을 썼는지 포함)",
      },
      options: {
        type: "array",
        items: { type: "string" },
        description: "디자이너가 고를 선택지. '(a) …' / '(b) …' 형식 문자열 2개 이상.",
      },
      recommendation: { type: "string", description: "권장안 + 이유 (구현 관점의 비용/영향 포함)" },
      changeLocations: {
        type: "array",
        items: { type: "string" },
        description: "다르게 확정될 경우 바꿔야 할 파일·심볼·CSS 클래스",
      },
      impact: { type: "string", description: "번들·E2E·직렬화·성능 영향" },
      newTokenNeeded: {
        type: "boolean",
        description: "이 요청이 신규 토큰을 필요로 하는지(true면 예산 검토가 선행된다)",
      },
    },
  },
}

const SETUP_SCHEMA = {
  type: "object",
  required: ["ok", "reason"],
  properties: {
    ok: { type: "boolean" },
    branch: { type: "string" },
    t0Applied: {
      type: "boolean",
      description:
        "T0(번들 예산 확보)가 **이미 반영된 상태**인지 — 재개 실행 판별용. scripts/check-bundle-size.mjs의 LIMITS_KIB가 entry 키를 갖고 있고 assetActions.ts가 loaders를 동적 import하면 true.",
    },
    baselineBundle: {
      type: "object",
      description: "Node 22 기준 베이스라인 번들 실측",
      properties: {
        nodeMajor: { type: "number" },
        totalKiB: { type: "number" },
        measuredOnNode22: { type: "boolean" },
      },
    },
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
            description:
              "구현 지시 — 파일별 변경 내용, 참조할 기존 패턴/선례, 데이터 출처(plan 필드), 주의점",
          },
          files: { type: "array", items: { type: "string" } },
          tests: { type: "string", description: "추가/갱신할 단위 테스트 + (해당 시) E2E 스펙" },
          acceptance: { type: "array", items: { type: "string" } },
        },
      },
    },
    notes: { type: "string", description: "아키텍처 결정 사항 + 유닛 간 공유 배관 설계" },
    followups: FOLLOWUP_ITEMS,
    designRequests: DESIGN_REQUEST_ITEMS,
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
    designRequests: DESIGN_REQUEST_ITEMS,
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
    designRequests: DESIGN_REQUEST_ITEMS,
  },
}

const FINDINGS_SCHEMA = {
  type: "object",
  required: ["findings", "summary"],
  properties: {
    findings: {
      type: "array",
      description:
        "이 렌즈로 발견한 결함. 추측이 아니라 **코드에서 재현 경로를 확인한 것만** 담아라. 없으면 빈 배열.",
      items: {
        type: "object",
        required: ["severity", "title", "description", "files", "failureScenario"],
        properties: {
          severity: {
            type: "string",
            enum: ["blocker", "major", "minor"],
            description: "blocker=기능 파손/규칙 위반 · major=목표 미달·부정확 · minor=다듬기",
          },
          title: { type: "string", description: "60자 이내 압축 라벨" },
          description: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          line: { type: "number" },
          failureScenario: {
            type: "string",
            description: "구체적 입력·상태 → 잘못된 출력/크래시. 막연한 우려는 담지 마라.",
          },
          fixHint: { type: "string" },
        },
      },
    },
    summary: { type: "string", description: "이 렌즈에서 본 전반 상태" },
    followups: FOLLOWUP_ITEMS,
    designRequests: DESIGN_REQUEST_ITEMS,
  },
}

const REFUTE_SCHEMA = {
  type: "object",
  required: ["refuted", "reasoning"],
  properties: {
    refuted: {
      type: "boolean",
      description:
        "true = 이 지적은 성립하지 않는다(코드를 직접 읽고 반증했다). **재현 경로를 확인하지 못했다고 해서 true를 내지 마라 — 확신이 없으면 false(유지)다.**",
    },
    reasoning: { type: "string", description: "코드 근거. 반증이면 왜 그 실패가 불가능한지." },
    evidence: { type: "string", description: "확인한 file:line / 실행한 명령과 출력" },
    severityAdjustment: {
      type: "string",
      enum: ["keep", "raise", "lower"],
      description: "유지하되 심각도 조정이 필요하면",
    },
  },
}

const GATE_SCHEMA = {
  type: "object",
  required: ["checkPass", "e2ePass", "failures"],
  properties: {
    checkPass: { type: "boolean" },
    e2ePass: { type: "boolean", description: "check 실패로 e2e를 못 돌렸으면 false" },
    bundlePass: {
      type: "boolean",
      description: "번들 게이트 대상 마일스톤에서만 유효. 미실행이면 true로 두지 말고 실행하라.",
    },
    bundleReport: {
      type: "string",
      description: "size:check 출력 요약 (entry/total 수치 + Node 버전). 미실행이면 사유.",
    },
    failures: {
      type: "array",
      items: {
        type: "object",
        required: ["gate", "summary"],
        properties: {
          gate: {
            type: "string",
            enum: ["typecheck", "lint", "deadcode", "circular", "unit", "e2e", "bundle"],
          },
          summary: { type: "string" },
          detail: { type: "string", description: "핵심 에러 메시지 / 실패 스펙명·라인" },
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
      description:
        "이번 티어의 의도된 동작 변경 때문에 기존 E2E expectation이 더 이상 유효하지 않은 경우만. **약화·skip·fixme는 절대 제안하지 마라.**",
      items: {
        type: "object",
        required: ["spec", "reason", "proposedChange"],
        properties: {
          spec: { type: "string", description: "스펙 파일 + 테스트명" },
          reason: { type: "string", description: "왜 회귀가 아니라 의도된 변경인지 (계획서 어느 항목인지)" },
          proposedChange: { type: "string" },
        },
      },
    },
    followups: FOLLOWUP_ITEMS,
    designRequests: DESIGN_REQUEST_ITEMS,
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
  required: ["items", "bundle"],
  properties: {
    items: {
      type: "array",
      description: "계획서 §6 트래커의 모든 항목(A-3 제외)에 대한 최종 판정",
      items: {
        type: "object",
        required: ["id", "status", "note"],
        properties: {
          id: {
            type: "string",
            description: "T0-1 / T0-2 / T0-3 / A-1 / D-1 / C-1 / B-1 / E-1 / E-4 / B-2 / C-2 / E-2 / E-3 / F-1 / F-2 / A-2",
          },
          status: {
            type: "string",
            enum: ["done", "partial", "deferred", "not-covered"],
          },
          note: { type: "string", description: "근거 (커밋/파일), 또는 왜 미처리인지" },
        },
      },
    },
    trackerUpdated: { type: "boolean", description: `${PLAN_DOC} §6 트래커가 갱신됐는지` },
    specPhasesAdded: {
      type: "array",
      items: { type: "string" },
      description: "SPEC.md에 실제로 추가된 Phase 제목들",
    },
    bundle: {
      type: "object",
      required: ["measuredOnNode22"],
      properties: {
        measuredOnNode22: { type: "boolean" },
        nodeVersion: { type: "string" },
        entryKiB: { type: "number", description: "엔트리 청크 gzip. 미측정이면 -1" },
        totalKiB: { type: "number", description: "전체 합계 gzip. 미측정이면 -1" },
        entryLimit: { type: "number" },
        totalLimit: { type: "number" },
        pass: { type: "boolean" },
      },
    },
    residualHexCount: { type: "number" },
    residualHexSummary: { type: "string" },
    designUntouched: {
      type: "boolean",
      description: "design/ 아래 파일이 하나도 수정되지 않았는지 (git diff 기준)",
    },
    newTokenCount: { type: "number", description: "src/theme.ts에 추가된 신규 토큰 수 (0이어야 함)" },
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// 프롬프트 빌더
// ─────────────────────────────────────────────────────────────────────────────
function budgetBlock(budgetSecured) {
  if (budgetSecured)
    return `
[예산 상태] M0(T0)이 초록으로 커밋됐다 — 게이트가 엔트리 청크 기준으로 전환됐고 loaders.gl이 분리됐다. 엔트리 기준 여유는 ~26 KiB이며 T1~T4 전체를 담도록 산정된 값이다. 그래도 **한 마일스톤이 예산을 독식하지 않게** 신규 코드량을 의식하라.`
  return `
[⚠ 예산 상태 — M0 미확보] T0이 아직 초록이 아니다(미실행 또는 격리됨). 현재 게이트는 여전히 **전체 합계 396 KiB**이고 실측 여유는 **0.88 KiB**다.
- 이 마일스톤의 UI 추가는 거의 확실히 번들 게이트를 빨갛게 만든다. **그래도 scripts/check-bundle-size.mjs 를 고치지 마라.**
- 코드량을 최소로 유지하고(기존 컴포넌트/문자열 재사용, 새 CSS/마크업 최소화), 초과 시 followups(audience:'user')에 "T0 미확보 상태에서 초과 — T0 완료 후 재측정 필요"로 기록하라.`
}

function refBlock(m, budgetSecured) {
  return `[근거 문서 — 반드시 직접 읽을 것]
- ${PLAN_DOC} — 이 작업의 계획 정본. §1 원칙 · §2 문제 목록 · §3 전역 제약 · §4 티어별 작업 패키지(이 마일스톤 = ${m.tier}) · §5 미결 결정 · §6 트래커.
- CLAUDE.md — 품질 게이트 규약 / Architecture.md — 모듈 경계(§2.2 포트 동적 생성 · §3.1 컴파일 절차 · §3.2 sampler vs param · §4.4 시스템 유니폼) / SPEC.md — Phase별 명세(최신 Phase 35)
- design/CHANGELOG.md · design/README.md(현행 정본 **v2.2**) — **읽기 전용 입력이다. 절대 수정하지 마라.**

[관통 원칙 — 이 라운드의 정신]
> **자동화를 없애지 말고, 자동화의 결과를 1급 UI로 승격하라.**
자동 유니폼 주입·자동 vertex 대체·자동 FBO 체이닝은 이 앱의 가치 제안("환경 세팅 부담 없음")이다. **제거하면 진입장벽이 되돌아온다.** 목표는 자동화 제거가 아니라 자동화가 한 일을 **볼 수 있게** 만드는 것이다.
유일한 예외는 **C-2**(uniformValues 하드코딩 초기값) — 소스 어디에도 근거가 없는 진짜 "몰래 넣는 값"이라 제거가 정답이다.

[이 마일스톤이 처리하는 항목] ${m.items.join(" · ")} (계획서 ${m.tier})
${m.specPhase ? `[SPEC 신규 항목] ${m.specPhase} — SPEC.md의 \`### (백로그)\` 위에 삽입한다.` : "[SPEC] 이 마일스톤은 순수 배관이라 SPEC Phase를 추가하지 않는다."}
${budgetBlock(budgetSecured)}
${KNOWN_FACTS}`
}

function depsBlock(m, quarantined) {
  const broken = (m.dependsOn || []).filter((d) => quarantined.includes(d))
  if (broken.length === 0) return ""
  return `

[⚠ 선행 마일스톤 실패] ${broken.join(", ")} 가 게이트를 통과하지 못해 **격리(stash)되어 브랜치에서 빠졌다.** 그 결과물은 현재 코드에 **없다.**
- 그 선행 결과(예: M1의 plan 요약 스토어, meshIsFullscreen 발행)에 의존하는 유닛은 **계획에서 제외**하고, 의존하지 않는 나머지만 진행하라 (워크플로우를 멈추지 말 것).
- 이 마일스톤이 사실상 진행 불가라면 유닛을 "조사만" 수준으로 축소하고 followups(audience:'user')에 "${broken.join(",")} 복구 후 재실행 필요"를 기록하라.`
}

function parallelBlock(m) {
  return m.parallelUnits
    ? `

[⚠ 이 마일스톤의 유닛은 **병렬 실행**된다]
- **유닛 간 파일이 절대 겹치면 안 된다** — 겹치면 서로의 편집을 덮어쓴다.
- **유닛 간 결과 의존이 없어야 한다.** 겹치거나 의존하면 하나의 유닛으로 합쳐라.
- 공통 배관(요약 스토어·공유 헬퍼) 수정이 둘 이상 유닛에 걸치면, 그 배관 변경만 **선행 단일 유닛**으로 떼어내지 말고(순차 보장이 없다) 해당 유닛들을 하나로 병합하라.`
    : ""
}

function specPolicyBlock(m) {
  return m.specPolicy === "forbid"
    ? `

[🔒 이 마일스톤은 E2E 스펙 수정 금지]
이 변경은 기능 변경 0(순수 배관)이라 E2E에 영향이 없어야 정상이다. E2E가 깨지면 그건 **회귀**다 — tests/e2e/**를 고치지 말고 **코드를 고쳐서** 통과시켜라. 불가하면 followups(audience:'user')에 기록.`
    : `

[E2E 스펙 정책] 이 마일스톤은 신규 기능을 추가하므로 **신규 스펙 파일 추가**(계획서 D-3 기본 권장 = 티어마다)와 **기존 스펙의 추가 단언(강화)**이 정당하다.
**절대 금지**: 기존 expect 삭제·약화, test.skip, test.fixme. 의도된 동작 변경으로 기존 단언이 무효가 되면 **새 진실을 단언하는 방향**으로만 고치고 전부 followups(audience:'user')에 기록하라.`
}

function recoveryBlock(recovery) {
  if (!recovery) return ""
  return `

[🔁 재시도 — 이 마일스톤은 직전 시도에서 게이트를 초록으로 만들지 못했다]
직전 시도의 작업은 **격리하지 않았다. 작업 트리에 그대로 남아 있다.** \`git status\` / \`git diff\` 로 현재 상태를 먼저 파악하라.

[직전 시도 요약]
${recovery.summary}

[직전 시도가 남긴 게이트 실패]
${recovery.failures}
${recovery.remainingFindings ? `\n[적대적 검증에서 미해소로 남은 지적]\n${recovery.remainingFindings}` : ""}

[재시도 계획 원칙]
- **처음부터 다시 만들지 마라.** 이미 들어간 변경 중 옳은 부분은 살리고, 실패의 근본 원인만 겨냥한 유닛을 짜라.
- 직전 실패가 **접근법 자체의 문제**로 보이면(예: 배관 위치를 잘못 골라 순환 의존이 구조적으로 생김) 그때는 해당 부분을 되돌리는 유닛을 명시적으로 넣어라 — notes에 그 판단 근거를 적어라.
- 실패가 **범위 과다** 때문이면(예: 한 마일스톤에 너무 많은 신규 코드 → 커버리지/번들 초과) 항목 중 일부를 **의도적으로 축소**하고 축소분을 followups(audience:'user')에 기록하라. 전부 잃는 것보다 낫다.
- 이번이 마지막 시도다. 이후에도 초록이 아니면 이 마일스톤은 격리되고 의존하는 후속 티어가 함께 무너진다.`
}

function plannerPrompt(m, quarantined, budgetSecured, recovery) {
  return `당신은 ShaderPlayground **학습 가시성 개선 라운드**의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[배경] 이 프로젝트의 목표는 "학습자가 셰이더 파이프라인에서 정확히 무엇이 일어나는지 해부할 수 있어야 한다"이다. 2026-08-01 전수 조사에서 현재 구현이 **숨기거나 잘못 표시하고 있는 것** 11건이 확인됐고, ${PLAN_DOC} 가 이를 T0~T4 티어로 묶었다. 이 워크플로우는 **A-3(Shader 노드를 vertex/fragment 두 노드로 분리)을 제외한 전 항목**을 반영한다.

[마일스톤 ${m.id} = 계획서 ${m.tier}]
${m.goal}

${refBlock(m, budgetSecured)}${depsBlock(m, quarantined)}${recoveryBlock(recovery)}${parallelBlock(m)}${specPolicyBlock(m)}

[현재 코드 진입점 힌트]
- ${m.hints.join("\n- ")}

[할 일]
계획서와 현재 코드를 직접 읽고, 이 마일스톤을 **1~5개의 작업 유닛**으로 분해하라. 각 유닛은:
- 하위 모델(sonnet)이 이 지시만 보고 구현할 수 있을 만큼 구체적으로: 어떤 파일을 어떻게(file:line), 어떤 데이터를 plan/스토어의 어느 필드에서 가져오는지, 기존 코드의 어떤 패턴/선례를 따르는지.
- ${m.parallelUnits ? "**서로 파일이 겹치지 않게** 분해 (병렬 실행됨)" : "유닛 간 의존 순서대로 정렬 (앞 유닛의 결과 위에 뒤 유닛이 얹힘)"}.
- knip 제약: 새 export는 같은 유닛에서 호출자 연결. 고아 금지.
- tests: **커버리지 임계 유지를 위해 추가/갱신할 단위 테스트를 반드시 명시**하라. ${m.specPolicy === "allow" ? `E2E는 신규 스펙 파일(\`tests/e2e/phase-${m.specPhase ? m.specPhase.match(/\d+/)[0] : "36"}-*.spec.ts\`)을 어느 유닛이 만들지도 정하라.` : "이 마일스톤은 E2E 무영향이 정상이다 — E2E 스펙을 유닛에 넣지 마라."}
- acceptance: 검증자가 확인할 구체 기준.

**설계 지침**
- 이 마일스톤의 항목들이 **같은 데이터/배관을 공유**하는지 먼저 판단하라. 공유한다면 배관을 한 곳에 모아 중복 스토어/중복 계산을 만들지 마라(notes에 그 설계를 적어라).
- 기존 기능(상태 로직·상호작용·단축키·직렬화)은 **보존이 원칙**이다. 파괴적 재작성이 필요해 보이면 신호가 잘못된 것이니 notes에 사유를 적고 최소 변경으로 가라.
- 디자인이 확정하지 않은 지점이 보이면 **계획 단계에서 잠정 결정을 내려 유닛에 박아 넣고** designRequests에 기록하라. 계획을 미루지 마라.
${DESIGN_POLICY}
${CONSTRAINTS}
${GATE_RULES}
${AUTONOMY}`
}

function implPrompt(m, unit, answersBlock, priorSummary, budgetSecured) {
  const prior = priorSummary
    ? `\n[이전 시도의 부분 진행 상태 — 작업 트리에 이미 반영됨]\n${priorSummary}\n이어서 진행하라 (처음부터 다시 하지 말 것).`
    : ""
  const ans = answersBlock ? `\n[아키텍트(상위 모델)의 답변 — 이 결정을 따르라]\n${answersBlock}` : ""
  return `당신은 ShaderPlayground **학습 가시성 개선 라운드**의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).

[마일스톤 ${m.id}(${m.tier}) — 작업 유닛 ${unit.id}: ${unit.title}]
${unit.instructions}

[대상 파일] ${unit.files.join(", ")}
[테스트] ${unit.tests}
[수용 기준]
- ${unit.acceptance.join("\n- ")}

${refBlock(m, budgetSecured)}${parallelBlock(m)}${specPolicyBlock(m)}
${prior}${ans}

[진행 규칙]
- 확신 없는 설계 결정(배관 위치, 스토어 경계, 기존 동작 변경 여부, 삭제 범위)은 추측하지 말고 status:'blocked' + questions로 반환하라 → **fable 아키텍트가 답을 준다** (사용자를 기다리는 게 아니다).
- 사소한 구현 디테일은 스스로 결정하라. blocked는 정말 갈림길일 때만.
- **디자인 결정이 필요하면 멈추지 말고** [디자인 무침습 원칙]의 사다리로 잠정 처리한 뒤 designRequests에 기록하라.
- 새로 표시하는 값은 **런타임의 실제 값에서 파생**시켜라. 상수 문자열을 UI에 손으로 복제해 두면 코드가 바뀔 때 다시 거짓말이 된다 — 이 라운드가 고치려는 바로 그 병이다.
- 완료 시 status:'done', summary에 변경 요약과 주요 결정을 기록하라.
${DESIGN_POLICY}
${CONSTRAINTS}
${GATE_RULES}
${AUTONOMY}`
}

function oraclePrompt(m, unit, questions, priorSummary, budgetSecured) {
  const qs = questions.map((q, i) => `${i + 1}. ${q.question}\n   (context: ${q.context})`).join("\n")
  return `당신은 ShaderPlayground **학습 가시성 개선 라운드**의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
하위 구현 에이전트가 [마일스톤 ${m.id} / 유닛 ${unit.id}: ${unit.title}] 작업 중 다음 질문에 막혔다. **당신이 최종 결정권자다** — 사용자에게 넘길 수 없다.

[유닛 지시]
${unit.instructions}

[구현 에이전트의 진행 상태]
${priorSummary || "(없음)"}

[질문]
${qs}

${refBlock(m, budgetSecured)}

저장소 코드와 근거 문서(${PLAN_DOC}, Architecture.md, SPEC.md, CLAUDE.md, design/CHANGELOG.md)를 직접 확인하고 각 질문에 **단정적으로** 답하라 — 구체적 파일/필드/패턴을 지정하고 선택지 중 하나를 결정해줄 것.

[결정 원칙]
- "사용자에게 물어보라" / "디자이너 확인 필요" 같은 답은 **금지**다. 반드시 지금 실행 가능한 결정을 내려라.
- 답이 없어 보이면 우선순위: (1) 계획서 §4·§5의 기본 권장 → (2) 저장소의 기존 선례 패턴 근사 → (3) 현행 유지 + 사유 주석 → (4) 최소 변경.
- 디자인이 걸린 질문은 [디자인 무침습 원칙]의 사다리로 답하고, 그 항목을 designRequests에 담아라.
${DESIGN_POLICY}
${AUTONOMY}`
}

function lensPrompt(m, plan, lensKey, round, budgetSecured) {
  const lens = LENS_SPECS[lensKey]
  const acceptance = plan.units.map((u) => `- [${u.id}] ${u.acceptance.join(" / ")}`).join("\n")
  return `당신은 ShaderPlayground **학습 가시성 개선 라운드**의 검증자다. 저장소: ${ROOT} (브랜치 ${BRANCH}). 마일스톤 ${m.id}(${m.tier}), 검증 라운드 ${round}.
당신에게 배정된 렌즈는 **[${lens.title}]** 하나다. 다른 렌즈는 다른 에이전트가 동시에 본다 — **당신은 이 렌즈에만 집중하라.**

[당신의 렌즈]
${lens.focus}

[검증 대상] 아직 커밋되지 않은 작업 트리 변경. \`git status\` / \`git diff\` 로 이번 마일스톤의 변경을 파악하라. **코드를 수정하지 마라 — 읽고 판정만 한다.**

[이 마일스톤의 목표]
${m.goal}

[수용 기준 (플래너가 정의)]
${acceptance}

[마일스톤 특화 체크 — 당신의 렌즈와 겹치는 것만 보라]
- ${m.checks.join("\n- ")}

${refBlock(m, budgetSecured)}${specPolicyBlock(m)}

[시각/런타임 대조 — 가능하면 수행]
- \`npm run dev\`를 백그라운드 상주로 띄우고(이미 떠 있으면 재사용), 스크래치 디렉터리의 일회용 Playwright 스크립트로 실제 화면을 구동해 확인하라. WebGL은 playwright.config.ts의 SwiftShader 플래그를 참고.
- 특히 **[정직성] 렌즈**는 정적 코드 읽기만으로 부족하다 — 데모를 로드하고 노드를 선택해 새 표시가 실제 값과 일치하는지 눈으로 확인하라.
- 브라우저 구동이 불가하면 summary에 그 사실을 남기고 코드 대조만으로 판정하라. **확인하지 못한 것을 확인한 것처럼 쓰지 마라.**

[판정 규칙]
- findings에는 **코드에서 재현 경로를 확인한 것만** 담아라. 이 findings는 곧바로 다른 에이전트의 적대적 반증에 부쳐진다 — 근거 없는 지적은 기각되고 라운드만 낭비된다.
- 각 finding의 failureScenario는 **구체적 입력·상태 → 잘못된 결과**여야 한다. "~할 수 있다"는 서술은 finding이 아니다.
- severity: blocker(기능 파손·규칙 위반·게이트 확정 실패) / major(목표 미달·부정확한 표시·수용 기준 미충족) / minor(다듬기).
- 구현이 내린 **잠정 결정**은 근거 주석 + followups/designRequests 기록이 있으면 통과시켜라. 기록이 빠졌으면 **당신이 채워 넣어라**(그건 finding이 아니라 보완이다).
- 문제가 없으면 findings를 빈 배열로 반환하라. 없는 문제를 만들어내지 마라.
${AUTONOMY}`
}

function refutePrompt(m, finding, index) {
  return `당신은 ShaderPlayground 저장소 ${ROOT} (브랜치 ${BRANCH})의 **적대적 검토자 #${index + 1}** 다.
다른 검증 에이전트가 마일스톤 ${m.id}(${m.tier})의 작업 트리 변경에 대해 아래 지적을 제기했다. **당신의 임무는 이 지적을 반증하는 것이다.**

[제기된 지적]
- severity: ${finding.severity}
- title: ${finding.title}
- 설명: ${finding.description}
- 파일: ${(finding.files || []).join(", ")}${finding.line ? ` (line ${finding.line})` : ""}
- 주장하는 실패 시나리오: ${finding.failureScenario}

[반증 절차 — 순서대로 수행하라]
1. 지목된 파일을 **직접 열어 읽어라**. git diff로 이번 변경분을 확인하라.
2. 주장된 실패 시나리오를 **실제로 따라가라**. 그 입력/상태에서 코드가 정말 그 경로로 가는가? 위에서 막는 가드가 있는가? 타입이 그 상태를 애초에 배제하는가?
3. 가능하면 **실행해서 확인하라** — \`npx vitest run <파일>\`, \`npx tsc --noEmit\`, \`node -e\`, 필요하면 스크래치에 일회용 재현 스크립트. 실행한 명령과 출력을 evidence에 담아라.
4. 저장소의 기존 관례/의도된 트레이드오프(주석·CLAUDE.md·Architecture.md·계획서)가 이 동작을 이미 승인하고 있지는 않은가?

[판정 기준 — 중요]
- \`refuted: true\` 는 **당신이 그 실패가 일어날 수 없음을 코드로 확인했을 때만** 낸다.
- **재현 경로를 확인하지 못했다는 이유로 true를 내지 마라.** 확신이 없으면 \`refuted: false\`(지적 유지)다. 이 프로젝트에서는 오탐을 한 번 고치는 비용보다 진짜 결함을 놓치는 비용이 크다.
- 지적이 성립하되 심각도가 과장/과소면 refuted:false + severityAdjustment로 알려라.
- 지적이 "코드는 맞는데 문서/주석/followup 기록이 없다"는 종류라면 그건 성립하는 지적이다(refuted:false).
- reasoning에 **당신이 확인한 file:line**을 반드시 인용하라. 인용 없는 반증은 무효다.

아무것도 수정하지 마라. 읽고 판정만 하라.`
}

function fixPrompt(m, findings, budgetSecured) {
  const list = findings
    .map(
      (i, n) =>
        `${n + 1}. [${i.severity}] ${i.title}\n   ${i.description}\n   파일: ${(i.files || []).join(", ")}\n   실패 시나리오: ${i.failureScenario}${i.fixHint ? `\n   힌트: ${i.fixHint}` : ""}`,
    )
    .join("\n")
  return `당신은 ShaderPlayground **학습 가시성 개선 라운드**의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
마일스톤 ${m.id}(${m.tier})의 변경에 대해 다중 렌즈 검증 + 적대적 교차검증을 통과한(= 반증되지 않은) 지적들이다. **전부 수정하라.**

${list}

${refBlock(m, budgetSecured)}${specPolicyBlock(m)}

- 증상만 덮지 말고 **근본 원인**을 고쳐라.
- 수정이 다른 수용 기준을 깨지 않는지 확인하라.
- 수정 방법에 판단이 필요하면 status:'blocked' + questions로 반환하라 (fable 아키텍트가 답한다). 사용자를 기다리지 마라.
${DESIGN_POLICY}
${CONSTRAINTS}
${AUTONOMY}`
}

function gatePrompt(m) {
  const bundle = m.bundleGate
    ? `3) **번들 게이트** — \`npm run build\` (timeout 600000ms) 후 \`npm run size:check\`.
${NODE22}
   결과를 bundlePass / bundleReport 에 담아라. **Node 22가 아니면 measured 수치가 게이트의 수치가 아니다 — bundleReport에 반드시 사용한 Node 버전을 적어라.**
   ${m.id === "M0" ? "이 마일스톤은 게이트 스크립트 자체를 바꾼다 — entry/total **두 줄이 각각 보고되고 각각 검사되는지** 확인하라. 한 줄만 나오면 T0-1이 미완이다." : "**scripts/check-bundle-size.mjs 를 수정하지 마라.** 초과는 실패로 보고하라."}`
    : `3) 번들 게이트는 이 마일스톤 대상이 아니다 — bundlePass:true, bundleReport에 "미대상"으로 반환하라.`

  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 품질 게이트를 실행하고 **결과만** 보고하라. 아무것도 수정하지 마라.

1) \`npm run check\` — Bash timeout 600000ms. (내부: typecheck → lint → deadcode → circular → unit test(+커버리지 임계). 실패 시 즉시 중단)
2) 1)이 성공했을 때만: \`npm run test:e2e\` — timeout 600000ms. 전체 스펙(140건 이상, 6~12분). 시간 초과가 우려되면 \`npx playwright test tests/e2e/<파일>\` 로 나눠 돌리되 **임의 생략 금지**. dev 서버는 자동으로 뜬다.
${bundle}

⛔ 모든 명령을 **포그라운드로만** 실행하라(run_in_background 금지). 백그라운드로 띄우고 완료 알림을 기다리면 이 에이전트는 재호출되지 않고 그대로 죽는다 — 실제로 과거 워크플로우가 그렇게 두 번 죽었다.
⚠ 유닛 테스트는 jsdom stderr 노이즈(HTMLMediaElement not implemented 등)를 대량 출력한다 — 그건 실패가 아니다. **종료 코드와 요약 라인**으로 판정하라.
⚠ 커버리지 임계 미달도 \`unit\` 게이트 실패다 — 놓치지 말고 detail에 어느 지표가 몇 %인지 적어라.

각 실패를 gate(typecheck|lint|deadcode|circular|unit|e2e|bundle) 별로 분류하고, detail에 핵심 에러 메시지 / 실패 스펙명·라인을 담아라. 통과했으면 failures는 빈 배열.`
}

function triagePrompt(m, failures, budgetSecured) {
  const specNote =
    m.specPolicy === "forbid"
      ? `\n🔒 **이 마일스톤은 specPolicy:forbid다** — 기능 변경 0(순수 배관)이라 E2E 영향이 없어야 정상이다. E2E 실패는 전부 **회귀(fixes)**로 분류하라. specChanges는 **빈 배열**이어야 한다.`
      : `\n※ 이 마일스톤은 신규 기능을 추가한다. 기존 스펙이 "이전의 거짓 상태"를 단언하고 있었다면(예: vertex 탭이 항상 편집 가능하다는 전제) 그 갱신은 정당하다 — 단 **새 진실을 단언하는 방향**으로만. **expect 삭제·test.skip·test.fixme·단언 약화는 절대 금지.** 확신이 없으면 회귀(fixes) 쪽으로 분류하라.`

  return `당신은 ShaderPlayground **학습 가시성 개선 라운드**의 아키텍트다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
[마일스톤 ${m.id}(${m.tier})] 작업 후 품질 게이트가 실패했다. 실패 목록:

${JSON.stringify(failures, null, 2)}

저장소를 직접 조사해 각 실패의 근본 원인을 파악하고 분류하라. **당신이 결정권자다 — 사용자를 기다리지 말고 반드시 실행 가능한 지시를 내려라.**
- fixes: 코드 결함/회귀 — 하위 모델이 그대로 실행할 수 있는 구체적 수정 지시(근본 원인 포함, 증상 덮기 금지).
  - 흔한 원인: knip 고아 export(호출자 없는 새 헬퍼) · 새 스토어의 순환 import · noUncheckedIndexedAccess/exactOptionalPropertyTypes 위반 · 커버리지 임계 미달(신규 파일에 테스트 없음) · 기존 E2E가 가정한 DOM/testid 변경.
  - **번들 초과**: 코드를 줄이는 지시를 내려라(문자열 상수 통합·중복 컴포넌트 제거·지연 로드). **scripts/check-bundle-size.mjs 수정 지시는 금지**${m.id === "M0" ? "(단 M0의 T0-1 자체 결함은 예외 — 그건 스크립트를 고치는 게 작업 내용이다)" : ""}.
- specChanges: 이번 티어가 의도한 UI/동작 변화 때문에 기존 E2E expectation이 더 이상 유효하지 않은 경우만. proposedChange는 **새 값을 단언하는 강화 방향**이어야 한다. reason에 ${PLAN_DOC} 의 어느 항목 때문인지 명시하라.${specNote}
  ※ 적용된 스펙 변경은 전부 사용자에게 사후 보고되므로, 각 건을 followups(audience:'user')에도 남겨라.

${budgetBlock(budgetSecured)}
${AUTONOMY}`
}

function gateFixPrompt(m, triage, allowSpec) {
  const fixes = triage.fixes
    .map((f, n) => `${n + 1}. ${f.instruction}\n   파일: ${f.files.join(", ")}`)
    .join("\n")
  const specs =
    allowSpec && triage.specChanges.length
      ? `\n[승인된 E2E 스펙 갱신 — 새 값을 단언하는 강화 방향으로만]\n${triage.specChanges.map((s, n) => `${n + 1}. ${s.spec}: ${s.proposedChange}\n   근거: ${s.reason}`).join("\n")}`
      : ""
  return `당신은 ShaderPlayground **학습 가시성 개선 라운드**의 구현 담당이다. 저장소: ${ROOT} (브랜치 ${BRANCH}).
품질 게이트 실패에 대한 아키텍트의 수정 지시다. 전부 적용하라.

[수정 지시]
${fixes}${specs}

적용 후 관련 게이트만 표적 재실행해 확인하라 (예: \`npx tsc --noEmit\`, \`npx biome check\`, \`npx knip\`, \`npx vitest run <파일>\`, \`npx playwright test <스펙>\`). 전체 게이트는 별도 단계에서 재실행된다.
지시가 잘못됐다고 판단되면 임의 변경하지 말고 status:'blocked' + questions로 반환하라.
${DESIGN_POLICY}
${CONSTRAINTS}
${AUTONOMY}`
}

function commitPrompt(m, unitSummaries) {
  const title = m.phase.replace(/^M\d+ /, "")
  const specNote = m.specPhase
    ? `\n※ 이 커밋에는 SPEC.md의 "${m.specPhase}" 항목과 ${PLAN_DOC} §6 트래커 갱신(${m.items.join(", ")} → ✅ 완료, 브랜치 ${BRANCH})이 **반드시 포함**돼야 한다. 빠져 있으면 커밋 전에 직접 추가하라.`
    : `\n※ 이 커밋에는 ${PLAN_DOC} §6 트래커 갱신(${m.items.join(", ")} → ✅ 완료, 브랜치 ${BRANCH})이 **반드시 포함**돼야 한다. 빠져 있으면 커밋 전에 직접 추가하라. (${m.id}은 순수 배관이라 SPEC Phase는 추가하지 않는다.)`

  return `저장소 ${ROOT} (브랜치 ${BRANCH})에서 이번 마일스톤 변경을 커밋하라.
1) \`git add -A\`
2) \`git commit\` — 제목: "feat(learnability): ${m.id} ${title} — ${m.items.join(", ")}". (M0처럼 기능 변경이 없으면 \`build(learnability): …\` 또는 \`fix(learnability): …\` 로 적절히.)
   본문: 아래 변경 요약을 bullet 몇 개로 정리하고, 반영한 항목(${m.items.join(", ")})과 근거 문서(${PLAN_DOC} ${m.tier})를 명시한 뒤, 마지막 줄에 정확히 다음을 넣어라:
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>

[변경 요약]
${unitSummaries}
${specNote}

\`--no-verify\` 등 hook 우회 플래그 금지. 커밋 후 sha를 반환하라.
※ ${FOLLOWUP_DOC} 와 ${DESIGN_REQUEST_DOC} 는 워크플로우가 별도로 관리하니 이 커밋에 함께 들어가도 무방하다.
※ 코드 변경이 전혀 없으면 커밋하지 말고 committed:false로 반환하라.`
}

function quarantinePrompt(m, reason) {
  return `저장소 ${ROOT} (브랜치 ${BRANCH}). [마일스톤 ${m.id}]이 품질 게이트를 초록으로 만들지 못했다: ${reason}

워크플로우는 멈추지 않고 다음 마일스톤으로 진행한다. 이 마일스톤의 작업을 **버리지 말고 격리**해서 브랜치를 마지막 초록 커밋 상태로 되돌려라.

1) \`git stash push -u -m "wf-quarantine-${m.id}"\` — 추적/미추적 파일 모두 보존한다.
2) \`git status --porcelain\` 으로 작업 트리가 깨끗해졌는지 확인.
3) \`npx tsc --noEmit\` 로 HEAD 상태가 초록인지 빠르게 확인 (실패하면 note에 기록).
4) \`git stash list\` 로 보존된 stash 이름을 확인해 stashRef에 담아라.

아무것도 커밋하지 마라. \`reset --hard\` 금지 (작업이 사라진다).`
}

/**
 * 문서 에이전트에 넘길 마일스톤 상태의 축약 뷰.
 * 전체 report에는 plan.notes·검증 라운드 히스토리·유닛 목록이 들어 있는데 문서 작성에는
 * 쓰이지 않는다. 마일스톤이 쌓일수록 이 JSON이 프롬프트를 단조 증가시키므로(M4 시점 ~22k자)
 * 문서에 실제로 필요한 필드만 남긴다.
 */
function slimReport(milestoneStates) {
  return milestoneStates.map((r) => ({
    milestone: r.milestone,
    tier: r.tier,
    items: r.items,
    status: r.status || (r.gates && r.gates.green ? "green" : "quarantined"),
    attempts: r.attempts,
    gateNote: r.gates ? r.gates.note : undefined,
    gateFailures: r.gates ? r.gates.failures : undefined,
    bundleReport: r.gates ? r.gates.bundleReport : undefined,
    unresolvedFindings: r.adversarialVerify ? r.adversarialVerify.remaining : undefined,
    specChanges: (r.specChanges || []).map((s) => ({ spec: s.spec, reason: s.reason })),
    commitSha: r.commit ? r.commit.sha : null,
    stashRef: r.quarantine ? r.quarantine.stashRef : null,
  }))
}

function followupDocPrompt(followupList, milestoneStates) {
  return `저장소 ${ROOT}. 이 워크플로우가 자율 진행하면서 **사용자 판단이 필요하다고 판단한 항목**들을 모았다.
이것을 \`${FOLLOWUP_DOC}\` 파일로 정리해 써라 (있으면 통째로 덮어쓴다 — 매번 전체 재생성).

[수집된 보류 항목 (JSON)]
${JSON.stringify(followupList, null, 2)}

[마일스톤 실행 상태 (JSON — 문서 작성에 필요한 필드만 추린 축약 뷰)]
${JSON.stringify(slimReport(milestoneStates), null, 2)}

[문서 요구사항]
- 제목: "# 학습 가시성 라운드(2026-08) — 보류 항목 (자율 실행 산출물)".
- 첫 단락: "이 문서는 워크플로우가 작업을 멈추지 않기 위해 **잠정 결정**으로 진행한 항목들의 목록이다. 각 항목은 이미 코드에 반영돼 있으며, 정식 결정이 나오면 표시된 위치를 고치면 된다." + 근거 문서(\`${PLAN_DOC}\`)와 디자이너 요청서(\`${DESIGN_REQUEST_DOC}\`)를 링크로 안내.
- 섹션 구성:
  1. **사용자 판단 필요** — 스코프·정책·게이트. 각 항목: 무엇이 / 왜 / **잠정 처리** / 정식 결정 시 바꿀 위치(파일). 계획서 §5의 미결 결정(D-0a·D-0b·D-1·D-2·D-3·D-4·D-5)과 매핑되는 항목은 그 ID를 함께 표기하라.
  2. **적용된 E2E 스펙 변경** — 사후 검토용. 파일·테스트명·근거(계획서 어느 항목)·변경 방향(강화/추가 단언인지) 명시. 없으면 "없음".
  3. **격리된 마일스톤** — stash로 빠진 마일스톤 + stash 이름 + 복구 방법(\`git stash apply\`) + 실패 요약. 없으면 "없음".
  4. **번들 예산 현황** — 게이트 기준(entry/total)과 실측치, Node 22 여부. 초과했다면 "한도 상향은 사용자 승인 사항"임을 명시. 미측정이면 "미측정".
  5. **범위 밖으로 남긴 것** — **A-3(Shader 노드 vertex/fragment 분리)** 이 이 워크플로우의 명시적 범위 밖임을 기록하고, 계획서 §5 D-5(A-2 결과를 보고 판단)와 연결하라. A-2 구현 결과가 A-3 필요성에 대해 시사하는 바가 있으면 한 문단 적어라.
- 중복 항목은 병합하고 같은 주제는 묶어라. 항목이 없는 섹션은 "없음"으로 남겨라(섹션 자체는 유지).
- 한국어로, 저장소의 다른 temp/*.md 문서와 같은 톤(간결한 체크리스트 + 근거)으로 작성하라.
- 파일을 실제로 쓰고, itemCount에 총 항목 수를 반환하라. **코드는 건드리지 마라.**`
}

function designRequestDocPrompt(designList, milestoneStates) {
  return `저장소 ${ROOT}. 이 워크플로우가 학습 가시성 라운드를 구현하면서 **디자이너 결정이 필요하다고 판단한 지점**들을 모았다.
이것을 **디자이너에게 그대로 보낼 수 있는 요청서** \`${DESIGN_REQUEST_DOC}\` 로 작성하라 (있으면 통째로 덮어쓴다).

[수집된 디자인 요청 항목 (JSON)]
${JSON.stringify(designList, null, 2)}

[마일스톤 실행 상태 (JSON — 문서 작성에 필요한 필드만 추린 축약 뷰)]
${JSON.stringify(slimReport(milestoneStates), null, 2)}

[형식 — \`temp/design-request-v2.2.md\` 를 먼저 읽고 그 형식·톤을 그대로 따를 것]
- 제목: "# 디자인 ${DESIGN_REQUEST_VERSION} 요청서 — 학습 가시성 라운드에서 구현이 내린 잠정 결정 확정"
- 머리말 인용 블록:
  - **성격**: 이번 라운드는 **디자인 핸드오프의 역방향**이다 — 디자이너의 정본을 코드에 반영한 게 아니라, **기능 개선(학습 가시성)을 구현하면서 design/ 정본(v2.2)이 정의하지 않은 UI 지점을 만나 구현이 잠정 결정을 내린** 경우다. 그 확정을 요청한다.
  - **보내는 쪽**: ShaderPlayground 구현 팀 · **작성일**: \`date +%Y-%m-%d\` 로 실제 날짜를 확인해 적어라 (지어내지 마라).
  - **근거**: \`${PLAN_DOC}\` · 브랜치 \`${BRANCH}\` 의 커밋들 · \`${FOLLOWUP_DOC}\`
  - **항목 ID**: **${DESIGN_ITEM_PREFIX}1~${DESIGN_ITEM_PREFIX}n** — 기존 시리즈(D/Q/R/S/T/U/V/W/X/Y/Z)와 구분됨을 명시.
- **§0. 배경 — 이번 라운드가 무엇을 했는지**: 학습 가시성 개선의 목표("학습자가 파이프라인에서 무엇이 일어나는지 해부할 수 있어야 한다")와 실제로 들어간 UI 변경을 티어별로 3~6줄 요약. 마일스톤 실행 상태 JSON을 근거로 쓰되, **격리/미완 마일스톤은 정직하게 그렇게 적어라.**
- **답변 형식 안내**: "CHANGELOG에 ${DESIGN_ITEM_PREFIX}1~${DESIGN_ITEM_PREFIX}n을 전부 인용해 주세요. '현행 승인' / '정정함' 한 줄이면 충분합니다." (v1.3~v2.2와 동일한 방식임을 밝힐 것)
- **⚠️ 제약 / 영향 (확정 전 공유)**: 번들 예산 현황(entry/total 게이트와 여유) · **이번 라운드는 신규 토큰 0으로 구현했다**는 사실 · 신규 토큰이 필요한 요청 항목(newTokenNeeded:true)이 있으면 "예산·토큰 검토가 선행됩니다"로 따로 묶어 명시 · E2E/직렬화 영향.
- **본문**: 항목을 \`area\` 기준으로 그룹핑해 \`## A. …\` / \`## B. …\` 섹션으로 묶고, 각 항목을 \`### ${DESIGN_ITEM_PREFIX}n. 제목\` 으로 번호를 부여하라. 각 항목 구성:
  1. **배경** — design/ 정본(CHANGELOG·README·해당 .dc.html)이 무엇을 정의하지 않았는지. 참조 dc 파일/섹션 명시.
  2. **구현 채택안(잠정)** — 지금 코드에 들어간 것. 관련 파일:심볼 인용.
  3. **요청** — (a)/(b)/… 선택지 + **권장** 표시 + 권장 이유.
  4. **다르게 확정 시** — 바꿔야 할 파일·심볼·CSS 클래스.
  5. 영향이 큰 항목(직렬화·번들·E2E)은 **영향** 한 줄 추가.
  - 중요도가 높은 항목 제목에는 \`★\` 를 붙여라(v2.2 관례).
- 중복/유사 항목은 병합하라. 같은 area 안에서 서로 종속인 항목은 그 종속을 명시하라("Zn 확답과 함께 처리" 식).
- 항목이 하나도 없으면 그 사실을 적은 짧은 문서를 써라(섹션 구조는 유지, "이번 라운드는 디자인 결정이 필요한 지점이 없었습니다").
- 한국어로, 존댓말(디자이너에게 보내는 문서다)로 작성하라. **코드는 건드리지 마라.**
- 파일을 실제로 쓰고 itemCount에 총 ${DESIGN_ITEM_PREFIX} 항목 수를 반환하라.`
}

// ─────────────────────────────────────────────────────────────────────────────
// 수집기
// ─────────────────────────────────────────────────────────────────────────────
const followups = []
const designRequests = []
function collect(res, source) {
  if (!res) return
  if (Array.isArray(res.followups)) {
    for (const f of res.followups) followups.push({ ...f, source })
  }
  if (Array.isArray(res.designRequests)) {
    for (const d of res.designRequests) designRequests.push({ ...d, source })
  }
}

function findingKey(f) {
  const file = Array.isArray(f.files) && f.files.length ? f.files[0] : "?"
  return `${file}::${String(f.title || "").toLowerCase().slice(0, 60)}`
}

// ─────────────────────────────────────────────────────────────────────────────
// 실행 루틴
// ─────────────────────────────────────────────────────────────────────────────

// 구현 유닛 1개: 하위 모델 시도 → blocked면 fable 오라클 Q&A → 재시도 → 최종 fable 직접 구현
async function runUnit(m, unit, budgetSecured) {
  let answersBlock = ""
  let priorSummary = ""
  for (let round = 0; round <= MAX_QA_ROUNDS; round++) {
    const escalated = round === MAX_QA_ROUNDS
    const res = await agent(implPrompt(m, unit, answersBlock, priorSummary, budgetSecured), {
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
    const ans = await agent(oraclePrompt(m, unit, qs, priorSummary, budgetSecured), {
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

// 다중 렌즈 검증 → 적대적 교차검증(반증 시도) → 살아남은 지적만 수정 → 반복
async function adversarialVerify(m, plan, budgetSecured) {
  const lensKeys = (m.lenses || ["regression", "gate-risk"]).filter((k) => LENS_SPECS[k])
  const limitedLenses = Number(A.lenses) > 0 ? lensKeys.slice(0, Number(A.lenses)) : lensKeys
  const history = []
  const seen = new Set()

  for (let round = 1; round <= MAX_VERIFY_ROUNDS; round++) {
    // 1) 렌즈별 병렬 검증 (서로를 모른 채 독립적으로 본다)
    const lensResults = await parallel(
      limitedLenses.map((k) => () =>
        agent(lensPrompt(m, plan, k, round, budgetSecured), {
          label: `verify:${m.id}:${k}:r${round}`,
          phase: m.phase,
          model: ORACLE_MODEL,
          effort: "high",
          schema: FINDINGS_SCHEMA,
        }),
      ),
    )
    const alive = lensResults.filter(Boolean)
    for (let i = 0; i < alive.length; i++) collect(alive[i], `verify:${m.id}`)
    if (alive.length === 0) {
      log(`  ⚠ ${m.id} 검증 r${round}: 렌즈 에이전트가 전부 유실됨 — 검증 없이 게이트로 넘어간다`)
      return { pass: false, note: "all lens agents lost", history }
    }

    const raw = alive.flatMap((r) => r.findings || [])
    // 라운드 간 중복(이미 다뤄진 지적) 제거 — 같은 지적으로 무한 루프 도는 것 방지
    const fresh = []
    for (const f of raw) {
      const k = findingKey(f)
      if (seen.has(k)) continue
      seen.add(k)
      fresh.push(f)
    }
    const blocking = fresh.filter((f) => f.severity !== "minor")
    const minors = fresh.filter((f) => f.severity === "minor").map((f) => f.title)
    log(
      `  ${m.id} 검증 r${round}: 렌즈 ${alive.length}개 → 신규 지적 ${fresh.length}건 (blocking ${blocking.length} / minor ${minors.length})`,
    )
    if (blocking.length === 0) {
      history.push({ round, lenses: limitedLenses.length, blocking: 0, minors })
      return { pass: true, round, minors, history }
    }

    // 2) 적대적 교차검증 — 각 blocking 지적을 반증 전담 에이전트들에게 부친다
    const targets = blocking.slice(0, MAX_REFUTE_TARGETS)
    const overflow = blocking.slice(MAX_REFUTE_TARGETS)
    if (overflow.length > 0) {
      // 침묵 절단 금지: 반증에 태우지 못한 지적은 버리지 않고 보수적으로 '확정' 처리한다.
      log(
        `  ⚠ ${m.id} r${round}: blocking ${blocking.length}건 중 ${MAX_REFUTE_TARGETS}건만 적대적 교차검증에 태운다 — 나머지 ${overflow.length}건은 반증 없이 확정 처리(보수적): ${overflow.map((f) => f.title).join(" | ")}`,
      )
    }
    const judged = await parallel(
      targets.map((f) => () =>
        parallel(
          Array.from({ length: REFUTERS_PER_FINDING }, (_unused, i) => () =>
            agent(refutePrompt(m, f, i), {
              label: `refute:${m.id}:r${round}:${(f.title || "finding").slice(0, 24)}#${i + 1}`,
              phase: m.phase,
              model: IMPL_MODEL,
              effort: "high",
              schema: REFUTE_SCHEMA,
            }),
          ),
        ).then((votes) => {
          const live = votes.filter(Boolean)
          // 반증자 전원이 반증해야 기각한다 (에이전트 유실은 반증으로 치지 않는다 = 보수적).
          const refutedAll = live.length === REFUTERS_PER_FINDING && live.every((v) => v.refuted)
          const raised = live.some((v) => v.severityAdjustment === "raise")
          return {
            finding: raised ? { ...f, severity: "blocker" } : f,
            refuted: refutedAll,
            votes: live.map((v) => ({ refuted: v.refuted, reasoning: v.reasoning })),
          }
        }),
      ),
    )
    const survivors = judged
      .filter(Boolean)
      .filter((j) => !j.refuted)
      .map((j) => j.finding)
    const dismissed = judged.filter(Boolean).filter((j) => j.refuted)
    const confirmed = survivors.concat(overflow)
    log(
      `  ${m.id} r${round} 적대적 교차검증: 기각 ${dismissed.length}건 / 확정 ${confirmed.length}건`,
    )
    history.push({
      round,
      lenses: limitedLenses.length,
      raised: blocking.length,
      dismissed: dismissed.map((j) => j.finding.title),
      confirmed: confirmed.map((f) => f.title),
      minors,
    })

    if (confirmed.length === 0) return { pass: true, round, minors, history }

    if (round === MAX_VERIFY_ROUNDS) {
      for (const i of confirmed) {
        followups.push({
          audience: "user",
          title: `${m.id} 미해소 지적: ${String(i.title).slice(0, 80)}`,
          context: `적대적 검증 ${MAX_VERIFY_ROUNDS}라운드 후에도 남음. 시나리오: ${i.failureScenario}. 파일: ${(i.files || []).join(", ")}`,
          interimDecision:
            "현재 구현 상태로 진행했다 (게이트 통과 여부는 별도 판정). 사람이 확인해야 한다.",
          source: `verify:${m.id}`,
        })
      }
      return { pass: false, remaining: confirmed.map((f) => f.title), history }
    }

    // 3) 확정된 지적 수정
    const fixRes = await agent(fixPrompt(m, confirmed, budgetSecured), {
      label: `verify-fix:${m.id}:r${round}`,
      phase: m.phase,
      model: round >= MAX_VERIFY_ROUNDS - 1 ? ORACLE_MODEL : IMPL_MODEL,
      schema: IMPL_SCHEMA,
    })
    collect(fixRes, `verify-fix:${m.id}`)
    if (fixRes && fixRes.status === "blocked" && (fixRes.questions || []).length) {
      const ans = await agent(
        oraclePrompt(
          m,
          { id: "verify-fix", title: "검증 지적 수정", instructions: fixPrompt(m, confirmed, budgetSecured) },
          fixRes.questions,
          fixRes.summary,
          budgetSecured,
        ),
        {
          label: `oracle:${m.id}/verify-fix:r${round}`,
          phase: m.phase,
          model: ORACLE_MODEL,
          effort: "high",
          schema: ANSWER_SCHEMA,
        },
      )
      if (ans) {
        collect(ans, `oracle:${m.id}/verify-fix`)
        const ab = ans.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join("\n\n")
        const second = await agent(
          fixPrompt(m, confirmed, budgetSecured) + `\n\n[아키텍트 답변 — 이 결정을 따르라]\n${ab}`,
          {
            label: `verify-fix:${m.id}:r${round}b`,
            phase: m.phase,
            model: IMPL_MODEL,
            schema: IMPL_SCHEMA,
          },
        )
        collect(second, `verify-fix:${m.id}`)
      }
    }
  }
  return { pass: false, note: "max verify rounds", history }
}

// 게이트 루프: 실행 → fable 트리아지 → 수정 → 재실행. 멈추지 않는다.
async function gateLoop(m, budgetSecured) {
  const allowSpec = ALLOW_SPEC_UPDATES && m.specPolicy !== "forbid"
  const appliedSpecChanges = []
  let lastBundleReport = ""
  for (let attempt = 1; attempt <= MAX_GATE_ROUNDS; attempt++) {
    const g = await agent(gatePrompt(m), {
      label: `gate:${m.id}:r${attempt}`,
      phase: m.phase,
      model: IMPL_MODEL,
      effort: "low",
      schema: GATE_SCHEMA,
    })
    if (!g) return { green: false, appliedSpecChanges, note: "gate agent lost" }
    if (g.bundleReport) lastBundleReport = g.bundleReport
    const bundleOk = m.bundleGate ? g.bundlePass !== false : true
    if (g.checkPass && g.e2ePass && bundleOk)
      return {
        green: true,
        appliedSpecChanges,
        attempts: attempt,
        bundleReport: lastBundleReport,
      }
    if (attempt === MAX_GATE_ROUNDS)
      return {
        green: false,
        appliedSpecChanges,
        failures: (g.failures || []).map((f) => `${f.gate}: ${f.summary}`),
        bundleReport: lastBundleReport,
        note: "max gate rounds",
      }

    const failures = (g.failures || []).slice()
    if (m.bundleGate && g.bundlePass === false && !failures.some((f) => f.gate === "bundle")) {
      failures.push({ gate: "bundle", summary: "번들 한도 초과", detail: g.bundleReport || "" })
    }
    const triage = await agent(triagePrompt(m, failures, budgetSecured), {
      label: `triage:${m.id}:r${attempt}`,
      phase: m.phase,
      model: ORACLE_MODEL,
      effort: "high",
      schema: TRIAGE_SCHEMA,
    })
    if (!triage)
      return { green: false, appliedSpecChanges, bundleReport: lastBundleReport, note: "triage lost" }
    collect(triage, `triage:${m.id}`)

    const specs = allowSpec ? triage.specChanges || [] : []
    if (specs.length > 0) {
      appliedSpecChanges.push(...specs)
      for (const s of specs) {
        followups.push({
          audience: "user",
          title: `E2E 스펙 갱신 적용: ${s.spec}`,
          context: `근거: ${s.reason}`,
          interimDecision: `강화(새 진실 단언) 방향으로 갱신함 — ${s.proposedChange}. (사전 승인된 정책이나 사후 검토 필요)`,
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
              ? `${m.id}은 specPolicy:forbid(기능 변경 0이라 E2E 무영향이 정상)라 적용하지 않았다. 코드 쪽 해결을 시도했다. **스펙 갱신이 정말 필요하다면 그건 이 변경이 순수 배관이 아니라는 신호다.**`
              : "allowSpecUpdates:false라 적용하지 않았다.",
          source: `triage:${m.id}`,
        })
      }
    }
    if ((triage.fixes || []).length === 0 && specs.length === 0)
      return {
        green: false,
        appliedSpecChanges,
        bundleReport: lastBundleReport,
        note: "트리아지가 적용 가능한 수정 항목을 내지 못함",
        failures: failures.map((f) => `${f.gate}: ${f.summary}`),
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
  return { green: false, appliedSpecChanges, bundleReport: lastBundleReport, note: "max gate rounds" }
}

// ─────────────────────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────────────────────
phase("Setup")
log(`브랜치 ${BRANCH} 준비 + 계획 문서 확인 + 베이스라인 게이트 + Node 22 번들 실측`)
const setup = await agent(
  `저장소 ${ROOT} 준비 단계. 순서대로 수행하라.

1) \`git status --porcelain\` 확인.
   - **예외 처리**: \`${PLAN_DOC}\` 와 \`.claude/workflows/learnability-2026-08.js\` 가 **미추적(??)** 상태일 수 있다(각각 이 워크플로우의 근거 문서와 워크플로우 스크립트 본체이며 아직 커밋되지 않았다). 이 **둘(또는 둘 중 하나)만** 더러운 상태라면 정상이다 — 3)에서 브랜치를 만든 뒤 \`git add ${PLAN_DOC} .claude/workflows/learnability-2026-08.js && git commit -m "docs: 학습 가시성 개선 계획(2026-08) + 적용 워크플로우 추가"\` 로 먼저 커밋하라(존재하는 것만 add).
   - 그 외의 수정/미추적 파일이 있으면 ok:false, reason에 상태 요약을 담아 반환하고 종료. **아무것도 수정/스태시하지 마라.**
2) **필수 전제 확인** — 아래가 모두 참이어야 한다. 하나라도 아니면 ok:false + reason:
   - \`${PLAN_DOC}\` 가 존재하고 "## 4. 티어별 작업 패키지" 와 "### ⚪ T0" 섹션을 포함한다.
   - \`scripts/check-bundle-size.mjs\` 가 \`const LIMITS_KIB = {\` 를 포함한다(T0-1의 대상).
   - \`src/core/graph/compile.ts\` 가 \`meshIsFullscreen\` 을 포함한다(T1의 데이터 원천).

2-b) **T0 반영 여부 판별 (실패 조건이 아니다 — 재개 실행 판별용)** → t0Applied 로 반환:
   - \`scripts/check-bundle-size.mjs\` 의 \`LIMITS_KIB\` 가 \`entry\` 키를 갖는가?
   - \`src/state/assetActions.ts\` 가 objLoader/gltfLoader 를 **동적** \`await import(...)\` 로 부르는가?
   둘 다 참이면 t0Applied:true (= 이전 실행에서 M0가 이미 랜딩됨 → 예산 확보 상태로 이어서 진행한다).
   둘 다 거짓이면 t0Applied:false (= 신규 실행, M0부터 정상).
   **한쪽만 참이면 T0가 반쯤 반영된 것이다** — t0Applied:false로 반환하고 reason에 그 사실을 분명히 적어라(M0가 그 상태를 정리하게 된다).

2-c) \`SPEC.md\` 의 최신 Phase 번호를 확인해 reason에 적어라. 신규 실행이면 35가 정상이고, 재개 실행이면 36 이상일 수 있다 — **어느 쪽도 실패 조건이 아니다.**
3) 브랜치 \`${BRANCH}\` 로 전환 (없으면 현재 HEAD에서 생성: \`git switch -c ${BRANCH}\`, 있으면 \`git switch ${BRANCH}\`). 1)의 계획 문서 커밋은 이 브랜치 위에서 한다.
4) \`node_modules\` 가 없으면 \`npm ci\`.
5) **베이스라인 게이트**: \`npm run check\` 를 timeout 600000ms로 포그라운드 실행. **완전히 초록이어야 한다.** 실패하면 ok:false + reason에 실패 게이트 요약 — 수정하지 마라. 빨간 베이스라인에선 시작하지 않는다.
   ※ 유닛 테스트의 jsdom stderr 노이즈는 실패가 아니다. 종료 코드로 판정하라.
6) **베이스라인 번들 실측**: \`npm run build\` (timeout 600000ms) 후 \`npm run size:check\`.
${NODE22}
   baselineBundle에 { nodeMajor, totalKiB, measuredOnNode22 } 를 담아라. Node 22 확보에 실패했다면 measuredOnNode22:false로 정직하게 반환하고(그래도 진행 가능) reason에 그 사실을 적어라.
   ⚠ 계획서 §3-1의 실측 기준값은 **395.12 KiB / 396 한도 (여유 0.88)** 다. 실측이 이와 크게 다르면 reason에 명시하라 — 이후 마일스톤의 예산 판단이 달라진다.

모두 통과하면 ok:true, branch, reason에 베이스라인 상태 한 줄.

⛔ 모든 장시간 명령은 **포그라운드로만** 실행하라. 백그라운드 완료 알림을 기다리면 이 에이전트는 재호출되지 않고 죽는다.
이 단계는 워크플로우가 유일하게 중단될 수 있는 지점이다 (더러운 트리 / 빨간 베이스라인 / 계획 문서 부재 — 어느 것도 자동으로 고칠 수 없다). 이후 단계는 무슨 일이 있어도 끝까지 진행된다.`,
  { label: "setup", model: IMPL_MODEL, effort: "low", schema: SETUP_SCHEMA },
)
if (!setup || !setup.ok)
  return { status: "aborted", reason: setup ? setup.reason : "setup agent lost" }
log(`베이스라인: ${setup.reason}`)

const report = []
const quarantined = []
// 재개 실행(startFrom으로 M0를 건너뛰는 경우)에서는 setup이 실측한 T0 반영 여부를 신뢰한다.
// 신규 실행에서는 false로 시작해 M0가 초록일 때 켜진다.
let budgetSecured = setup.t0Applied === true
if (budgetSecured) log("Setup 판정: T0가 이미 반영돼 있다 — 예산 확보 상태로 이어서 진행한다.")

// 마일스톤 1회 시도: 계획 → 유닛 구현 → 적대적 검증 → 게이트 루프
async function runMilestoneOnce(m, quarantinedIds, secured, attempt, recovery) {
  const plan = await agent(plannerPrompt(m, quarantinedIds, secured, recovery), {
    label: `plan:${m.id}${attempt > 1 ? `:retry${attempt - 1}` : ""}`,
    phase: m.phase,
    model: ORACLE_MODEL,
    effort: "high",
    schema: PLAN_SCHEMA,
  })
  if (!plan || !plan.units || plan.units.length === 0) return { plannerFailed: true }
  collect(plan, `plan:${m.id}`)
  log(`  ${m.id} 계획: ${plan.units.length}개 유닛 — ${plan.units.map((u) => u.title).join(" / ")}`)

  // 유닛 실행 — parallelUnits면 동시 실행(파일 disjoint 전제), 아니면 순차
  let unitResults
  if (m.parallelUnits) {
    const settled = await parallel(plan.units.map((u) => () => runUnit(m, u, secured)))
    unitResults = settled.map((r, i) =>
      r ? r : { unit: plan.units[i] ? plan.units[i].id : `u${i}`, status: "agent-lost" },
    )
  } else {
    unitResults = []
    for (const unit of plan.units) {
      unitResults.push(await runUnit(m, unit, secured))
    }
  }
  for (const r of unitResults)
    log(`  ${m.id}/${r.unit}: ${r.status}${r.escalated ? " (fable 인계)" : ""}`)

  const verify = await adversarialVerify(m, plan, secured)
  const gate = await gateLoop(m, secured)
  return { plan, unitResults, verify, gate }
}

for (const m of MILESTONES) {
  if (ONLY && !ONLY.includes(m.id)) continue
  if (START_FROM && MILESTONES.findIndex((x) => x.id === m.id) < MILESTONES.findIndex((x) => x.id === START_FROM))
    continue
  // 재개 실행: T0가 이미 랜딩됐으면 M0를 다시 돌리지 않는다 (only로 명시 요청한 경우는 예외).
  if (m.id === "M0" && budgetSecured && !(ONLY && ONLY.includes("M0"))) {
    log("── M0 건너뜀 — T0가 이미 반영돼 있다 (only:['M0']로 강제 재실행 가능)")
    report.push({ milestone: "M0", tier: "T0", status: "skipped-already-applied", items: m.items })
    continue
  }
  phase(m.phase)
  const retries = m.criticalRetries || 0
  log(
    `── ${m.id} (${m.tier}) 시작 — 항목: ${m.items.join(", ")}${m.parallelUnits ? " / 유닛 병렬" : ""}${m.specPolicy === "forbid" ? " / 스펙 수정 금지" : ""}${m.bundleGate ? " / 번들 게이트 포함" : ""}${retries ? ` / 게이트 실패 시 재시도 ${retries}회` : ""}`,
  )

  // 게이트가 빨가면 재시도(criticalRetries) — 격리는 마지막 수단이다.
  let attempt = 1
  let run = await runMilestoneOnce(m, quarantined, budgetSecured, attempt, null)
  while (
    attempt <= retries &&
    (run.plannerFailed || !run.gate || !run.gate.green)
  ) {
    const prevFailures = run.gate
      ? (run.gate.failures || [run.gate.note || "unknown"]).join(" | ")
      : "플래너가 유닛을 내지 못함"
    const prevSummary = run.unitResults
      ? run.unitResults.map((r) => `- [${r.unit}] ${r.status}: ${(r.summary || "").slice(0, 200)}`).join("\n")
      : "(이전 시도가 계획 단계에서 실패해 코드 변경 없음)"
    log(`  🔁 ${m.id} 게이트 미달 — 재시도 ${attempt}/${retries} (직전 작업은 트리에 보존)`)
    attempt++
    run = await runMilestoneOnce(m, quarantined, budgetSecured, attempt, {
      summary: prevSummary,
      failures: prevFailures,
      remainingFindings:
        run.verify && run.verify.remaining ? run.verify.remaining.join(" | ") : "",
    })
  }

  if (run.plannerFailed) {
    followups.push({
      audience: "user",
      title: `${m.id} 플래너 실패 — 마일스톤 건너뜀`,
      context: `fable 플래너가 유닛을 내지 못했다 (시도 ${attempt}회).`,
      interimDecision: `이 마일스톤은 손대지 않고 다음으로 넘어갔다. 항목 ${m.items.join(", ")} 은 미처리로 남는다.`,
      source: `plan:${m.id}`,
    })
    report.push({
      milestone: m.id,
      tier: m.tier,
      status: "planner-failed",
      attempts: attempt,
      items: m.items,
    })
    quarantined.push(m.id)
    continue
  }

  const plan = run.plan
  const unitResults = run.unitResults
  const verify = run.verify
  const gate = run.gate

  let commit = null
  let quarantine = null

  if (gate.green) {
    if (m.id === "M0") {
      budgetSecured = true
      log("  ✅ M0 초록 — 엔트리 기준 번들 예산 확보. 이후 마일스톤은 ~26 KiB 여유에서 작업한다.")
    }
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
    // 이 마일스톤에 의존하는 후속 티어가 함께 무너진다 — 무인 실행에서 조용히 넘어가면 안 된다.
    const dependents = MILESTONES.filter((x) => (x.dependsOn || []).includes(m.id))
    if (dependents.length > 0) {
      log(
        `  ⛔ ${m.id} 격리 — 의존 마일스톤 ${dependents.map((d) => `${d.id}(${d.items.join("/")})`).join(", ")} 이 축소되거나 진행 불가해진다`,
      )
    }
    followups.push({
      audience: "user",
      title: `${m.id}(${m.tier}) 게이트 실패 — 격리됨 (${m.items.join(", ")} 미해소)${dependents.length ? ` · 후속 ${dependents.map((d) => d.id).join(",")} 영향` : ""}`,
      context: `실패: ${reason}${gate.bundleReport ? ` / 번들: ${gate.bundleReport}` : ""}${attempt > 1 ? ` (재시도 ${attempt - 1}회 후에도 미달)` : ""}${dependents.length ? `\n의존 마일스톤: ${dependents.map((d) => `${d.id}(${d.items.join(", ")})`).join(" · ")} — 이들은 이 배관 없이 축소 진행됐다. 복구 후 재실행이 필요하다.` : ""}`,
      interimDecision: DO_COMMIT
        ? `작업을 \`git stash("wf-quarantine-${m.id}")\` 로 보존하고 브랜치를 마지막 초록 커밋으로 되돌린 뒤 계속 진행했다. 복구: \`git stash apply <ref>\` 후 \`{ startFrom: "${m.id}" }\` 로 재실행.`
        : "commit:false 모드라 격리하지 않았다 — 작업 트리에 빨간 변경이 남아 있을 수 있다.",
      source: `gate:${m.id}`,
    })
  }

  report.push({
    milestone: m.id,
    tier: m.tier,
    attempts: attempt,
    items: m.items,
    plan: { units: plan.units.map((u) => u.title), notes: plan.notes },
    units: unitResults.map((r) => ({ unit: r.unit, status: r.status })),
    adversarialVerify: verify,
    gates: {
      green: gate.green,
      attempts: gate.attempts,
      note: gate.note,
      failures: gate.failures,
      bundleReport: gate.bundleReport,
    },
    specChanges: gate.appliedSpecChanges,
    commit: commit ? { sha: commit.sha, committed: commit.committed } : null,
    quarantine: quarantine ? { clean: quarantine.clean, stashRef: quarantine.stashRef } : null,
  })

  // 마일스톤마다 두 문서를 갱신 (중간에 죽어도 기록이 남도록)
  await parallel([
    () =>
      agent(followupDocPrompt(followups, report), {
        label: `followup-doc:${m.id}`,
        phase: m.phase,
        model: IMPL_MODEL,
        effort: "low",
        schema: DOC_SCHEMA,
      }),
    () =>
      agent(designRequestDocPrompt(designRequests, report), {
        label: `design-request-doc:${m.id}`,
        phase: m.phase,
        model: IMPL_MODEL,
        effort: "low",
        schema: DOC_SCHEMA,
      }),
  ])
}

// ─────────────────────────────────────────────────────────────────────────────
// 최종 보고
// ─────────────────────────────────────────────────────────────────────────────
phase("Report")
log(
  `문서 발행 + 커버리지 대조 — followups ${followups.length}건 / 디자인 요청 ${designRequests.length}건`,
)

const [doc, designDoc] = await parallel([
  () =>
    agent(followupDocPrompt(followups, report), {
      label: "followup-doc:final",
      model: IMPL_MODEL,
      effort: "medium",
      schema: DOC_SCHEMA,
    }),
  () =>
    agent(designRequestDocPrompt(designRequests, report), {
      label: "design-request-doc:final",
      model: ORACLE_MODEL,
      effort: "medium",
      schema: DOC_SCHEMA,
    }),
])

const ranIds = report.map((r) => r.milestone).join(", ")
const coverage = await agent(
  `저장소 ${ROOT} (브랜치 ${BRANCH})에서 학습 가시성 라운드의 마무리 점검을 하라. **읽기 전용 — 코드를 수정하지 마라.**

[실행된 마일스톤] ${ranIds || "(없음)"}
[격리된 마일스톤] ${quarantined.length ? quarantined.join(", ") : "(없음)"}

1) **항목 커버리지 대조** — \`${PLAN_DOC}\` §6 트래커의 항목을 현재 코드/커밋 기준으로 판정하라. 대상은 **A-3을 제외한 전부**:
   T0-1 · T0-2 · T0-3 · A-1 · D-1 · C-1 · B-1 · E-1 · E-4 · B-2 · C-2 · E-2 · E-3 · F-1 · F-2 · A-2
   판정: done(반영·커밋됨) / partial(일부만) / deferred(격리된 마일스톤에 속함) / not-covered(다뤄졌어야 하는데 누락 ← note에 분명히).
   \`git log --oneline\` 으로 브랜치 커밋을 확인하고 **필요하면 파일을 직접 읽어 판정하라. 추측 금지.**
   ⚠ **A-3은 이 워크플로우의 명시적 범위 밖이다** — items에 넣지 마라.

2) **트래커/SPEC 갱신 확인**:
   - \`${PLAN_DOC}\` §6 트래커가 실제로 갱신됐는지(⬜ → ✅/⏸ + 브랜치 기재) → trackerUpdated
   - \`SPEC.md\` 에 실제로 추가된 Phase 제목들을 나열 → specPhasesAdded (Phase 36~39 기대. 격리된 티어는 없는 게 정상)

3) **핵심 불변식 확인**:
   - \`git diff --stat main...HEAD -- design/\` — **design/ 아래 파일이 하나도 수정되지 않았어야 한다** → designUntouched
   - \`src/theme.ts\` 에 신규 토큰이 추가됐는지(\`git diff main...HEAD -- src/theme.ts\`) → newTokenCount (**0이어야 한다**)
   - \`src/state/dockTree.ts\` 의 \`DockPanelId\` 가 5종 그대로인지 (확장됐으면 note에 blocker로 기록)
   - \`tests/e2e\` 변경이 있다면 강화(추가 단언) 방향인지 · \`test.skip\`/\`test.fixme\`/expect 삭제가 0인지 (\`git diff main...HEAD -- tests/e2e\`)
   - \`npm run circular\` 이 0건인지 (빠르다 — 실행해서 확인하라)

4) **잔여 raw hex 스캔**:
   \`grep -rnE '#[0-9a-fA-F]{3,8}\\b' src --include='*.ts' --include='*.tsx' --include='*.css'\`
   실행 후 \`src/theme.ts\` 와 \`*.test.*\` 는 제외하고 집계. "정당한 잔여물"(주석 속 참조값, ErrorBoundary 폴백, standalonePlayer.js 폴백)과 "이번 라운드가 새로 넣은 잔여물"을 구분해 요약하라 — 후자가 있으면 그것만 세어 residualHexCount에 담아라.

5) **최종 번들 실측** (게이트 기준):
   \`npm run build\` (timeout 600000ms) 후 \`npm run size:check\`.
${NODE22}
   bundle 객체에 { measuredOnNode22, nodeVersion, entryKiB, totalKiB, entryLimit, totalLimit, pass } 를 담아라.
   - T0-1이 반영됐다면 entry/total 두 그룹이 각각 보고된다. 미반영(M0 격리)이면 total 한 줄만 나온다 — 그 경우 entryKiB:-1, entryLimit:-1 로 두고 note 성격의 정보를 residualHexSummary가 아니라 bundle.nodeVersion 옆에 적지 말고, items의 T0-1 note에 사유를 적어라.
   - **초과해도 \`scripts/check-bundle-size.mjs\` 를 수정하지 마라.**`,
  { label: "coverage-scan", model: IMPL_MODEL, effort: "medium", schema: COVERAGE_SCHEMA },
)

return {
  branch: BRANCH,
  round: "학습 가시성 개선 (Learnability) 2026-08 — T0~T4, A-3 제외",
  planDoc: PLAN_DOC,
  budgetSecured,
  allowSpecUpdates: ALLOW_SPEC_UPDATES,
  milestones: report,
  quarantined,
  followupDoc: {
    path: FOLLOWUP_DOC,
    written: doc ? doc.written : false,
    itemCount: doc ? doc.itemCount : followups.length,
  },
  designRequestDoc: {
    path: DESIGN_REQUEST_DOC,
    version: DESIGN_REQUEST_VERSION,
    itemPrefix: DESIGN_ITEM_PREFIX,
    written: designDoc ? designDoc.written : false,
    itemCount: designDoc ? designDoc.itemCount : designRequests.length,
    rawCollected: designRequests.length,
  },
  coverage: coverage ? coverage.items : "coverage scan failed",
  trackerUpdated: coverage ? coverage.trackerUpdated : null,
  specPhasesAdded: coverage ? coverage.specPhasesAdded : null,
  invariants: coverage
    ? {
        designUntouched: coverage.designUntouched,
        newTokenCount: coverage.newTokenCount,
        residualHex: {
          count: coverage.residualHexCount,
          summary: coverage.residualHexSummary,
        },
      }
    : "coverage scan failed",
  bundle: coverage ? coverage.bundle : { measuredOnNode22: false },
  note: `자율 완주 모드 — 사용자 확인 없이 끝까지 진행했다.
· 사용자 판단 필요 항목 → ${FOLLOWUP_DOC}
· 디자이너 결정 필요 항목 → ${DESIGN_REQUEST_DOC} (${DESIGN_ITEM_PREFIX} 시리즈, 디자인 ${DESIGN_REQUEST_VERSION} 요청서 형식)
· 디자인 무침습 원칙으로 진행했다: design/ 미수정 · 신규 토큰 0 · DockPanelId 미확장. 디자인 결정이 필요했던 지점은 기존 표면/선례로 잠정 처리하고 전부 요청서로 넘겼다.
· **A-3(Shader 노드 vertex/fragment 분리)은 명시적 범위 밖**이다. A-2(varying 브리지) 결과를 보고 계획서 §5 D-5를 판단하라.
· 번들 한도는 M0(T0-1)에서만 조정된다. 그 외 마일스톤에서 초과가 났다면 코드를 줄여야 하며, 한도 상향은 사용자 승인 사항이다.`,
}
